#!/bin/bash
set -euo pipefail

# Daily off-site backup → ASUSTOR NAS via rsync daemon, over Tailscale.
#
# Produces a full archive via migrate-export.sh (Postgres dump + MinIO
# data), prunes old copies to KEEP_LOCAL, then mirrors the kept set to a
# per-service folder on the NAS. The mirror uses --delete, so the off-site
# copy is bounded to KEEP_LOCAL too — it never grows without limit.
# The NAS is reached over Tailscale, so the transport is encrypted even
# though the rsync daemon protocol itself is plaintext.
#
# Optional env overrides:
#   COMPOSE_FILE          compose file to target   (default: docker-compose.prod.yml)
#   KEEP_LOCAL            archives to retain, local and NAS (default: 14)
#   NAS_DEST              rsync daemon module URL (a /audax/ subdir is used)
#   RSYNC_PASSWORD_FILE   file holding the rsync module password (chmod 600)
#
# Cron (3chan user, 04:10 daily):
#   10 4 * * * /srv/audax/scripts/backup-to-nas.sh >> /var/log/audax-backup.log 2>&1

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
KEEP_LOCAL="${KEEP_LOCAL:-14}"
NAS_DEST="${NAS_DEST:-rsync://3chan@100.75.89.101/hetzner}"
RSYNC_PASSWORD_FILE="${RSYNC_PASSWORD_FILE:-${PROJECT_DIR}/.rsync-pass}"

echo "[backup-to-nas] $(date -Is) starting (compose: ${COMPOSE_FILE})"

# 1. Create a fresh archive using the existing export script.
"${SCRIPT_DIR}/migrate-export.sh"

# 2. Prune local archives first, keeping the most recent KEEP_LOCAL.
ls -t "${PROJECT_DIR}/backups"/audax-backup-*.tar.gz \
  | tail -n +"$((KEEP_LOCAL + 1))" \
  | xargs -r rm -v

# 3. Mirror the kept archives to the NAS subfolder. --delete prunes the
#    NAS to match the local set, so off-site storage stays bounded.
rsync -a --delete --partial --password-file="${RSYNC_PASSWORD_FILE}" \
  --include='audax-backup-*.tar.gz' --exclude='*' \
  "${PROJECT_DIR}/backups/" "${NAS_DEST}/audax/"
echo "[backup-to-nas] mirrored to ${NAS_DEST}/audax/ (keeping ${KEEP_LOCAL})"

echo "[backup-to-nas] $(date -Is) done"
