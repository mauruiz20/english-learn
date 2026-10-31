#!/usr/bin/env bash
# Smoke test of the production stack (deploy/compose.yml + compose.test.yml),
# built from the local Dockerfiles for the host's architecture:
#
#   1. throwaway secrets and env file; build the api and backup images;
#   2. `up --wait`: postgres healthy, migrate exits 0, api and backup healthy;
#   3. migrations are at head;
#   4. GET http://api:8000/healthz answers 200 from another container on the
#      backend network (the path cloudflared takes);
#   5. hardening: secrets are absent from `docker inspect`, the api's root fs is
#      read-only, it runs as non-root, and backend has no route out;
#   6. backup, then the restore drill restores it and the counts match;
#   7. resource usage snapshot; tear everything down.
#
# Run from anywhere: deploy/test/smoke.sh. Needs Docker with Compose >= 2.24.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
deploy=$(cd "$here/.." && pwd)

work=$(mktemp -d)
SECRETS_DIR=$work/secrets
export SECRETS_DIR
export COMPOSE_PROJECT_NAME=english-learn-smoke-$$
mkdir -p "$SECRETS_DIR"

dc() {
	docker compose --env-file "$work/env" -f "$deploy/compose.yml" -f "$deploy/compose.test.yml" "$@"
}

cleanup() {
	local rc=$?
	if ((rc != 0)); then
		echo "--- smoke test FAILED (exit $rc); service logs:" >&2
		dc logs --no-color --tail 50 >&2 || true
	fi
	dc down -v --remove-orphans >/dev/null 2>&1 || true
	rm -rf "$work"
	exit "$rc"
}
trap cleanup EXIT

step() { printf '\n=== %s\n' "$*"; }
fail() {
	echo "ASSERTION FAILED: $*" >&2
	exit 1
}
expect_in() { [[ $1 == *"$2"* ]] || fail "expected output to contain: $2"; }

step "throwaway secrets and settings"
umask 022 # the files are mounted into non-root containers
pw=$(openssl rand -hex 16)
printf '%s' "$pw" >"$SECRETS_DIR/postgres_password"
printf 'postgresql://english_learn:%s@postgres:5432/english_learn' "$pw" >"$SECRETS_DIR/database_url"
openssl rand -base64 48 | tr -d '\n' >"$SECRETS_DIR/jwt_secret"
printf '%s' "not-a-real-tunnel-token" >"$SECRETS_DIR/tunnel_token"
cat >"$work/env" <<EOF
GHCR_OWNER=local
IMAGE_TAG=test
CORS_ORIGINS=https://english.example.test
GOOGLE_CLIENT_IDS=test-client.apps.googleusercontent.com
BACKEND_SUBNET=${SMOKE_BACKEND_SUBNET:-10.217.250.0/24}
EOF

step "build images"
dc build migrate backup

step "start postgres, migrate, api and backup (not cloudflared)"
dc up -d --wait --wait-timeout 120 api backup
migrate_exit=$(docker inspect -f '{{.State.ExitCode}}' "$(dc ps -a -q migrate)")
[[ $migrate_exit == 0 ]] || fail "migrate exited $migrate_exit"
dc ps -a

step "migrations are at head"
current=$(dc run --rm --no-deps -T migrate alembic current 2>&1)
printf '%s\n' "$current"
expect_in "$current" "(head)"

step "GET /healthz through the backend network"
status=$(dc run --rm --no-deps -T --entrypoint python api -c \
	"import urllib.request; print(urllib.request.urlopen('http://api:8000/healthz', timeout=5).status)")
[[ $status == 200 ]] || fail "/healthz answered $status"
echo "/healthz: $status"

step "hardening"
api_id=$(dc ps -q api)
api_env=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$api_id")
[[ $api_env != *"$pw"* ]] || fail "the database password is visible in docker inspect"
[[ $api_env != *"$(cat "$SECRETS_DIR/jwt_secret")"* ]] || fail "the JWT secret is visible in docker inspect"
echo "no secret values in docker inspect"
uid=$(dc exec -T api id -u)
[[ $uid != 0 ]] || fail "api runs as root"
echo "api uid: $uid"
if dc exec -T api touch /app/written 2>/dev/null; then
	fail "the api root filesystem is writable"
fi
echo "api root fs is read-only"
if dc exec -T api python -c \
	"import socket; socket.create_connection(('1.1.1.1', 443), timeout=3)" 2>/dev/null; then
	echo "api reaches the internet (egress network) as intended"
else
	echo "warning: api has no outbound internet (Google key fetches would fail)" >&2
fi
if dc run --rm --no-deps -T --entrypoint python migrate -c \
	"import socket; socket.create_connection(('1.1.1.1', 443), timeout=3)" 2>/dev/null; then
	fail "a backend-only container reached the internet"
fi
echo "backend-only containers have no route out"

step "seed a row, back up, restore drill"
dc exec -T postgres psql -X -q -v ON_ERROR_STOP=1 -U english_learn -d english_learn -c \
	"INSERT INTO users (id, google_sub, email) VALUES (gen_random_uuid(), 'smoke-sub', 'smoke@example.test');"
out=$(dc exec -T backup entrypoint.sh backup 2>&1)
printf '%s\n' "$out"
expect_in "$out" "rows users=1"
expect_in "$out" "backup OK"
out=$(dc exec -T backup entrypoint.sh restore-drill 2>&1)
printf '%s\n' "$out"
expect_in "$out" "checksum OK"
expect_in "$out" "rows users: restored=1 recorded=1 OK"
expect_in "$out" "restore drill OK"
dc exec -T backup entrypoint.sh list

step "crontab"
dc exec -T backup supercronic -test /etc/backup/crontab

step "resource usage"
# Container ids never contain spaces; word splitting is intended (bash 3.2 on
# macOS has no mapfile).
# shellcheck disable=SC2046
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $(dc ps -q)

printf '\nsmoke test: PASS\n'
