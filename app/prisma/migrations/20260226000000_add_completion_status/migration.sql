ALTER TABLE "completions" ADD COLUMN IF NOT EXISTS "completion_status" TEXT NOT NULL DEFAULT 'success';
