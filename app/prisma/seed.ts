import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const sampleCourses = [
  {
    name: "서울 한강 종주",
    distanceKm: 200,
    elevationM: 1200,
    estimatedTime: "12시간",
    startLocation: "서울 여의도",
    endLocation: "서울 여의도",
    region: "서울",
    category: [],
    tags: ["한강", "야간", "초보"],
    description: "서울 한강변을 따라 달리는 200km 코스. 평탄한 자전거 도로를 활용합니다.",
  },
  {
    name: "경기 북부 산악",
    distanceKm: 300,
    elevationM: 3500,
    estimatedTime: "18시간",
    startLocation: "의정부역",
    endLocation: "의정부역",
    region: "경기",
    category: [],
    tags: ["산악", "도전"],
    description: "경기 북부의 산간 지역을 관통하는 300km 산악 코스.",
  },
  {
    name: "동해안 해안도로",
    distanceKm: 400,
    elevationM: 2800,
    estimatedTime: "24시간",
    startLocation: "강릉역",
    endLocation: "삼척",
    region: "강원",
    category: [],
    tags: ["해안", "경관", "동해"],
    description: "동해안의 아름다운 해안 도로를 달리는 장거리 코스.",
  },
  {
    name: "제주 일주",
    distanceKm: 200,
    elevationM: 1800,
    estimatedTime: "13시간",
    startLocation: "제주시청",
    endLocation: "제주시청",
    region: "제주",
    category: [],
    tags: ["제주", "일주", "경관"],
    description: "제주도를 한 바퀴 도는 클래식 200km 코스.",
  },
  {
    name: "섬진강 따라가기",
    distanceKm: 200,
    elevationM: 1500,
    estimatedTime: "12시간",
    startLocation: "남원",
    endLocation: "광양",
    region: "전라",
    category: [],
    tags: ["강변", "벚꽃", "봄"],
    description: "섬진강을 따라 남원에서 광양까지 달리는 아름다운 코스.",
  },
  {
    name: "경주-포항 문화유산",
    distanceKm: 200,
    elevationM: 1600,
    estimatedTime: "12시간",
    startLocation: "경주역",
    endLocation: "경주역",
    region: "경상",
    category: [],
    tags: ["문화유산", "경주", "클래식"],
    description: "경주의 역사 유적지를 지나며 포항 해안까지 연결되는 코스.",
  },
  {
    name: "대전-공주 백제길",
    distanceKm: 200,
    elevationM: 2000,
    estimatedTime: "13시간",
    startLocation: "대전역",
    endLocation: "대전역",
    region: "충청",
    category: [],
    tags: ["백제", "역사", "금강"],
    description: "대전에서 공주를 경유하여 금강변을 달리는 코스.",
  },
  {
    name: "서울-춘천 북한강",
    distanceKm: 200,
    elevationM: 1100,
    estimatedTime: "11시간",
    startLocation: "잠실역",
    endLocation: "잠실역",
    region: "경기",
    category: [],
    tags: ["북한강", "자전거길", "초보"],
    description: "북한강 자전거길을 활용한 서울-춘천 왕복 코스.",
  },
  {
    name: "지리산 둘레",
    distanceKm: 600,
    elevationM: 8000,
    estimatedTime: "40시간",
    startLocation: "남원",
    endLocation: "남원",
    region: "전라",
    category: ["adventure"],
    tags: ["지리산", "울트라", "도전"],
    description: "지리산 자락을 돌아보는 600km 울트라 코스. 고도 획득 8,000m.",
  },
  {
    name: "영남대로 1000K",
    distanceKm: 1000,
    elevationM: 10000,
    estimatedTime: "75시간",
    startLocation: "서울 숭례문",
    endLocation: "부산 영도",
    region: "경상",
    category: ["adventure"],
    tags: ["1000K", "울트라", "영남대로"],
    description: "서울에서 부산까지 영남대로를 따라 달리는 1000km 울트라 코스.",
  },
];

async function main() {
  console.log("Seeding database...");

  for (const course of sampleCourses) {
    const existing = await prisma.course.findFirst({
      where: { name: course.name },
    });
    if (!existing) {
      await prisma.course.create({ data: course });
      console.log(`Created course: ${course.name}`);
    } else {
      console.log(`Skipped (exists): ${course.name}`);
    }
  }

  console.log("Seed completed!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
