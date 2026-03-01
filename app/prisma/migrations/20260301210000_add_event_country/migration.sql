-- AlterTable
ALTER TABLE "events" ADD COLUMN "country" TEXT;

-- CreateIndex
CREATE INDEX "events_country_idx" ON "events"("country");

-- Backfill existing ACP events as Korean
UPDATE "events" SET "country" = 'Korea' WHERE "source_type" = 'acp' AND "country" IS NULL;
