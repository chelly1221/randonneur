#!/bin/bash
set -euo pipefail

# Daily off-site backup → local NAS (reached over Tailscale).
#
# Produces a full archive via migrate-export.sh (Postgres dumps + MinIO
# data), rsyncs it to the NAS, then prunes old local copies.
#
# Required env:
#   NAS_DEST    rsync target on the NAS, e.g. audax@nas-ts:/volume1/backup/audax
# Optional env:
#   COMPOSE_FILE  compose file to target  (default: docker-compose.prod.yml)
#   KEEP_LOCAL    local archives to retain (default: 3)
#
# Cron example (run as the deploy user, 04:10 daily):
#   10 4 * * * NAS_DEST=audax@nas-ts:/volume1/backup/audax \
#     /srv/audax/scripts/backup-to-nas.sh >> /var/log/audax-backup.log 2>&1

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
KEEP_LOCAL="${KEEP_LOCAL:-3}"
NAS_DEST="${NAS_DEST:?Set NAS_DEST, e.g. audax@nas-ts:/volume1/backup/audax}"

echo "[backup-to-nas] $(date -Is) starting (compose: ${COMPOSE_FILE})"

# 1. Create a fresh archive using the existing export script.
"${SCRIPT_DIR}/migrate-export.sh"

# 2. Locate the newest archive it produced.
ARCHIVE=$(ls -t "${PROJECT_DIR}/backups"/backup-*.tar.gz | head -1)
echo "[backup-to-nas] archive: ${ARCHIVE}"

# 3. Push to the NAS over Tailscale (rsync over SSH).
rsync -av --partial "${ARCHIVE}" "${NAS_DEST}/"
echo "[backup-to-nas] uploaded to ${NAS_DEST}"

# 4. Prune local archives, keeping the most recent KEEP_LOCAL.
ls -t "${PROJECT_DIR}/backups"/backup-*.tar.gz \
  | tail -n +"$((KEEP_LOCAL + 1))" \
  | xargs -r rm -v

echo "[backup-to-nas] $(date -Is) done"
