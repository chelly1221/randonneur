-- AlterTable
ALTER TABLE "courses" ADD COLUMN "course_number" TEXT;
ALTER TABLE "courses" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "courses_course_number_key" ON "courses"("course_number");
