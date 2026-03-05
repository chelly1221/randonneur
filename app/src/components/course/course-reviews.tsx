"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor, ReviewContent } from "@/components/ui/rich-text-editor";
import { LikeButton } from "./like-button";
import { CommentSection } from "./comment-section";
import { ReportButton } from "./report-button";
import { UserAvatar } from "@/components/user/user-avatar";
import { Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReviewPhotosDisplay } from "./review-photos-display";

interface ReviewUser {
  id: string;
  displayName: string;
}

interface Review {
  id: string;
  userId: string;
  completionStatus: string;
  difficulty: string | null;
  content: string;
  createdAt: string;
  user: ReviewUser;
  _count?: { comments: number; likes: number };
}

const COMPLETION_LABELS: Record<string, string> = {
  success: "성공",
  dnf: "DNF",
  dnq: "DNQ",
  dns: "DNS",
  // legacy fallbacks
  completed: "성공",
  partial: "부분완주",
};

const COMPLETION_VARIANT: Record<string, "default" | "primary" | "success" | "warning" | "danger"> = {
  success: "success",
  dnf: "warning",
  dnq: "default",
  dns: "danger",
  // legacy fallbacks
  completed: "success",
  partial: "default",
};

const STATUS_OPTIONS: { value: string; label: string; variant: "default" | "primary" | "success" | "warning" | "danger" }[] = [
  { value: "success", label: "성공",  variant: "success" },
  { value: "dnf",     label: "DNF",   variant: "warning" },
  { value: "dnq",     label: "DNQ",   variant: "default" },
  { value: "dns",     label: "DNS",   variant: "danger"  },
];

function StarRating({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [hovered, setHovered] = useState(0);
  const filled = hovered || Number(value);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(value === String(star) ? "" : String(star))}
          className={`text-lg leading-none transition-colors ${
            star <= filled ? "text-sky-yellow" : "text-t-muted"
          }`}
        >
          ★
        </button>
      ))}
      {value && (
        <span className="ml-1 text-[10px] text-t-muted">{value}/5</span>
      )}
    </div>
  );
}

function StarDisplay({ value }: { value: string | null }) {
  if (!value) return null;
  const n = Number(value);
  return (
    <span className="inline-flex items-center gap-px text-[11px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= n ? "text-sky-yellow" : "text-t-muted/40"}>★</span>
      ))}
    </span>
  );
}

interface CourseReviewsProps {
  courseId: string;
  courseSlug?: string;
  onWriteClick?: () => void;
}

