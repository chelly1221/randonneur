/**
 * Import SR-600 (Super Randonnée) courses from:
 * http://www.korearandonneurs.kr:8080/jsp/randonneurs/superrando
 *
 * Run (example):
 *   docker exec randonneur-app-1 sh -lc "cd /app && npx tsx /app/scripts/import-superrando-courses.ts"
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SrCourse = {
  courseNumber: string;
  name: string;
  distanceKm: number;
  elevationM: number;
  startLocation: string;
  endLocation: string;
  region: string;
  designer: string;
};

const SR_600_COURSES: SrCourse[] = [
  { courseNumber: "SR-01", name: "슈퍼삐약이", distanceKm: 601, elevationM: 10287, startLocation: "서울 반포", endLocation: "서울 반포", region: "경기", designer: "김회진" },
  { courseNumber: "SR-02", name: "용솟음", distanceKm: 609, elevationM: 11305, startLocation: "부산 해운대", endLocation: "양평", region: "경남", designer: "김영삼" },
  { courseNumber: "SR-03", name: "충청낙타", distanceKm: 619, elevationM: 10154, startLocation: "아산역", endLocation: "아산역", region: "충남", designer: "원광식" },
  { courseNumber: "SR-04", name: "지리산 반달곰", distanceKm: 602, elevationM: 14284, startLocation: "영동역", endLocation: "영동역", region: "충북", designer: "김진학" },
  { courseNumber: "SR-05", name: "긴꼬리산양", distanceKm: 603, elevationM: 10440, startLocation: "청주", endLocation: "양평", region: "충북", designer: "김길섭" },
  { courseNumber: "SR-06", name: "대머리 독수리", distanceKm: 613, elevationM: 11425, startLocation: "안동", endLocation: "안동", region: "경북", designer: "Jason" },
  { courseNumber: "SR-07", name: "하늘다람쥐", distanceKm: 614, elevationM: 13373, startLocation: "태백", endLocation: "태백", region: "강원", designer: "김진학" },
  { courseNumber: "SR-08", name: "하얀 너구리", distanceKm: 601, elevationM: 11354, startLocation: "용문", endLocation: "용문", region: "경기", designer: "장성준" },
  { courseNumber: "SR-09", name: "무진장 거위", distanceKm: 603, elevationM: 11443, startLocation: "전주", endLocation: "전주", region: "전북", designer: "조영남" },
  { courseNumber: "SR-10", name: "사자와 호랑이", distanceKm: 614, elevationM: 10398, startLocation: "대구", endLocation: "광주", region: "경북", designer: "권영민" },
  { courseNumber: "SR-11", name: "서울 멧돼지", distanceKm: 603, elevationM: 10669, startLocation: "서울", endLocation: "서울", region: "경기", designer: "장성준" },
  { courseNumber: "SR-12", name: "용솟음-R", distanceKm: 610, elevationM: 10750, startLocation: "양평", endLocation: "부산", region: "경기", designer: "김영삼" },
];

async function main() {
  let upserted = 0;

  for (const c of SR_600_COURSES) {
    await prisma.course.upsert({
      where: { courseNumber: c.courseNumber },
      create: {
        courseNumber: c.courseNumber,
        name: c.name,
        distanceKm: c.distanceKm,
        elevationM: c.elevationM,
        estimatedTime: null,
        startLocation: c.startLocation,
        endLocation: c.endLocation,
        region: c.region,
        category: ["sr-600"],
        tags: [],
        description: null,
        designer: c.designer,
        archived: false,
      },
      update: {
        name: c.name,
        distanceKm: c.distanceKm,
        elevationM: c.elevationM,
        startLocation: c.startLocation,
        endLocation: c.endLocation,
        region: c.region,
        designer: c.designer,
        category: ["sr-600"],
        archived: false,
      },
    });
    upserted++;
  }

  console.log(`SR-600 upsert completed: ${upserted} course(s).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
