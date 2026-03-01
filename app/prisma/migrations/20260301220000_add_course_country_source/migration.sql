-- Add country, source_type, external_id to courses
ALTER TABLE "courses" ADD COLUMN "country" TEXT;
ALTER TABLE "courses" ADD COLUMN "source_type" TEXT;
ALTER TABLE "courses" ADD COLUMN "external_id" TEXT;

-- Backfill existing courses as Korean
UPDATE "courses" SET "country" = 'KR' WHERE "country" IS NULL;

-- Unique index for dedup (nulls excluded by PostgreSQL)
CREATE UNIQUE INDEX "courses_source_type_external_id_key" ON "courses"("source_type", "external_id");

-- Index for country filtering
CREATE INDEX "courses_country_idx" ON "courses"("country");
