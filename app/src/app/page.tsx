import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { CourseCard } from "@/components/course/course-card";
import { PopularCourses } from "@/components/course/popular-courses";
import { CourseRecommendations } from "@/components/course/course-recommendations";
import Link from "next/link";

import GlobalStats from "@/components/home/global-stats";
import MySummary from "@/components/home/my-summary";
import HomeCharts from "@/components/home/home-charts";
import CountryDistribution from "@/components/home/country-distribution";
import UpcomingEvents from "@/components/home/upcoming-events";
import ActivePolls from "@/components/home/active-polls";
import RecentCompletionsFeed from "@/components/home/recent-completions-feed";
import RecentReviewsHome from "@/components/home/recent-reviews-home";
import FollowingFeed from "@/components/home/following-feed";
import CountrySpotlight from "@/components/home/country-spotlight";
import BeginnerCourses from "@/components/home/beginner-courses";
import GalleryCarousel from "@/components/home/gallery-carousel";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const recentCourses = await prisma.course.findMany({
    where: { country: "KR" },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  return (
    <div>
      {/* Hero */}
      <section className="gradient-hero py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight leading-[1.15] sm:text-5xl">
            란도너스
            <br />
            <span className="mt-1.5 inline-block text-t-hero-accent sm:mt-2">자료 저장소</span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-white/70">
            달리고, 기록하고, 공유하세요
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/courses">
              <Button size="lg" className="bg-t-accent text-white hover:bg-t-accent-x">코스 둘러보기</Button>
            </Link>
            <Link href="/courses/world">
              <Button variant="outline" size="lg" className="border-white/40 text-white backdrop-blur-sm bg-black/10 hover:bg-black/20">
                세계 코스 보기
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Global Stats — animated counters */}
      <section className="mx-auto max-w-7xl px-4 -mt-8">
        <GlobalStats />
      </section>

      {/* My Summary — personal dashboard (logged-in) or CTA */}
      <section className="mx-auto max-w-7xl px-4 pt-8">
        <MySummary />
      </section>

      {/* Country Spotlight + Country Distribution — side by side */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-6 lg:grid-cols-2">
          <CountrySpotlight />
          <CountryDistribution />
        </div>
      </section>

      {/* Distance Distribution — full width */}
      <section className="mx-auto max-w-7xl px-4 pb-10">
        <HomeCharts />
      </section>

      {/* Popular courses — KR only */}
      <section className="mx-auto max-w-7xl px-4 pb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">인기 코스</h2>
        </div>
        <PopularCourses country="KR" />
      </section>

      {/* Beginner recommended courses — KR only */}
      <section className="mx-auto max-w-7xl px-4 pb-10">
        <BeginnerCourses country="KR" />
      </section>

      {/* Course Recommendations — KR only */}
      <section className="mx-auto max-w-7xl px-4 pb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">추천 코스</h2>
        </div>
        <CourseRecommendations country="KR" />
      </section>

      {/* Community Section — Reviews, Completions, Events, Polls, Following — KR only */}
      <section className="mx-auto max-w-7xl px-4 pb-10">
        <h2 className="text-xl font-bold mb-6">커뮤니티</h2>
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left column — Reviews + Completions */}
          <div className="lg:col-span-3 space-y-6">
            <RecentReviewsHome country="KR" />
            <RecentCompletionsFeed country="KR" />
          </div>

          {/* Right column — Events + Polls + Following */}
          <div className="lg:col-span-2 space-y-6">
            <UpcomingEvents country="Korea" />
            <ActivePolls />
            <FollowingFeed />
          </div>
        </div>
      </section>

      {/* Gallery Carousel */}
      <section className="mx-auto max-w-7xl px-4 pb-10">
        <GalleryCarousel />
      </section>

      {/* Recent courses — KR only */}
      {recentCourses.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-12">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold">최근 등록 코스</h2>
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
