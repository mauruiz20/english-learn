# shellcheck shell=bash
# Shared helpers for the backup scripts. Sourced, never executed.

: "${BACKUP_DIR:=/backups}"
# Dumps are named <prefix>-<UTC timestamp>.dump, with a .counts sidecar.
: "${BACKUP_PREFIX:=english_learn}"

log() {
	printf '%s %s: %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "${JOB:-backup}" "$*"
}

# die MESSAGE [EXIT_CODE]
die() {
	log "ERROR: $1" >&2
	exit "${2:-1}"
}

# load_secret NAME: if NAME_FILE is set, export NAME with the file's contents
# (trailing newlines dropped). Lets every secret arrive as a Docker secret.
load_secret() {
	local name=$1 file_var="${1}_FILE" file
	file=${!file_var:-}
	[[ -n $file ]] || return 0
	[[ -r $file ]] || die "$file_var points to an unreadable file: $file"
	local value
	value=$(<"$file")
	[[ -n $value ]] || die "$file_var is empty: $file"
	export "$name=$value"
}

require_env() {
	local v
	for v in "$@"; do
		[[ -n ${!v:-} ]] || die "missing required setting: $v"
	done
}

# list_dumps: complete dumps in BACKUP_DIR, oldest first (the timestamp in the
# name sorts chronologically). Partial files start with a dot and never match.
list_dumps() {
	local f
	shopt -s nullglob
	for f in "$BACKUP_DIR/$BACKUP_PREFIX"-*.dump; do
		printf '%s\n' "$f"
	done | sort
	shopt -u nullglob
}
