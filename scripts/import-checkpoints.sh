#!/bin/bash
# Import checkpoints from legacy WordPress into Randonneur
# Phase 1: Export from MariaDB (WordPress)
# Phase 2: Import into PostgreSQL + upload images to MinIO

set -euo pipefail

MARIADB_CONTAINER="shared-mariadb"
POSTGRES_CONTAINER="randonneur-postgres-1"
MINIO_CONTAINER="randonneur-minio-1"

DB_USER="3chan"
DB_NAME="randonneur"
MARIA_USER="root"
MARIA_PASS='Scott122001&&'
MARIA_DB="wordpress"

WP_UPLOADS="/home/sanchan/www/wordpress/wp-content/uploads"
MINIO_BUCKET="gpx-files"
EXPORT_FILE="/tmp/checkpoints-export.tsv"

run_psql() {
  local result
  result=$(docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "$1" 2>/dev/null)
  echo "$result" | head -1
}

echo "=== Phase 1: Export from WordPress MariaDB ==="

# Export checkpoint data with image paths and course numbers
docker exec "$MARIADB_CONTAINER" mariadb -u "$MARIA_USER" -p"$MARIA_PASS" "$MARIA_DB" \
  --batch --skip-column-names -e "
SELECT
  wpc.course_number,
  c.cp_description,
  c.distance_km,
  c.sort_order,
  pm.meta_value AS file_path
FROM wp_permanent_course_checkpoints c
JOIN wp_permanent_courses wpc ON wpc.id = c.course_id
LEFT JOIN wp_postmeta pm ON pm.post_id = c.cp_image AND pm.meta_key = '_wp_attached_file'
ORDER BY wpc.course_number, c.sort_order;
" 2>/dev/null > "$EXPORT_FILE"

TOTAL=$(wc -l < "$EXPORT_FILE")
echo "Exported $TOTAL checkpoints from WordPress"

echo ""
echo "=== Phase 2: Import into Randonneur ==="

IMPORTED=0
IMAGES=0
ERRORS=0

while IFS=$'\t' read -r course_number cp_description distance_km sort_order file_path; do
  # Look up the randonneur course UUID by course_number
  course_uuid=$(run_psql "SELECT id FROM courses WHERE course_number = '$course_number' LIMIT 1;")

  if [ -z "$course_uuid" ]; then
    echo "  SKIP: No course found for course_number=$course_number"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Escape single quotes in description for SQL
  escaped_desc=$(echo "$cp_description" | sed "s/'/''/g")

  # Insert checkpoint and get its UUID
  checkpoint_uuid=$(run_psql "
    INSERT INTO checkpoints (course_id, name, description, distance_km, sort_order)
    VALUES ('$course_uuid', '$escaped_desc', '$escaped_desc', $distance_km, $sort_order)
    RETURNING id;")

  if [ -z "$checkpoint_uuid" ]; then
    echo "  ERROR: Failed to insert checkpoint for $course_number sort_order=$sort_order"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  IMPORTED=$((IMPORTED + 1))

  # Upload image to MinIO if file_path exists
  if [ -n "$file_path" ] && [ "$file_path" != "NULL" ]; then
    local_image="$WP_UPLOADS/$file_path"
    ext="${file_path##*.}"
    minio_key="checkpoints/${course_uuid}/${checkpoint_uuid}.${ext}"

    if [ -f "$local_image" ]; then
      # Copy image into MinIO container and upload
      docker cp "$local_image" "$MINIO_CONTAINER:/tmp/cp_image.${ext}" > /dev/null
      docker exec "$MINIO_CONTAINER" mc cp "/tmp/cp_image.${ext}" "local/${MINIO_BUCKET}/${minio_key}" > /dev/null 2>&1

      # Update checkpoint with image_key
      run_psql "UPDATE checkpoints SET image_key = '$minio_key' WHERE id = '$checkpoint_uuid';" > /dev/null

      IMAGES=$((IMAGES + 1))
    else
      echo "  WARN: Image not found: $local_image"
    fi
  fi

  # Progress indicator every 20 rows
  if [ $((IMPORTED % 20)) -eq 0 ]; then
    echo "  Progress: $IMPORTED / $TOTAL checkpoints..."
  fi

done < "$EXPORT_FILE"

echo ""
echo "=== Import Complete ==="
echo "Total exported:  $TOTAL"
echo "Imported:        $IMPORTED"
echo "Images uploaded: $IMAGES"
echo "Errors:          $ERRORS"

# Verification
echo ""
echo "=== Verification ==="
CP_COUNT=$(run_psql "SELECT COUNT(*) FROM checkpoints;")
CP_IMAGES=$(run_psql "SELECT COUNT(*) FROM checkpoints WHERE image_key IS NOT NULL;")
echo "Checkpoints in DB:     $CP_COUNT"
echo "With images:           $CP_IMAGES"
