-- CreateIndex
CREATE INDEX IF NOT EXISTS "completions_course_id_idx" ON "completions"("course_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "downloads_course_id_idx" ON "downloads"("course_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "checkpoints_course_id_idx" ON "checkpoints"("course_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "reviews_course_id_idx" ON "reviews"("course_id");
