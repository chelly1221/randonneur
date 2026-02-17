import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CourseCard } from "@/components/course/course-card";
import { Bike, Map, Mountain, Users } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [courseCount, totalDistanceResult, recentCourses, completionCount] =
    await Promise.all([
      prisma.course.count(),
      prisma.course.aggregate({ _sum: { distanceKm: true } }),
      prisma.course.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.completion.count(),
    ]);

  const totalDistance = Math.round(totalDistanceResult._sum.distanceKm ?? 0);

  const stats = [
    { icon: Bike, label: "등록 코스", value: courseCount },
    { icon: Map, label: "총 거리", value: `${totalDistance.toLocaleString()} km` },
    { icon: Mountain, label: "지역", value: "7개 지역" },
    { icon: Users, label: "완주 기록", value: completionCount },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="gradient-hero py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight leading-[1.15] sm:text-5xl">
            한국 랜도너스
            <br />
            <span className="mt-1.5 inline-block text-t-hero-accent sm:mt-2">퍼머넌트 코스</span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-white/70">
            한국 전역의 랜도너링 퍼머넌트 코스를 탐색하고, 경로를 확인하고,
            GPX 파일을 다운로드하세요.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/courses">
              <Button size="lg" className="bg-t-accent text-white hover:bg-t-accent-x">코스 둘러보기</Button>
            </Link>
            <Link href="/courses">
              <Button variant="outline" size="lg" className="border-white/40 text-white backdrop-blur-sm bg-black/10 hover:bg-black/20">
                지도에서 보기
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-7xl px-4 -mt-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-4">
                <div className="rounded-lg bg-t-subtle p-3">
                  <stat.icon className="h-6 w-6 text-t-icon" />
                </div>
                <div>
                  <p className="text-sm text-t-muted">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Recent courses */}
      {recentCourses.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold">최근 코스</h2>
            <Link
              href="/courses"
              className="text-sm text-t-accent hover:text-t-accent-x"
            >
              전체 보기 →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentCourses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
