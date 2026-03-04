"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Trophy, MessageSquare } from "lucide-react";

interface ActivityEntry {
  id: string;
  type: "completion" | "review";
  user: { id: string; displayName: string; avatarKey?: string };
  course: { id: string; name: string; distanceKm: number; region: string };
  date: string;
  content?: string;
}

interface ActivityResponse {
  activities: ActivityEntry[];
  noFollows: boolean;
}

export default function FollowingFeed() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      setLoading(false);
      return;
    }

    fetch("/api/activity?limit=8&filter=following")
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session, status]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-t-text mb-2">팔로잉 피드</h3>
      <div className="rounded-lg border border-t-border overflow-hidden divide-y divide-t-border">
        {status === "loading" || (session && loading) ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-2.5 py-1.5">
              <div className="h-5 animate-pulse bg-t-subtle rounded" />
            </div>
          ))
        ) : !session ? (
          <div className="px-2.5 py-4 text-center text-[11px] text-t-muted">
            로그인하면 팔로우한 라이더의 활동을 볼 수 있습니다
          </div>
        ) : data?.noFollows ? (
          <div className="px-2.5 py-4 text-center text-[11px] text-t-muted">
            팔로우한 사용자가 없습니다
          </div>
        ) : !data?.activities?.length ? (
          <div className="px-2.5 py-4 text-center text-[11px] text-t-muted">
            아직 활동이 없습니다
          </div>
        ) : (
          data.activities.map((a) => (
            <div key={a.id} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px]">
              {a.type === "completion" ? (
                <Trophy className="w-3 h-3 text-sky-blue flex-shrink-0" />
              ) : (
                <MessageSquare className="w-3 h-3 text-sky-orange flex-shrink-0" />
              )}
              <Link
                href={`/users/${a.user.id}`}
                className="font-medium truncate hover:underline"
              >
                {a.user.displayName}
              </Link>
              <span className="text-t-faint">
                {a.type === "completion" ? "완주" : "후기"}
              </span>
              <Link
                href={`/courses/${a.course.id}`}
                className="text-sky-blue truncate hover:underline"
              >
                {a.course.name}
              </Link>
              <span className="ml-auto text-[9px] text-t-faint whitespace-nowrap">
                {formatDate(a.date)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
