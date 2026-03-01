-- CreateTable
CREATE TABLE "badges" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_badges" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "badge_id" UUID NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "badges_slug_key" ON "badges"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "user_badges_user_id_badge_id_key" ON "user_badges"("user_id", "badge_id");

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed initial badges
INSERT INTO "badges" ("id", "slug", "name", "description", "icon", "criteria") VALUES
  (uuid_generate_v4(), 'first-ride', '첫 완주', '첫 번째 코스 완주', '🎉', '{"type":"completions","count":1}'),
  (uuid_generate_v4(), '10-courses', '10코스 달성', '10개 코스 완주', '🔟', '{"type":"completions","count":10}'),
  (uuid_generate_v4(), '50-courses', '50코스 달성', '50개 코스 완주', '🏅', '{"type":"completions","count":50}'),
  (uuid_generate_v4(), '100-courses', '100코스 달성', '100개 코스 완주', '💯', '{"type":"completions","count":100}'),
  (uuid_generate_v4(), 'all-regions', '전국 일주', '9개 지역 모두에서 코스 완주', '🗺️', '{"type":"regions","count":9}'),
  (uuid_generate_v4(), 'hill-climber', '고개 넘기', '누적 획득고도 50,000m 달성', '⛰️', '{"type":"elevation","meters":50000}'),
  (uuid_generate_v4(), 'sr-600', 'SR-600 완주자', 'SR-600 카테고리 코스 완주', '🏁', '{"type":"category","value":"SR-600"}'),
  (uuid_generate_v4(), 'reviewer', '후기 달인', '리뷰 10개 이상 작성', '✍️', '{"type":"reviews","count":10}'),
  (uuid_generate_v4(), 'super-randonneur', '슈퍼 랜도너', '같은 해에 200K, 300K, 400K, 600K 코스를 각각 1개 이상 완주', 'SR', '{"type":"super-randonneur"}'),
  (uuid_generate_v4(), 'r-12', 'R-12', '12개월 연속 매달 1개 이상 코스 완주', '12', '{"type":"r-12"}'),
  (uuid_generate_v4(), 'kr-5000', 'KR5000', '누적 완주 거리 5,000km 달성', '5K', '{"type":"distance","km":5000}'),
  (uuid_generate_v4(), 'kr-10000', 'KR10000', '누적 완주 거리 10,000km 달성', '10K', '{"type":"distance","km":10000}'),
  (uuid_generate_v4(), 'kr-20000', 'KR20000', '누적 완주 거리 20,000km 달성', '20K', '{"type":"distance","km":20000}');
