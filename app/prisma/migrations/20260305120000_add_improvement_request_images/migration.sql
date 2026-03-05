-- AlterTable
ALTER TABLE "improvement_requests" ADD COLUMN IF NOT EXISTS "images" TEXT[] DEFAULT ARRAY[]::TEXT[];
