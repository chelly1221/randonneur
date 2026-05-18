#!/bin/bash
set -euo pipefail

# Data migration export script
# Run on the SOURCE machine to create a backup archive of all data.
# Usage: ./scripts/migrate-export.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# Which compose file to target — override with COMPOSE_FILE=docker-compose.prod.yml
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="audax-backup-${TIMESTAMP}"
BACKUPS_DIR="${PROJECT_DIR}/backups"
mkdir -p "${BACKUPS_DIR}"
BACKUP_DIR="${BACKUPS_DIR}/${BACKUP_NAME}"

# Load .env for database credentials (safe parsing — handles special chars like &&)
if [ ! -f "${PROJECT_DIR}/.env" ]; then
  echo "Error: .env file not found at ${PROJECT_DIR}/.env"
  exit 1
fi
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
  key=$(echo "$key" | xargs)
  export "$key"="$value"
done < "${PROJECT_DIR}/.env"

echo "=== Randonneur Data Export ==="
echo "Backup directory: ${BACKUP_DIR}"
echo ""

# Check that containers are running
if ! docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" ps --status running postgres 2>/dev/null | grep -q postgres; then
  echo "Error: postgres container is not running."
  echo "Start services first: docker compose up -d"
  exit 1
fi

if ! docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" ps --status running minio 2>/dev/null | grep -q minio; then
  echo "Error: minio container is not running."
  echo "Start services first: docker compose up -d"
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

# --- 1. PostgreSQL randonneur DB ---
echo "[1/4] Exporting randonneur database..."
docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --format=custom \
  > "${BACKUP_DIR}/randonneur.dump"
echo "  -> randonneur.dump ($(du -h "${BACKUP_DIR}/randonneur.dump" | cut -f1))"

# --- 2. MinIO gpx-files bucket ---
echo "[2/4] Exporting MinIO gpx-files bucket..."
mkdir -p "${BACKUP_DIR}/minio-data"

# Use mc inside the minio container to copy files out
# First, configure the alias inside the container
docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T minio \
  mc alias set local http://localhost:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" --quiet 2>/dev/null || true

# List the bucket to check if it exists
if docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T minio \
  mc ls local/"${MINIO_BUCKET}" >/dev/null 2>&1; then

  # Mirror bucket contents to a temp dir inside the container, then copy out
  docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T minio \
    mc mirror --quiet local/"${MINIO_BUCKET}" /tmp/minio-export 2>/dev/null

  # Copy from container to host
  docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" cp minio:/tmp/minio-export/. "${BACKUP_DIR}/minio-data/"

  # Clean up temp dir in container
  docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T minio \
    rm -rf /tmp/minio-export

  FILE_COUNT=$(find "${BACKUP_DIR}/minio-data" -type f 2>/dev/null | wc -l)
  echo "  -> minio-data/ (${FILE_COUNT} files)"
else
  echo "  -> Bucket '${MINIO_BUCKET}' not found or empty, skipping."
fi

# --- 3. .env file (reference copy) ---
echo "[3/4] Copying .env file (for reference)..."
cp "${PROJECT_DIR}/.env" "${BACKUP_DIR}/env.bak"
echo "  -> env.bak"

# --- 4. Create tar.gz archive ---
echo "[4/4] Creating archive..."
tar -czf "${BACKUPS_DIR}/${BACKUP_NAME}.tar.gz" -C "${BACKUPS_DIR}" "${BACKUP_NAME}"
rm -rf "${BACKUP_DIR}"

ARCHIVE_SIZE=$(du -h "${BACKUPS_DIR}/${BACKUP_NAME}.tar.gz" | cut -f1)
echo ""
echo "=== Export complete ==="
echo "Archive: ${BACKUPS_DIR}/${BACKUP_NAME}.tar.gz (${ARCHIVE_SIZE})"
echo ""
echo "Transfer this file to the new machine and run:"
echo "  ./scripts/migrate-import.sh backups/${BACKUP_NAME}.tar.gz"
