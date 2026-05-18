#!/bin/bash
set -euo pipefail

# Data migration import script
# Run on the TARGET machine to restore data from a backup archive.
# Usage: ./scripts/migrate-import.sh backup-YYYYMMDD-HHMMSS.tar.gz

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# Which compose file to target — override with COMPOSE_FILE=docker-compose.prod.yml
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-archive.tar.gz>"
  echo "Example: $0 backup-20260223-120000.tar.gz"
  exit 1
fi

ARCHIVE="$1"

# Resolve archive path (support both absolute and relative paths)
if [[ "$ARCHIVE" != /* ]]; then
  ARCHIVE="${PWD}/${ARCHIVE}"
fi

if [ ! -f "${ARCHIVE}" ]; then
  echo "Error: Archive not found: ${ARCHIVE}"
  exit 1
fi

# Load .env for database credentials (safe parsing — handles special chars like &&)
if [ ! -f "${PROJECT_DIR}/.env" ]; then
  echo "Error: .env file not found at ${PROJECT_DIR}/.env"
  echo "Copy .env.example to .env and configure it before importing."
  exit 1
fi
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
  key=$(echo "$key" | xargs)
  export "$key"="$value"
done < "${PROJECT_DIR}/.env"

echo "=== Randonneur Data Import ==="
echo "Archive: ${ARCHIVE}"
echo ""

# --- Prerequisite checks ---
echo "Checking prerequisites..."

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

echo "  postgres: running"
echo "  minio: running"
echo ""

# --- Check for existing data ---
COURSE_COUNT=$(docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T postgres \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc "SELECT count(*) FROM courses" 2>/dev/null || echo "0")
COURSE_COUNT=$(echo "$COURSE_COUNT" | tr -d '[:space:]')

if [ "$COURSE_COUNT" != "0" ] && [ -n "$COURSE_COUNT" ]; then
  echo "WARNING: randonneur database already has ${COURSE_COUNT} courses."
  echo "Importing will DROP and recreate both databases."
  read -rp "Continue? (y/N): " confirm
  if [[ "$confirm" != [yY] ]]; then
    echo "Aborted."
    exit 0
  fi
  echo ""
fi

# --- Extract archive ---
echo "[1/4] Extracting archive..."
BACKUP_DIR=$(tar -tzf "${ARCHIVE}" | head -1 | cut -d'/' -f1)
tar -xzf "${ARCHIVE}" -C "${PROJECT_DIR}"
BACKUP_PATH="${PROJECT_DIR}/${BACKUP_DIR}"
echo "  -> ${BACKUP_DIR}"

# Verify expected files exist
for f in randonneur.dump; do
  if [ ! -f "${BACKUP_PATH}/${f}" ]; then
    echo "Error: Expected file ${f} not found in archive."
    rm -rf "${BACKUP_PATH}"
    exit 1
  fi
done

# --- Restore randonneur DB ---
echo "[2/4] Restoring randonneur database..."

# Drop and recreate the database
docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T postgres \
  psql -U "${POSTGRES_USER}" -d postgres -c "
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();
  " >/dev/null 2>&1 || true

docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T postgres \
  psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS \"${POSTGRES_DB}\";" >/dev/null

docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T postgres \
  psql -U "${POSTGRES_USER}" -d postgres -c "CREATE DATABASE \"${POSTGRES_DB}\";" >/dev/null

# Enable extensions before restore
docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T postgres \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "
    CREATE EXTENSION IF NOT EXISTS postgis;
    CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";
  " >/dev/null

# Restore from dump
docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T postgres \
  pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-privileges --clean --if-exists \
  < "${BACKUP_PATH}/randonneur.dump" 2>/dev/null || true

RESTORED_COUNT=$(docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T postgres \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc "SELECT count(*) FROM courses" 2>/dev/null || echo "?")
echo "  -> randonneur database restored (${RESTORED_COUNT} courses)"

# --- Restore MinIO data ---
echo "[3/4] Restoring MinIO data..."

if [ -d "${BACKUP_PATH}/minio-data" ] && [ "$(ls -A "${BACKUP_PATH}/minio-data" 2>/dev/null)" ]; then
  # Configure mc alias inside the minio container
  docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T minio \
    mc alias set local http://localhost:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" --quiet 2>/dev/null || true

  # Create bucket if it doesn't exist
  docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T minio \
    mc mb --ignore-existing local/"${MINIO_BUCKET}" 2>/dev/null || true

  # Copy files into container temp dir, then mirror to bucket
  docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T minio \
    rm -rf /tmp/minio-import 2>/dev/null || true
  docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T minio \
    mkdir -p /tmp/minio-import

  docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" cp "${BACKUP_PATH}/minio-data/." minio:/tmp/minio-import/

  docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T minio \
    mc mirror --overwrite --quiet /tmp/minio-import local/"${MINIO_BUCKET}" 2>/dev/null

  # Clean up temp dir
  docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T minio \
    rm -rf /tmp/minio-import

  FILE_COUNT=$(find "${BACKUP_PATH}/minio-data" -type f | wc -l)
  echo "  -> ${FILE_COUNT} files restored to bucket '${MINIO_BUCKET}'"
else
  echo "  -> No MinIO data in backup, skipping."
fi

# --- Prisma migration check ---
echo "[4/4] Checking Prisma migration status..."

if docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" ps --status running app 2>/dev/null | grep -q app; then
  docker compose -f "${PROJECT_DIR}/${COMPOSE_FILE}" exec -T app \
    npx --package=prisma@6 prisma migrate status 2>&1 | tail -5
else
  echo "  -> app container not running, skipping migration check."
  echo "     Run manually after starting app: docker compose exec app npx --package=prisma@6 prisma migrate status"
fi

# --- Cleanup ---
rm -rf "${BACKUP_PATH}"

echo ""
echo "=== Import complete ==="
echo ""
echo "Recommended next steps:"
echo "  1. Restart services: docker compose restart"
echo "  2. Check health: curl http://localhost:3100/api/health"
