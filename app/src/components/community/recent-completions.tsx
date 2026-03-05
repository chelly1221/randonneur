"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface CompletionEntry {
  id: string;
  completedAt: string;
  user: { id: string; displayName: string; avatarKey: string | null };
  course: {
    id: string;
    slug: string;
    name: string;
    distanceKm: number;
    elevationM: number;
    region: string | null;
  };
}

export function RecentCompletions() {
  const [completions, setCompletions] = useState<CompletionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/community/recent-completions?limit=8")
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((data) => { if (Array.isArray(data)) setCompletions(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-t-subtle" />
        ))}
      </div>
    );
  }

  if (completions.length === 0) {
    return (
      <div className="rounded-lg border border-t-border py-4 text-center text-[11px] text-t-muted">
        아직 완주 기록이 없습니다.
      </div>
    );
  }

  return (
    <div className="divide-y divide-t-border rounded-lg border border-t-border overflow-hidden">
      {completions.map((c) => (
        <div key={c.id} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px]">
          <Link href={`/users/${c.user.id}`} className="font-medium text-t-text hover:underline shrink-0 max-w-[60px] truncate">
            {c.user.displayName}
          </Link>
          <span className="text-t-faint shrink-0">&rarr;</span>
          <Link href={`/courses/${c.course.slug}`} className="text-sky-blue hover:underline truncate min-w-0">
            {c.course.name}
          </Link>
          <span className="text-[9px] text-t-faint shrink-0">{c.course.distanceKm}km</span>
          <span className="ml-auto text-[9px] text-t-faint whitespace-nowrap shrink-0">
            {new Date(c.completedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
          </span>
        </div>
      ))}
    </div>
  );
}
