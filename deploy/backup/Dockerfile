# syntax=docker/dockerfile:1
# Backup image: pg_dump on a schedule (supercronic), local retention, and a
# restore drill into a throwaway cluster. Based on postgres:18-alpine so the
# client tools (pg_dump, pg_restore) and the server binaries used by the drill
# (initdb, pg_ctl) match the production server's major version exactly.
# Multi-arch: linux/arm64 (Pi 5) and linux/amd64. See docs/deploy.md#backups.

ARG POSTGRES_IMAGE=postgres:18-alpine

FROM alpine:3.22 AS fetch
ARG TARGETARCH
# supercronic: https://github.com/aptible/supercronic/releases. The release
# publishes SHA-1 sums only; these SHA-256 values were computed from the
# release assets after checking them against those SHA-1 sums (same values as
# mauruiz20/finance-tracker's backup image).
ARG SUPERCRONIC_VERSION=0.2.51
ARG SUPERCRONIC_SHA256_AMD64=cc232108374e8e2b537045f2d5eaa1229f619db314c3ba6a14d38b35dc0aa123
ARG SUPERCRONIC_SHA256_ARM64=4ae22576a78223d8ccdf5f3b3660a5cbb5288416bf0ca96afc4a36d195932b94
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) cron_sha=$SUPERCRONIC_SHA256_AMD64 ;; \
      arm64) cron_sha=$SUPERCRONIC_SHA256_ARM64 ;; \
      *) echo "unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    cd /tmp; \
    wget -q -O supercronic "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/supercronic-linux-${TARGETARCH}"; \
    echo "${cron_sha}  supercronic" | sha256sum -c -; \
    install -m 0755 supercronic /usr/local/bin/supercronic

FROM ${POSTGRES_IMAGE}
# bash and tzdata already ship with the postgres image; listed so a base bump
# that drops them fails here instead of at 03:00.
RUN apk add --no-cache bash tzdata \
 && addgroup -S -g 10001 backup \
 && adduser -S -D -H -u 10001 -G backup -h /tmp -s /sbin/nologin backup \
 && install -d -o backup -g backup -m 0700 /backups /scratch

COPY --from=fetch /usr/local/bin/supercronic /usr/local/bin/
COPY common.sh /usr/local/lib/backup/common.sh
COPY entrypoint.sh backup.sh restore-drill.sh /usr/local/bin/
COPY crontab /etc/backup/crontab
RUN chmod 0644 /usr/local/lib/backup/common.sh /etc/backup/crontab \
 && chmod 0755 /usr/local/bin/entrypoint.sh /usr/local/bin/backup.sh /usr/local/bin/restore-drill.sh \
 && supercronic -test /etc/backup/crontab

ENV BACKUP_DIR=/backups \
    RESTORE_SCRATCH_DIR=/scratch \
    TMPDIR=/tmp \
    HOME=/tmp

USER 10001:10001
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["cron"]
