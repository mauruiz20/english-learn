#!/usr/bin/env bash
# Entry point of the backup container.
#
#   cron            (default) run the schedule in /etc/backup/crontab
#   backup          one backup now (pg_dump to BACKUP_DIR, then retention)
#   restore-drill   restore a dump (default: the newest) into a throwaway
#                   Postgres and compare row counts with the recorded ones
#   list            list the dumps in BACKUP_DIR
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=common.sh
. "${BACKUP_LIB_DIR:-/usr/local/lib/backup}/common.sh"

cmd=${1:-cron}
[[ $# -gt 0 ]] && shift

case $cmd in
cron)
	export JOB=cron
	log "starting scheduler (TZ=${TZ:-UTC})"
	exec supercronic -passthrough-logs /etc/backup/crontab
	;;
backup)
	export JOB=backup
	exec backup.sh "$@"
	;;
restore-drill)
	export JOB=restore-drill
	exec restore-drill.sh "$@"
	;;
list)
	exec ls -l "$BACKUP_DIR"
	;;
*)
	die "unknown command: $cmd (expected cron, backup, restore-drill or list)" 64
	;;
esac
