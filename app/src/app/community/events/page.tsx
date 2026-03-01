import { auth } from "@/lib/auth";
import { EventCalendar } from "@/components/community/event-calendar";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "이벤트 - Audax Korea",
  description: "라이딩 이벤트, 브레베, 그룹라이드 일정을 확인하세요.",
};

export default async function EventsPage() {
  const session = await auth();
  const isAdmin = (session?.user?.roles ?? []).includes("admin");

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">공식 이벤트</h2>
        {isAdmin && (
          <Link
            href="/community/events/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-darkblue px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-darkblue/90 transition-colors"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            이벤트 등록
          </Link>
        )}
      </div>
      <EventCalendar defaultView="calendar" />
    </div>
  );
}
