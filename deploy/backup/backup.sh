#!/usr/bin/env bash
# One backup run:
#   1. open a read-only REPEATABLE READ transaction and export its snapshot;
#   2. count the rows of every table in the public schema inside that snapshot;
#   3. `pg_dump --format=custom --snapshot=<same snapshot>` into a hidden
#      partial file, then rename it to <prefix>-<UTC timestamp>.dump next to
#      its .counts and .sha256 sidecars;
#   4. retention: keep the newest BACKUP_KEEP dumps, delete older ones.
#
# Counts and dump read the same MVCC snapshot, so the recorded counts match
# the dump exactly even if the app writes meanwhile. The restore drill
# compares a restore against these counts, not against the live database.
# Retention counts files instead of ages: if backups fail for weeks, the last
# good dumps are kept, never aged out.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=common.sh
. "${BACKUP_LIB_DIR:-/usr/local/lib/backup}/common.sh"
JOB=${JOB:-backup}

: "${BACKUP_KEEP:=14}"

load_secret PGPASSWORD
require_env PGHOST PGUSER PGDATABASE PGPASSWORD
[[ $BACKUP_KEEP =~ ^[1-9][0-9]*$ ]] || die "BACKUP_KEEP must be a positive integer, got: $BACKUP_KEEP"
[[ -d $BACKUP_DIR && -w $BACKUP_DIR ]] || die "BACKUP_DIR is not a writable directory: $BACKUP_DIR"

umask 077
started=$(date +%s)
name="$BACKUP_PREFIX-$(date -u +%Y%m%dT%H%M%SZ)"
partial="$BACKUP_DIR/.$name.dump.partial"
dump="$BACKUP_DIR/$name.dump"

# --- 1. Snapshot-holding session -------------------------------------------
# psql runs as a coprocess for the whole dump: the exported snapshot only
# exists while its transaction is open. -q hides command tags, so only query
# results come back, one line each.
coproc PSQL { exec psql -X -q -A -t -v ON_ERROR_STOP=1 --no-password; }
# shellcheck disable=SC2153 # PSQL_PID is set by coproc.
psql_pid=$PSQL_PID
# Command substitutions do not inherit coproc fds, so work on duplicates and
# close the originals: otherwise psql never sees EOF on its stdin.
exec {to_psql}>&"${PSQL[1]}" {from_psql}<&"${PSQL[0]}"
eval "exec ${PSQL[1]}>&- ${PSQL[0]}<&-"

cleanup() {
	if [[ -n ${to_psql:-} ]]; then
		exec {to_psql}>&- 2>/dev/null || true
	fi
	kill "$psql_pid" 2>/dev/null || true
	rm -f "$partial" "$partial.counts" "$partial.sha256"
}
trap cleanup EXIT

send() { printf '%s\n' "$1" >&"$to_psql"; }

# query SQL: send one statement that returns exactly one row and print it.
query() {
	local line
	send "$1"
	IFS= read -r -t 60 -u "$from_psql" line || die "no answer from Postgres for: $1"
	printf '%s' "$line"
}

send 'BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;'
snapshot=$(query 'SELECT pg_export_snapshot();')
[[ -n $snapshot ]] || die "could not export a database snapshot"
log "database snapshot exported: $snapshot"

# --- 2. Row counts ---------------------------------------------------------
# One row: "table=count table=count ...", every ordinary table in public.
# query_to_xml runs each count inside this same transaction (same snapshot).
counts=$(query "SELECT coalesce(string_agg(c.relname || '=' ||
  (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname),
    false, true, '')))[1]::text, ' ' ORDER BY c.relname), '')
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relkind = 'r';")
[[ -n $counts ]] || die "the public schema has no tables; run the migrations first"
: >"$partial.counts"
for pair in $counts; do
	[[ $pair =~ ^[a-z_][a-z0-9_]*=[0-9]+$ ]] || die "unexpected count: $pair"
	printf '%s\n' "$pair" >>"$partial.counts"
	log "rows $pair"
done

# --- 3. Dump ---------------------------------------------------------------
log "dumping ${PGDATABASE}@${PGHOST} to $dump"
pg_dump --format=custom --snapshot="$snapshot" --no-password --file="$partial"

send 'COMMIT;'
exec {to_psql}>&-
to_psql=
wait "$psql_pid" || die "the snapshot session ended with an error"

# `sha256sum -c <name>.sha256` from BACKUP_DIR verifies the dump.
hash=$(sha256sum <"$partial")
printf '%s  %s\n' "${hash%% *}" "$name.dump" >"$partial.sha256"
mv "$partial.counts" "$BACKUP_DIR/$name.counts"
mv "$partial.sha256" "$BACKUP_DIR/$name.sha256"
mv "$partial" "$dump"
size=$(wc -c <"$dump")
log "dump saved: $dump (${size// /} bytes)"

# --- 4. Retention ----------------------------------------------------------
mapfile -t dumps < <(list_dumps)
excess=$((${#dumps[@]} - BACKUP_KEEP))
for ((i = 0; i < excess; i++)); do
	old=${dumps[i]%.dump}
	rm -f "$old.dump" "$old.counts" "$old.sha256"
	log "retention: deleted $(basename "$old").dump"
done
kept=$((${#dumps[@]} < BACKUP_KEEP ? ${#dumps[@]} : BACKUP_KEEP))
log "retention: $kept dump(s) kept (BACKUP_KEEP=$BACKUP_KEEP)"

log "backup OK in $(($(date +%s) - started))s ($name.dump)"
