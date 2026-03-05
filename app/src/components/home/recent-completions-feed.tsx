"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface CompletionEntry {
  id: string;
  completedAt: string;
  user: { id: string; displayName: string; avatarKey?: string };
  course: { id: string; slug: string; name: string; distanceKm: number; elevationM: number; region: string };
}

export default function RecentCompletionsFeed({ country }: { country?: string } = {}) {
  const [completions, setCompletions] = useState<CompletionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/community/recent-completions?limit=8${country ? `&country=${country}` : ""}`)
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setCompletions(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [country]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-t-text mb-2">최근 완주</h3>
      <div className="rounded-lg border border-t-border overflow-hidden divide-y divide-t-border">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-2.5 py-1.5">
              <div className="h-5 animate-pulse bg-t-subtle rounded" />
            </div>
          ))
        ) : completions.length === 0 ? (
          <div className="px-2.5 py-4 text-center text-[11px] text-t-muted">
            아직 완주 기록이 없습니다
          </div>
        ) : (
          completions.map((c) => (
            <div key={c.id} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px]">
              <Link
                href={`/users/${c.user.id}`}
                className="font-medium truncate max-w-[60px] hover:underline"
              >
                {c.user.displayName}
              </Link>
              <span className="text-t-faint">→</span>
              <Link
                href={`/courses/${c.course.slug}`}
                className="text-sky-blue truncate hover:underline"
              >
                {c.course.name}
              </Link>
              <span className="text-[9px] text-t-faint">{c.course.distanceKm}km</span>
              <span className="ml-auto text-[9px] text-t-faint whitespace-nowrap">
                {formatDate(c.completedAt)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
