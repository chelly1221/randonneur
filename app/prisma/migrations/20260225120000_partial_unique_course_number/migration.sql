-- Drop the unique constraint (which also drops the underlying index)
ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_course_number_key";

-- Create a partial unique index: only active (non-archived) courses must have unique course_number
-- Archived courses may share course_number with other archived or active courses
CREATE UNIQUE INDEX "courses_course_number_active_key"
  ON "courses" ("course_number")
  WHERE archived = false AND course_number IS NOT NULL;
