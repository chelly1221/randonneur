#!/bin/bash
set -euo pipefail

# Daily off-site backup → ASUSTOR NAS via rsync daemon, over Tailscale.
#
# Produces a full archive via migrate-export.sh (Postgres dump + MinIO
# data), pushes it to the NAS rsync module, then prunes old local copies.
# The NAS is reached over Tailscale, so the transport is encrypted even
# though the rsync daemon protocol itself is plaintext.
#
# Optional env overrides:
#   COMPOSE_FILE          compose file to target   (default: docker-compose.prod.yml)
#   KEEP_LOCAL            local archives to retain (default: 3)
#   NAS_DEST              rsync daemon module URL
#   RSYNC_PASSWORD_FILE   file holding the rsync module password (chmod 600)
#
# Cron (3chan user, 04:10 daily):
#   10 4 * * * /srv/audax/scripts/backup-to-nas.sh >> /var/log/audax-backup.log 2>&1

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
KEEP_LOCAL="${KEEP_LOCAL:-3}"
NAS_DEST="${NAS_DEST:-rsync://3chan@100.75.89.101/hetzner}"
RSYNC_PASSWORD_FILE="${RSYNC_PASSWORD_FILE:-${PROJECT_DIR}/.rsync-pass}"

echo "[backup-to-nas] $(date -Is) starting (compose: ${COMPOSE_FILE})"

# 1. Create a fresh archive using the existing export script.
"${SCRIPT_DIR}/migrate-export.sh"

# 2. Locate the newest archive it produced.
ARCHIVE=$(ls -t "${PROJECT_DIR}/backups"/backup-*.tar.gz | head -1)
echo "[backup-to-nas] archive: ${ARCHIVE}"

# 3. Push to the NAS rsync module (transport encrypted by Tailscale).
rsync -av --partial --password-file="${RSYNC_PASSWORD_FILE}" \
  "${ARCHIVE}" "${NAS_DEST}/"
echo "[backup-to-nas] uploaded to ${NAS_DEST}"

# 4. Prune local archives, keeping the most recent KEEP_LOCAL.
ls -t "${PROJECT_DIR}/backups"/backup-*.tar.gz \
  | tail -n +"$((KEEP_LOCAL + 1))" \
  | xargs -r rm -v

echo "[backup-to-nas] $(date -Is) done"
