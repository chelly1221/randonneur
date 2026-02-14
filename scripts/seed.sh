#!/bin/bash
set -e

echo "Running database migrations..."
docker compose exec app npx prisma migrate deploy

echo "Running seed..."
docker compose exec app npx prisma db seed

echo "Done!"
