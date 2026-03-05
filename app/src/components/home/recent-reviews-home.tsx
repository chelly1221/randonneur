"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface ReviewEntry {
  id: string;
  completionStatus: string;
  difficulty: number;
  content: string;
  createdAt: string;
  user: { id: string; displayName: string; avatarKey?: string };
  course: { id: string; slug: string; name: string; distanceKm: number; region: string };
  _count: { comments: number; likes: number };
}

const statusLabels: Record<string, string> = {
  success: "성공",
  dnf: "DNF",
  dnq: "DNQ",
  dns: "DNS",
  completed: "성공",
  partial: "부분완주",
};

const badgeVariants: Record<string, "success" | "warning" | "default" | "danger"> = {
  success: "success",
  dnf: "warning",
  dnq: "default",
  dns: "danger",
  completed: "success",
  partial: "default",
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-[10px] inline-flex gap-px">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={i < rating ? "text-sky-yellow" : "text-t-muted/30"}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export default function RecentReviewsHome({ country }: { country?: string } = {}) {
  const [reviews, setReviews] = useState<ReviewEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/community/recent-reviews?limit=6${country ? `&country=${country}` : ""}`)
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setReviews(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [country]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, "");

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-t-text">최근 후기</h3>
        <Link
          href="/community/journals"
          className="text-[11px] text-t-muted hover:text-sky-blue transition-colors"
        >
          전체 보기 →
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-t-border rounded-lg overflow-hidden border border-t-border">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-t-surface px-3 py-2">
              <div className="h-4 animate-pulse bg-t-subtle rounded mb-1.5" />
              <div className="h-3 animate-pulse bg-t-subtle rounded w-2/3 mb-1.5" />
              <div className="h-3 animate-pulse bg-t-subtle rounded w-1/2" />
            </div>
          ))
        ) : reviews.length === 0 ? (
          <div className="bg-t-surface px-3 py-4 text-center text-[11px] text-t-muted col-span-full">
            아직 후기가 없습니다
          </div>
        ) : (
          reviews.map((r) => (
            <div key={r.id} className="bg-t-surface px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px]">
                <Link
                  href={`/users/${r.user.id}`}
                  className="font-medium truncate max-w-[80px] hover:underline"
                >
                  {r.user.displayName}
                </Link>
                {r.completionStatus && statusLabels[r.completionStatus] && (
                  <Badge variant={badgeVariants[r.completionStatus] || "default"} className="text-[9px] px-1 py-0">
                    {statusLabels[r.completionStatus]}
                  </Badge>
                )}
                <Stars rating={r.difficulty} />
                <span className="ml-auto text-[9px] text-t-faint whitespace-nowrap">
                  {formatDate(r.createdAt)}
                </span>
              </div>
              <div className="mt-0.5">
                <Link
                  href={`/courses/${r.course.slug}`}
                  className="text-[11px] text-sky-blue truncate block hover:underline"
                >
                  {r.course.name}
                </Link>
              </div>
              <p className="text-[10px] text-t-muted line-clamp-2 mt-0.5">
                {stripHtml(r.content)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