export function CourseReviews({ courseId, courseSlug, onWriteClick }: CourseReviewsProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // Like state
  const [likedReviewIds, setLikedReviewIds] = useState<string[]>([]);
  const [likedCommentIds, setLikedCommentIds] = useState<string[]>([]);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("success");
  const [editDifficulty, setEditDifficulty] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const fetchReviews = useCallback(() => {
    fetch(`/api/courses/${courseId}/reviews`)
      .then((r) => r.json())
      .then((data: Review[]) => {
        setReviews(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/likes/me")
      .then((r) => r.json())
      .then((data: { reviewIds: string[]; commentIds: string[] }) => {
        setLikedReviewIds(data.reviewIds);
        setLikedCommentIds(data.commentIds);
      })
      .catch(() => {});
  }, [session]);

  function startEdit(review: Review) {
    setEditingId(review.id);
    setEditStatus(review.completionStatus);
    setEditDifficulty(review.difficulty ?? "");
    setEditContent(review.content);
  }

  async function handleEdit(reviewId: string) {
    if (!editContent.trim()) return;
    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/reviews/${reviewId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completionStatus: editStatus,
          difficulty: editDifficulty || null,
          content: editContent.trim(),
        }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchReviews();
      }
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(reviewId: string) {
    if (!confirm("후기를 삭제하시겠습니까?")) return;
    await fetch(`/api/reviews/${reviewId}`, { method: "DELETE" });
    fetchReviews();
  }

  function isOwner(review: Review): boolean {
    return session?.user?.name === review.user.displayName;
  }

  const visibleReviews = expanded ? reviews : reviews.slice(0, 3);

  return (
    <div className="space-y-2 pb-1">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-t-muted">
          {reviews.length > 0 ? `후기 ${reviews.length}건` : "아직 후기가 없습니다."}
        </p>
        {session && (
          <button
            type="button"
            onClick={() => {
              if (courseSlug) {
                router.push(`/courses/${courseSlug}/review`);
              } else if (onWriteClick) {
                onWriteClick();
              }
            }}
            className="text-[10px] text-sky-blue hover:underline"
          >
            후기 작성
          </button>
        )}
      </div>

      {loading && (
        <div className="space-y-1">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 rounded bg-t-hover animate-pulse" />
          ))}
        </div>
      )}

      {!loading && reviews.length > 0 && (
        <div className="space-y-2">
          {visibleReviews.map((review) => (
            <div key={review.id} className="rounded border border-t-border bg-t-bg/40 px-2 py-1.5">
              {editingId === review.id ? (
                <div className="space-y-1.5">
                  {/* Status badge buttons */}
                  <div>
                    <p className="text-[10px] text-t-muted mb-1">완주 상태</p>
                    <div className="flex flex-wrap gap-1">
                      {STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setEditStatus(opt.value)}
                          className={`transition-opacity ${editStatus === opt.value ? "opacity-100 ring-2 ring-offset-1 ring-sky-blue rounded" : "opacity-50 hover:opacity-80"}`}
                        >
                          <Badge variant={opt.variant} className="text-[10px] px-2 py-0.5 cursor-pointer">
                            {opt.label}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Star difficulty */}
                  <div>
                    <p className="text-[10px] text-t-muted mb-1">체감 난이도 (선택)</p>
                    <StarRating value={editDifficulty} onChange={setEditDifficulty} />
                  </div>
                  <RichTextEditor
                    value={editContent}
                    onChange={setEditContent}
                    placeholder="후기를 입력하세요..."
                    minHeight={72}
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleEdit(review.id)}
                      disabled={editSubmitting || !editContent.trim()}
                      className="rounded bg-sky-darkblue px-3 py-1 text-[11px] text-white hover:bg-sky-darkblue/80 disabled:opacity-50"
                    >
                      {editSubmitting ? "저장 중..." : "수정"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded border border-t-border px-3 py-1 text-[11px] text-t-muted hover:bg-t-hover"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <Link href={`/users/${review.user.id}`} className="flex items-center gap-1 hover:underline">
                        <UserAvatar displayName={review.user.displayName} size="sm" />
                        <span className="text-[11px] font-medium text-t-text">
                          {review.user.displayName}
                        </span>
                      </Link>
                      <Badge
                        variant={COMPLETION_VARIANT[review.completionStatus] ?? "default"}
                        className="text-[9px] px-1.5 py-0"
                      >
                        {COMPLETION_LABELS[review.completionStatus] ?? review.completionStatus}
                      </Badge>
                      {review.difficulty && (
                        <StarDisplay value={review.difficulty} />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-t-muted whitespace-nowrap">
                        {new Date(review.createdAt).toLocaleDateString("ko-KR")}
                      </span>
                      {isOwner(review) && (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(review)}
                            className="rounded p-0.5 text-t-muted hover:text-t-text hover:bg-t-hover"
                            title="수정"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(review.id)}
                            className="rounded p-0.5 text-t-muted hover:text-sky-red hover:bg-t-hover"
                            title="삭제"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <ReviewContent html={review.content} />
                  <ReviewPhotosDisplay reviewId={review.id} />
                  <div className="mt-1.5 flex items-center gap-2">
                    <LikeButton
                      reviewId={review.id}
                      initialCount={review._count?.likes ?? 0}
                      initialLiked={likedReviewIds.includes(review.id)}
                    />
                    <CommentSection
                      reviewId={review.id}
                      commentCount={review._count?.comments ?? 0}
                      likedCommentIds={likedCommentIds}
                    />
                    {!isOwner(review) && <ReportButton reviewId={review.id} />}
                  </div>
                </>
              )}
            </div>
          ))}

          {reviews.length > 3 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center justify-center gap-1 rounded border border-t-border py-1 text-[11px] text-t-muted hover:bg-t-hover"
            >
              {expanded ? (
                <><ChevronUp className="h-3 w-3" />접기</>
              ) : (
                <><ChevronDown className="h-3 w-3" />후기 {reviews.length - 3}개 더 보기</>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
