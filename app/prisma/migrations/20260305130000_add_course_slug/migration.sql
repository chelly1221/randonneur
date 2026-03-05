-- AlterTable
ALTER TABLE "courses" ADD COLUMN "slug" TEXT;

-- Backfill slugs for existing courses
-- Generate slug from course_number, name, and distance_km
UPDATE courses SET slug = CONCAT(
  CASE WHEN course_number IS NOT NULL THEN LOWER(REPLACE(course_number, ' ', '-')) || '-' ELSE '' END,
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        LOWER(TRIM(name)),
        '[^\w\s가-힣ぁ-ゟ゠-ヿ㐀-䶵一-鿋豈-頻々〇〻\u3400-\u9FFF\uF900-\uFAFF\-]', '', 'g'
      ),
      '\s+', '-', 'g'
    ),
    '-+', '-', 'g'
  ),
  '-',
  CAST(CAST(distance_km AS INTEGER) AS TEXT),
  'km'
);

-- Handle any remaining NULLs (edge case: empty name)
UPDATE courses SET slug = 'course-' || REPLACE(id::text, '-', '') WHERE slug IS NULL OR slug = '';

-- Resolve duplicates by appending a suffix
WITH dupes AS (
  SELECT id, slug, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at ASC) AS rn
  FROM courses
)
UPDATE courses SET slug = courses.slug || '-' || dupes.rn
FROM dupes
WHERE courses.id = dupes.id AND dupes.rn > 1;

-- Now make it NOT NULL and add unique index
ALTER TABLE "courses" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");
