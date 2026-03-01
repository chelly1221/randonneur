-- AlterTable
ALTER TABLE "events" ADD COLUMN "source_type" TEXT;
ALTER TABLE "events" ADD COLUMN "external_id" TEXT;
ALTER TABLE "events" ADD COLUMN "source_url" TEXT;

-- CreateIndex (nulls are excluded by PostgreSQL, so manual events unaffected)
CREATE UNIQUE INDEX "events_source_type_external_id_key" ON "events"("source_type", "external_id");
