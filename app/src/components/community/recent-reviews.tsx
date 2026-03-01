"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ReviewContent } from "@/components/ui/rich-text-editor";
import { Heart, MessageCircle } from "lucide-react";
import Link from "next/link";

interface ReviewEntry {
  id: string;
  completionStatus: string;
  difficulty: string | null;
  content: string;
  createdAt: string;
  user: { id: string; displayName: string; avatarKey: string | null };
  course: { id: string; name: string; distanceKm: number; region: string | null };
  _count: { comments: number; likes: number };
}

const COMPLETION_LABELS: Record<string, string> = {
  success: "성공",
  dnf: "DNF",
  dnq: "DNQ",
  dns: "DNS",
  completed: "성공",
  partial: "부분완주",
};

const COMPLETION_VARIANT: Record<string, "default" | "primary" | "success" | "warning" | "danger"> = {
  success: "success",
  dnf: "warning",
  dnq: "default",
  dns: "danger",
  completed: "success",
  partial: "default",
};

function Stars({ value }: { value: string | null }) {
  if (!value) return null;
  const n = Number(value);
  return (
    <span className="inline-flex items-center gap-px text-[10px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= n ? "text-sky-yellow" : "text-t-muted/30"}>★</span>
      ))}
    </span>
  );
}

export function RecentReviews() {
  const [reviews, setReviews] = useState<ReviewEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/community/recent-reviews?limit=10")
      .then((r) => r.json())
      .then(setReviews)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-t-border rounded-lg overflow-hidden border border-t-border">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-16 animate-pulse bg-t-subtle" />
        ))}
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="rounded-lg border border-t-border py-6 text-center text-xs text-t-muted">
        아직 후기가 없습니다.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-t-border rounded-lg overflow-hidden border border-t-border">
      {reviews.map((review) => (
        <div key={review.id} className="bg-t-surface px-3 py-2">
          {/* Row 1: user + status + stars + date */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <Link href={`/users/${review.user.id}`} className="font-medium text-t-text hover:underline truncate max-w-[80px]">
              {review.user.displayName}
            </Link>
            <Badge
              variant={COMPLETION_VARIANT[review.completionStatus] ?? "default"}
              className="text-[8px] px-1 py-0 leading-tight"
            >
              {COMPLETION_LABELS[review.completionStatus] ?? review.completionStatus}
            </Badge>
            <Stars value={review.difficulty} />
            <span className="ml-auto text-[9px] text-t-faint whitespace-nowrap shrink-0">
              {new Date(review.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
            </span>
          </div>

          {/* Row 2: course link */}
          <Link
            href={`/courses/${review.course.id}`}
            className="block text-[11px] text-sky-blue hover:underline truncate mt-0.5"
          >
            {review.course.name}
            {review.course.region && (
              <span className="text-t-faint ml-0.5">({review.course.region})</span>
            )}
            <span className="text-t-faint ml-1">{review.course.distanceKm}km</span>
          </Link>

          {/* Row 3: content preview */}
          <div className="mt-0.5 text-[11px] text-t-muted line-clamp-2 leading-snug">
            <ReviewContent html={review.content} />
          </div>

          {/* Row 4: engagement (inline, only if > 0) */}
          {(review._count.likes > 0 || review._count.comments > 0) && (
            <div className="mt-0.5 flex items-center gap-2 text-[9px] text-t-faint">
              {review._count.likes > 0 && (
                <span className="flex items-center gap-0.5">
                  <Heart className="h-2.5 w-2.5" />{review._count.likes}
                </span>
              )}
              {review._count.comments > 0 && (
                <span className="flex items-center gap-0.5">
                  <MessageCircle className="h-2.5 w-2.5" />{review._count.comments}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
