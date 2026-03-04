-- CreateTable
CREATE TABLE "ride_recruits" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "course_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ride_date" TIMESTAMP(3) NOT NULL,
    "meeting_point" TEXT,
    "max_members" INTEGER NOT NULL DEFAULT 10,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_recruits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_recruit_participants" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "recruit_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'joined',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_recruit_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ride_recruits_user_id_idx" ON "ride_recruits"("user_id");

-- CreateIndex
CREATE INDEX "ride_recruits_ride_date_idx" ON "ride_recruits"("ride_date");

-- CreateIndex
CREATE INDEX "ride_recruits_status_idx" ON "ride_recruits"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ride_recruit_participants_recruit_id_user_id_key" ON "ride_recruit_participants"("recruit_id", "user_id");

-- AddForeignKey
ALTER TABLE "ride_recruits" ADD CONSTRAINT "ride_recruits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_recruits" ADD CONSTRAINT "ride_recruits_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_recruit_participants" ADD CONSTRAINT "ride_recruit_participants_recruit_id_fkey" FOREIGN KEY ("recruit_id") REFERENCES "ride_recruits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_recruit_participants" ADD CONSTRAINT "ride_recruit_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
