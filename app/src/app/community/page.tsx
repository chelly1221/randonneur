import { RecentReviews } from "@/components/community/recent-reviews";
import { RecentCompletions } from "@/components/community/recent-completions";
import { PopularCourses } from "@/components/course/popular-courses";
import { ActivityTimeline } from "@/components/community/activity-timeline";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "커뮤니티 - Audax Korea",
  description: "최근 후기, 완주 기록, 인기 코스를 확인하세요.",
};

export default function CommunityPage() {
  return (
    <div className="space-y-3">
      {/* Desktop: unified 2-column / Mobile: stacked */}
      <div className="lg:grid lg:grid-cols-5 lg:gap-4 space-y-3 lg:space-y-0">
        {/* Left column: Reviews (2-col grid) */}
        <section className="lg:col-span-3">
          <h2 className="mb-1.5 text-sm font-semibold text-t-muted">최근 후기</h2>
          <RecentReviews />
        </section>

        {/* Right column: Popular + Activity + Completions */}
        <div className="lg:col-span-2 space-y-3">
          <section>
            <h2 className="mb-1.5 text-sm font-semibold text-t-muted">월간 인기 코스</h2>
            <PopularCourses compact limit={5} />
          </section>

          <section>
            <h2 className="mb-1.5 text-sm font-semibold text-t-muted">활동 피드</h2>
            <div className="lg:max-h-[300px] lg:overflow-y-auto lg:pr-1 scrollbar-thin">
              <ActivityTimeline />
            </div>
          </section>

          <section>
            <h2 className="mb-1.5 text-sm font-semibold text-t-muted">최근 완주</h2>
            <RecentCompletions />
          </section>
        </div>
      </div>
    </div>
  );
}
