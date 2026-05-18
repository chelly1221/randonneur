#!/bin/bash
set -euo pipefail

# Automatic daily backup script for Audax 3chan
# Install as cron job:  0 4 * * * /mnt/audax/scripts/auto-backup.sh >> /mnt/audax/backups/auto-backup.log 2>&1
#
# Keeps the last 7 backups, deletes older ones.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUPS_DIR="${PROJECT_DIR}/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="auto-backup-${TIMESTAMP}"
BACKUP_DIR="${BACKUPS_DIR}/${BACKUP_NAME}"
MAX_BACKUPS=7

# Load .env
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
  key=$(echo "$key" | xargs)
  export "$key"="$value"
done < "${PROJECT_DIR}/.env"

echo "[$(date)] Starting auto-backup..."

# Check containers
if ! docker compose -f "${PROJECT_DIR}/docker-compose.yml" ps --status running postgres 2>/dev/null | grep -q postgres; then
  echo "[$(date)] ERROR: postgres not running, skipping backup"
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

# 1. PostgreSQL randonneur
echo "[$(date)] Backing up randonneur database..."
docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --format=custom \
  > "${BACKUP_DIR}/randonneur.dump"

# 2. MinIO data
echo "[$(date)] Backing up MinIO data..."
mkdir -p "${BACKUP_DIR}/minio-data"
if docker compose -f "${PROJECT_DIR}/docker-compose.yml" ps --status running minio 2>/dev/null | grep -q minio; then
  docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T minio \
    mc alias set local http://localhost:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" --quiet 2>/dev/null || true
  if docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T minio mc ls local/gpx-files >/dev/null 2>&1; then
    docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T minio \
      mc mirror --quiet local/gpx-files /tmp/minio-export 2>/dev/null || true
    docker compose -f "${PROJECT_DIR}/docker-compose.yml" cp minio:/tmp/minio-export/. "${BACKUP_DIR}/minio-data/" 2>/dev/null || true
    docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T minio rm -rf /tmp/minio-export 2>/dev/null || true
  fi
fi

# 4. .env backup
cp "${PROJECT_DIR}/.env" "${BACKUP_DIR}/env.bak"

# 5. Create archive
echo "[$(date)] Creating archive..."
tar -czf "${BACKUPS_DIR}/${BACKUP_NAME}.tar.gz" -C "${BACKUPS_DIR}" "${BACKUP_NAME}"
rm -rf "${BACKUP_DIR}"

ARCHIVE_SIZE=$(du -h "${BACKUPS_DIR}/${BACKUP_NAME}.tar.gz" | cut -f1)
echo "[$(date)] Backup complete: ${BACKUP_NAME}.tar.gz (${ARCHIVE_SIZE})"

# 6. Rotate old backups (keep MAX_BACKUPS most recent)
BACKUP_COUNT=$(ls -1 "${BACKUPS_DIR}"/auto-backup-*.tar.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
  DELETE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
  echo "[$(date)] Rotating backups: deleting ${DELETE_COUNT} old backup(s)..."
  ls -1t "${BACKUPS_DIR}"/auto-backup-*.tar.gz | tail -n "$DELETE_COUNT" | xargs rm -f
fi

echo "[$(date)] Done."
