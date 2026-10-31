# Deploying the API to the Raspberry Pi 5

The Pi runs the stack in `deploy/compose.yml` with images that CI builds and
pushes to GHCR. Nothing is built on the Pi, and no port is published: all
traffic enters through the Cloudflare Tunnel. The web app stays on Cloudflare
Pages (`https://english.maumar.com.ar`); only `services/api` and its database
run here, next to the finance-tracker and monogestor stacks.

## Quick path

1. [Prepare the Pi](#1-prepare-the-pi): data directories on the NVMe (Docker
   and the NVMe are already in place).
2. [Get the deploy files](#2-get-the-deploy-files) and set `deploy/.env`.
3. [Create the secrets](#3-create-the-secrets) in `deploy/secrets/`.
4. [Create the tunnel](#4-cloudflare-tunnel) `english-learn` and route
   `${PUBLIC_API_HOSTNAME}` to `http://api:8000`.
5. Start it:

   ```sh
   cd ~/english-learn/deploy
   docker compose pull && docker compose up -d
   docker compose ps -a      # postgres, api (healthy); migrate Exited (0)
   ```

6. [Check it](#5-check-it) from outside: `https://${PUBLIC_API_HOSTNAME}/healthz`.

## How it fits together

| Service       | Image                                  | Networks        | Notes                                                                                                 |
| ------------- | -------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| `postgres`    | `postgres:18`                          | backend         | Data on `${DATA_DIR}/postgres` (NVMe). Password from a secret.                                        |
| `migrate`     | `ghcr.io/<owner>/english-learn-api`    | backend         | One-shot `alembic upgrade head`; the api starts only after it exits 0.                                |
| `api`         | `ghcr.io/<owner>/english-learn-api`    | backend, egress | FastAPI on `:8000`, non-root (uid 10001), read-only. Needs egress for Google's ID token signing keys. |
| `cloudflared` | `cloudflare/cloudflared` (pinned)      | backend, tunnel | Outbound-only tunnel; the single entry point. Starts once the api is healthy.                         |
| `backup`      | `ghcr.io/<owner>/english-learn-backup` | backend         | Nightly `pg_dump` to `${DATA_DIR}/backups`, monthly restore drill ([Backups](#backups)).              |

- `backend` is an `internal` network: nothing on it can reach the internet or
  the LAN. Only the api (Google's keys) and cloudflared (Cloudflare's edge)
  get a route out, each on its own network (`egress`, `tunnel`), so the two
  share only `backend`.
- `backend` has a pinned subnet (`BACKEND_SUBNET`). cloudflared therefore
  always reaches the api from that range, and the api trusts
  `X-Forwarded-For` only from it (`FORWARDED_ALLOW_IPS`). See
  [Client IPs](#client-ips-behind-the-tunnel).
- Every service has `restart: unless-stopped` (migrate: `no`), log rotation
  (3 x 10 MB per container), and CPU/memory limits sized to leave room for
  the other two stacks on the 8 GB Pi:

  | Service     | CPUs | Memory | Measured idle |
  | ----------- | ---- | ------ | ------------- |
  | postgres    | 1    | 512 MB | ~80 MB        |
  | api         | 1    | 256 MB | ~80 MB        |
  | migrate     | 1    | 256 MB | exits         |
  | cloudflared | 0.5  | 128 MB | n/a           |
  | backup      | 1    | 384 MB | ~15 MB        |

- api, migrate, cloudflared and backup run read-only, with every capability
  dropped and `no-new-privileges`.
- Images are multi-arch (`linux/arm64` for the Pi, `linux/amd64` for local
  use). The release workflow (`.github/workflows/release.yml`) builds both
  images on every run that touches `services/api/**` or `deploy/backup/**`,
  and tags them `sha-<7 chars>`, `latest` on `main`, and `<version>` /
  `<major>.<minor>` on `v*` git tags.

## 1. Prepare the Pi

The Pi already runs Debian 13 (aarch64) from the NVMe, with Docker 26 and
Compose 2.26 (finance-tracker's `docs/deploy.md` covers installing both). The
only step left is the data directory:

```sh
sudo mkdir -p /mnt/nvme/english-learn/postgres
sudo install -d -o 10001 -g 10001 -m 700 /mnt/nvme/english-learn/backups
sudo chmod 700 /mnt/nvme/english-learn
```

The postgres image creates its data files on first start and fixes their
ownership itself (uid 999). The backup container runs as uid 10001 and
writes to `backups/`, so that directory must belong to it; if Docker creates
it instead (owned by root), the nightly backup fails with
`BACKUP_DIR is not a writable directory`.

## 2. Get the deploy files

Only the `deploy/` directory is needed on the Pi. A sparse checkout keeps the
rest of the monorepo off it:

```sh
git clone --filter=blob:none --sparse https://github.com/mauruiz20/english-learn.git ~/english-learn
cd ~/english-learn
git sparse-checkout set deploy
cd deploy
cp .env.example .env    # review every value; keep DATA_DIR on the NVMe
```

`deploy/.env` holds no secrets, only settings:

| Variable              | Example                                    | Used for                                                                                                                              |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GHCR_OWNER`          | `mauruiz20`                                | Image namespace (lowercase).                                                                                                          |
| `IMAGE_TAG`           | `sha-1a2b3c4`                              | Build to run ([Updates](#updates-and-rollback)).                                                                                      |
| `DATA_DIR`            | `/mnt/nvme/english-learn`                  | Postgres data and backups, on the NVMe.                                                                                               |
| `PUBLIC_API_HOSTNAME` | `english-api.maumar.com.ar`                | The tunnel hostname (configured in Cloudflare, used by the checks below). Pending confirmation.                                       |
| `CORS_ORIGINS`        | `https://english.maumar.com.ar`            | Browser origins allowed to call the api. With `ENV=production` the api refuses to start without it, and accepts only `https` origins. |
| `GOOGLE_CLIENT_IDS`   | `78200832989-….apps.googleusercontent.com` | Accepted `aud` of Google ID tokens. Public values.                                                                                    |
| `BACKEND_SUBNET`      | `10.217.0.0/24`                            | Subnet of the internal network; the api trusts forwarded headers only from it.                                                        |
| `BACKUP_KEEP`         | `14`                                       | Nightly dumps kept.                                                                                                                   |

`BACKEND_SUBNET` must not overlap another Docker network or the LAN. Check
the subnets already in use before the first start:

```sh
docker network inspect $(docker network ls -q) \
  --format '{{.Name}} {{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

If the GHCR packages are private, log in once with a classic personal access
token that only has `read:packages`:

```sh
echo '<token>' | docker login ghcr.io -u <github-user> --password-stdin
```

## 3. Create the secrets

Four files in `deploy/secrets/`, all git-ignored (`deploy/.gitignore`), each
mounted read-only at `/run/secrets/<name>` in the services that declare it:

| File                | Read by                                                         | Contents                                                              |
| ------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| `postgres_password` | postgres (`POSTGRES_PASSWORD_FILE`), backup (`PGPASSWORD_FILE`) | The database password, no trailing newline.                           |
| `database_url`      | migrate, api (`DATABASE_URL_FILE`)                              | `postgresql://english_learn:<password>@postgres:5432/english_learn`   |
| `jwt_secret`        | api (`JWT_SECRET_FILE`)                                         | The access-token signing key: at least 32 bytes, 16 of them distinct. |
| `tunnel_token`      | cloudflared (`TUNNEL_TOKEN_FILE`)                               | The Cloudflare Tunnel token ([section 4](#4-cloudflare-tunnel)).      |

```sh
cd ~/english-learn/deploy
mkdir -p secrets
umask 077
PW=$(openssl rand -hex 32)
printf '%s' "$PW" > secrets/postgres_password
printf 'postgresql://english_learn:%s@postgres:5432/english_learn' "$PW" > secrets/database_url
unset PW
openssl rand -base64 48 | tr -d '\n' > secrets/jwt_secret
printf '%s' '<tunnel token from the Cloudflare dashboard>' > secrets/tunnel_token
chmod 700 secrets
chmod 444 secrets/postgres_password secrets/database_url secrets/jwt_secret secrets/tunnel_token
```

- Why `444`: Compose bind-mounts these files with their host ownership and
  mode, and the containers run as non-root users (postgres uid 999, api and
  backup uid 10001, cloudflared uid 65532). The `700` directory keeps other
  host users out.
- `-hex` keeps the password URL-safe inside `database_url`; `@`, `/` or `:`
  would need percent-encoding there.
- The Postgres password only takes effect on the first start with an empty
  data directory; changing it later needs `ALTER USER` as well.
- Store a copy of each in your password manager. Changing `jwt_secret`
  invalidates every access token signed with the old one.

**How the api gets them.** The api reads `DATABASE_URL` and `JWT_SECRET` from
its environment and has no `*_FILE` support yet. `compose.yml` gives api and
migrate a small `secret-env` entrypoint that reads the files named by
`DATABASE_URL_FILE` / `JWT_SECRET_FILE` and exports their contents into the
environment of the process it then starts. The values never appear in
`compose.yml`, `.env` or `docker inspect` (the smoke test checks this). It
goes away once the api reads `*_FILE` itself ([Follow-ups](#follow-ups)).

## 4. Cloudflare Tunnel

1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel**
   → _Cloudflared_. Name it `english-learn` (separate from the other stacks'
   tunnels, so each stack can be stopped on its own).
2. Copy the token from the install command (the long string after `--token`)
   into `deploy/secrets/tunnel_token`. Ignore the install command itself: the
   `cloudflared` container runs the connector.
3. Add one **public hostname** route:

   | Hostname                 | Path      | Service           |
   | ------------------------ | --------- | ----------------- |
   | `${PUBLIC_API_HOSTNAME}` | _(empty)_ | `http://api:8000` |

**Use a single-level subdomain** such as `english-api.maumar.com.ar`, not
`api.english.maumar.com.ar`. Cloudflare's free Universal SSL certificate
covers the apex and one level below it (`*.maumar.com.ar`); a second level
gets no edge certificate, and browsers fail the TLS handshake unless you buy
Advanced Certificate Manager.

No Cloudflare Access in front of this hostname: the web app calls it
cross-origin from the browser, and the api authenticates every request
itself (Google sign-in, then its own JWTs). CORS limits browsers to
`CORS_ORIGINS`.

### Client IPs behind the tunnel

The api rate-limits sign-in and refresh per client IP. Behind the tunnel the
TCP peer is always cloudflared, so the real address has to come from a
header:

- Cloudflare's edge sets `CF-Connecting-IP` to the client address and
  appends it to `X-Forwarded-For`. cloudflared passes both through.
- uvicorn (`--proxy-headers`) honors `X-Forwarded-For` only from peers in
  `FORWARDED_ALLOW_IPS` (here the backend subnet, which only our containers
  join) and takes the rightmost untrusted address: the one Cloudflare
  appended. A client cannot pick its own address by sending a fake
  `X-Forwarded-For`, because Cloudflare's entry is always last.
- `CF-Connecting-IP` is the header Cloudflare documents as the client
  address, and it is a single value. Reading it would remove the dependence
  on `X-Forwarded-For` ordering; that is an api change, listed in
  [Follow-ups](#follow-ups).

## 5. Check it

```sh
cd ~/english-learn/deploy
docker compose ps -a                         # migrate: Exited (0); others Up (healthy)
docker compose logs migrate                  # "Running upgrade ... -> <rev>"
docker compose logs --tail 50 api cloudflared
curl -s https://english-api.maumar.com.ar/healthz   # {"status":"ok"}
```

`/healthz` answers 200 only when the api can reach Postgres. Note that it is
reachable through the tunnel too; it reveals nothing beyond up/down.

## Backups

The `backup` service (`deploy/backup/`, image `english-learn-backup`) runs
two jobs with supercronic, in `America/Argentina/Buenos_Aires` time:

| Job             | When                     | What                                                                                                                                                                                                                            |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backup`        | Daily 02:45              | Exports a snapshot, records every table's row count in it, and `pg_dump --format=custom` of that same snapshot to `${DATA_DIR}/backups/english_learn-<UTC>.dump` (+ `.counts`, `.sha256`). Keeps the newest `BACKUP_KEEP` (14). |
| `restore-drill` | 04:45 on the 2nd monthly | Verifies the newest dump's checksum, restores it into a throwaway Postgres in a RAM tmpfs inside the backup container, and compares every table's row count with the recorded one.                                              |

Retention counts dumps instead of ages: if backups fail for weeks, the last
good ones are never aged out. The dump is written to a hidden partial file
and renamed only when complete. finance-tracker backs up at 03:30, so the two
jobs never overlap.

Run them by hand, and read the results:

```sh
docker compose exec backup entrypoint.sh backup
docker compose exec backup entrypoint.sh restore-drill            # newest dump
docker compose exec backup entrypoint.sh restore-drill english_learn-20261031T054500Z.dump
docker compose exec backup entrypoint.sh list
docker compose logs --since 48h backup | rg 'OK|ERROR|FAILED'
```

The drill exits 0 when the counts match, 3 on a mismatch and 4 when there is
no usable dump. It never touches the production database.

**These dumps live on the same NVMe as the database.** They protect against
bad migrations, mistakes and corruption, not against losing the Pi or the
disk. Copy them off the Pi (or add an off-site restic/R2 job like
finance-tracker's) before the data matters ([Follow-ups](#follow-ups)).

### Restore into production

Restoring replaces the live data with the dump's. Stop the writers first,
then restore with `--clean`:

```sh
cd ~/english-learn/deploy
NAME=english_learn-20261031T054500Z
DUMP=/mnt/nvme/english-learn/backups/$NAME.dump
(cd /mnt/nvme/english-learn/backups && sudo sha256sum -c "$NAME.sha256")   # "OK"
docker compose stop cloudflared api
sudo cat "$DUMP" | docker compose exec -T postgres \
  pg_restore --clean --if-exists --no-owner --exit-on-error -U english_learn -d english_learn
docker compose up -d                      # migrate runs, then api and cloudflared
docker compose logs migrate api
```

If the dump comes from an older release, `migrate` brings its schema up to
the running image's head. Restoring onto a fresh Pi is the same procedure
after [sections 1 to 3](#1-prepare-the-pi): start only the database
(`docker compose up -d postgres`), restore, then `docker compose up -d`.

## Updates and rollback

`IMAGE_TAG` in `deploy/.env` decides what runs. Pin a specific build in
production instead of following `latest`:

```sh
# Update: pick the sha-<7 chars> tag of a release run (GHCR package page or CI run)
sd '^IMAGE_TAG=.*' 'IMAGE_TAG=sha-1a2b3c4' .env
docker compose pull && docker compose up -d
docker compose ps -a && docker compose logs --tail 50 migrate api

# Rollback: set the previous tag and repeat
sd '^IMAGE_TAG=.*' 'IMAGE_TAG=sha-0f9e8d7' .env
docker compose pull && docker compose up -d
```

- Write the running tag down before updating; it is your rollback target.
- Only commits that touch `services/api/**` or `deploy/backup/**` (or the
  workflow) get images. Take tags from release runs, not from any commit.
- `migrate` runs on every `up -d` and applies only upgrades. If it fails, the
  api is not recreated and the previous container keeps serving; read
  `docker compose logs migrate`.
- Rolling back across a schema change needs the down migration
  (`docker compose run --rm migrate alembic downgrade <rev>`, with the
  _newer_ image still in `.env`) or a [restore](#restore-into-production).
  Check the release's migrations before rolling back.
- Take a backup before risky updates:
  `docker compose exec backup entrypoint.sh backup`.
- Clean up old images now and then: `docker image prune -a --filter until=720h`.

## Local check of the stack

`deploy/test/smoke.sh` runs the production `compose.yml` with
`compose.test.yml` layered on top (images built from the local Dockerfiles,
database and backups in tmpfs, throwaway secrets, no cloudflared):

```sh
deploy/test/smoke.sh
```

It checks that migrate exits 0 and the schema is at head, that
`http://api:8000/healthz` answers 200 from another container on the backend
network, that no secret value shows in `docker inspect`, that the api runs
non-root on a read-only root filesystem, that backend-only containers have no
route out, and that a backup followed by the restore drill matches its
recorded counts. Then it tears everything down. Build the Pi's architecture
explicitly with `docker build --platform linux/arm64 services/api`.

## Troubleshooting

| Symptom                                                                             | Likely cause and fix                                                                                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `docker compose up` fails with `Pool overlaps with other one on this address space` | `BACKEND_SUBNET` collides with another network. Pick a free one ([section 2](#2-get-the-deploy-files)).                                    |
| api never starts; `migrate` shows `Exited (1)`                                      | `docker compose logs migrate`. Usually a wrong `database_url` or a failing migration.                                                      |
| api restarts with a settings error                                                  | `docker compose logs api`. `ENV=production requires CORS_ORIGINS…`, `JWT_SECRET must have at least 32 bytes`, or `secret-env: … is empty`. |
| `password authentication failed`                                                    | `postgres_password` and `database_url` disagree, or the password changed after the first start (see [section 3](#3-create-the-secrets)).   |
| Tunnel shows _Inactive_ in the dashboard                                            | `docker compose logs cloudflared`: bad token, or the api is not healthy yet (cloudflared waits for it).                                    |
| Browser shows a TLS error for the hostname                                          | Two-level subdomain; use a single-level one ([section 4](#4-cloudflare-tunnel)).                                                           |
| Browser calls fail with a CORS error                                                | The web origin is missing from `CORS_ORIGINS`; edit `.env`, then `docker compose up -d`.                                                   |
| Every client shares one rate-limit bucket                                           | Forwarded headers are not trusted: the peer is outside `BACKEND_SUBNET`. Check `docker network inspect english-learn_backend`.             |
| Backup log: `BACKUP_DIR is not a writable directory`                                | `${DATA_DIR}/backups` is not owned by uid 10001 ([section 1](#1-prepare-the-pi)).                                                          |

## Follow-ups

Required in the api (`services/api`), not done here:

- [ ] **`*_FILE` secrets.** Read `DATABASE_URL_FILE` and `JWT_SECRET_FILE`
      (trailing newline trimmed) before falling back to the plain variables,
      for `DatabaseSettings` and `Settings` alike (alembic uses the former).
      pydantic-settings' `secrets_dir="/run/secrets"` is an alternative with
      no parsing code, but ties file names to field names. Then delete the
      `secret-env` entrypoint from `compose.yml` (keep the `*_FILE` variables).
- [ ] **Client IP from `CF-Connecting-IP`.** Behind Cloudflare, take the
      client address from `CF-Connecting-IP` when the peer is a trusted proxy,
      instead of relying on the order of `X-Forwarded-For`
      ([Client IPs](#client-ips-behind-the-tunnel)).

Operations:

- [ ] Confirm `PUBLIC_API_HOSTNAME` (`english-api.maumar.com.ar` assumed) and
      point the web app's API base URL at it.
- [ ] Off-site copies of the dumps (restic to R2, as finance-tracker does).
