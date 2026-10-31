#!/usr/bin/env bash
# Restore drill: restore a dump (default: the newest) into a throwaway
# Postgres cluster started inside this container, then compare the row count
# of every table with the counts recorded at backup time (<dump>.counts).
#
# The throwaway cluster lives in RESTORE_SCRATCH_DIR (a tmpfs in compose),
# listens on a Unix socket only, and is deleted afterwards. The production
# database is never written to, and the restored data never touches disk.
#
# Usage: restore-drill.sh [DUMP_FILE_NAME]
# Exit codes: 0 counts match; 3 count mismatch; 4 no usable dump;
#             other non-zero: checksum/pg_restore/Postgres failure.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=common.sh
. "${BACKUP_LIB_DIR:-/usr/local/lib/backup}/common.sh"
JOB=${JOB:-restore-drill}

: "${RESTORE_SCRATCH_DIR:=/scratch}"

started=$(date +%s)

# --- Pick the dump and read the recorded counts ----------------------------
if [[ -n ${1:-} ]]; then
	dump="$BACKUP_DIR/$(basename "$1")"
else
	mapfile -t dumps < <(list_dumps)
	((${#dumps[@]} > 0)) || die "no dump in $BACKUP_DIR" 4
	dump=${dumps[-1]}
fi
[[ -r $dump ]] || die "dump not found: $dump" 4
base=${dump%.dump}
[[ -r $base.counts ]] || die "no recorded counts for $(basename "$dump")" 4
log "restoring $(basename "$dump")"

if [[ -r $base.sha256 ]]; then
	(cd "$BACKUP_DIR" && sha256sum -c "$(basename "$base").sha256" >/dev/null) ||
		die "checksum mismatch: $(basename "$dump") is corrupt"
	log "checksum OK"
fi

declare -A expected=()
while IFS='=' read -r table n; do
	[[ $table =~ ^[a-z_][a-z0-9_]*$ && $n =~ ^[0-9]+$ ]] || die "bad line in $base.counts: $table=$n" 4
	expected[$table]=$n
done <"$base.counts"
((${#expected[@]} > 0)) || die "$base.counts is empty" 4

# --- Throwaway cluster -----------------------------------------------------
mkdir -p "$RESTORE_SCRATCH_DIR"
scratch=$(mktemp -d "$RESTORE_SCRATCH_DIR/restore.XXXXXX")
pgdata=$scratch/data

cleanup() {
	if [[ -f $pgdata/postmaster.pid ]]; then
		pg_ctl -D "$pgdata" -m immediate -w stop >/dev/null 2>&1 || true
	fi
	rm -rf "$scratch"
}
trap cleanup EXIT

# The throwaway cluster must not inherit the production connection settings.
unset PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD PGPASSWORD_FILE PGSSLMODE
local_psql=(psql -X -q -A -t -v ON_ERROR_STOP=1 -h "$scratch" -U restore)

initdb -D "$pgdata" -U restore --auth=trust -E UTF8 --no-locale --no-sync >/dev/null
pg_ctl -D "$pgdata" -l "$scratch/postgres.log" -w -t 60 start \
	-o "-c listen_addresses='' -c unix_socket_directories='$scratch' -c fsync=off -c synchronous_commit=off -c full_page_writes=off" \
	>/dev/null || {
	cat "$scratch/postgres.log" >&2
	die "the throwaway Postgres did not start"
}
db=restore_drill
"${local_psql[@]}" -d postgres -c "CREATE DATABASE ${db};"

# --- Restore ---------------------------------------------------------------
# Objects are owned by the restore user: production roles do not exist here.
pg_restore --exit-on-error --no-owner --no-privileges -h "$scratch" -U restore -d "$db" "$dump"
log "restore complete; comparing row counts"

# --- Compare ---------------------------------------------------------------
mismatches=0
for table in $(printf '%s\n' "${!expected[@]}" | sort); do
	got=$("${local_psql[@]}" -d "$db" -c "SELECT count(*) FROM public.${table};")
	if [[ $got == "${expected[$table]}" ]]; then
		log "rows $table: restored=$got recorded=${expected[$table]} OK"
	else
		log "rows $table: restored=$got recorded=${expected[$table]} MISMATCH"
		mismatches=$((mismatches + 1))
	fi
done
version=$("${local_psql[@]}" -d "$db" -c "SELECT string_agg(version_num, ',') FROM public.alembic_version;" 2>/dev/null || true)
[[ -n $version ]] && log "schema revision (alembic): $version"

if ((mismatches > 0)); then
	die "restore drill FAILED: $mismatches table(s) differ ($(basename "$dump"))" 3
fi
log "restore drill OK in $(($(date +%s) - started))s: counts match ($(basename "$dump"))"
