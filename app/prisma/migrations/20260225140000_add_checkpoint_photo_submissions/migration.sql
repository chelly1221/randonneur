CREATE TABLE "checkpoint_photo_submissions" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "checkpoint_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "image_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "admin_note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkpoint_photo_submissions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "checkpoint_photo_submissions"
  ADD CONSTRAINT "checkpoint_photo_submissions_checkpoint_id_fkey"
  FOREIGN KEY ("checkpoint_id") REFERENCES "checkpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checkpoint_photo_submissions"
  ADD CONSTRAINT "checkpoint_photo_submissions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
