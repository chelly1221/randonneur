"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Trophy, MessageSquare } from "lucide-react";

type FilterMode = "all" | "following" | "mine";

interface ActivityEntry {
  id: string;
  type: "completion" | "review";
  user: { id: string; displayName: string; avatarKey: string | null };
  course: {
    id: string;
    slug: string;
    name: string;
    distanceKm: number;
    region: string | null;
  };
  date: string;
  content: string | null;
}

interface ActivityResponse {
  activities: ActivityEntry[];
  noFollows: boolean;
}

export function ActivityTimeline() {
  const { data: session } = useSession();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [noFollows, setNoFollows] = useState(false);

  const isLoggedIn = !!session?.user;

  useEffect(() => {
    if (!isLoggedIn && filter !== "all") {
      setFilter("all");
    }
  }, [isLoggedIn, filter]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setNoFollows(false);

    fetch(`/api/activity?limit=10&filter=${filter}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: ActivityResponse) => {
        setActivities(data.activities ?? []);
        setNoFollows(data.noFollows ?? false);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setActivities([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [filter]);

  return (
    <div>
      {/* Compact filter tabs */}
      {isLoggedIn && (
        <div className="mb-1.5 flex gap-1 text-[10px]">
          {(["all", "following", "mine"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-0.5 font-medium transition-colors ${
                filter === f
                  ? "bg-sky-blue/15 text-sky-blue"
                  : "text-t-muted hover:text-t-text"
              }`}
            >
              {{ all: "전체", following: "팔로잉", mine: "내 활동" }[f]}
            </button>
          ))}
        </div>
      )}

      {/* Activity list */}
      {loading ? (
        <div className="space-y-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-t-subtle" />
          ))}
        </div>
      ) : filter === "following" && noFollows ? (
        <div className="py-4 text-center text-[11px] text-t-muted">
          팔로우한 사용자가 없습니다
        </div>
      ) : activities.length === 0 ? (
        <div className="py-4 text-center text-[11px] text-t-muted">
          아직 활동이 없습니다
        </div>
      ) : (
        <div className="divide-y divide-t-border rounded-lg border border-t-border overflow-hidden">
          {activities.map((a) => (
            <div key={a.id} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px]">
              <span className={`shrink-0 ${
                a.type === "completion" ? "text-sky-blue" : "text-sky-orange"
              }`}>
                {a.type === "completion" ? (
                  <Trophy className="h-3 w-3" />
                ) : (
                  <MessageSquare className="h-3 w-3" />
                )}
              </span>
              <Link href={`/users/${a.user.id}`} className="font-medium text-t-text hover:underline shrink-0 max-w-[60px] truncate">
                {a.user.displayName}
              </Link>
              <span className="text-t-faint shrink-0">
                {a.type === "completion" ? "완주" : "후기"}
              </span>
              <Link href={`/courses/${a.course.slug}`} className="text-sky-blue hover:underline truncate min-w-0">
                {a.course.name}
              </Link>
              <span className="ml-auto text-[9px] text-t-faint whitespace-nowrap shrink-0">
                {new Date(a.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
