"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Heart } from "lucide-react";

interface LikeButtonProps {
  reviewId?: string;
  commentId?: string;
  initialCount: number;
  initialLiked: boolean;
}

export function LikeButton({
  reviewId,
  commentId,
  initialCount,
  initialLiked,
}: LikeButtonProps) {
  const { data: session } = useSession();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  if (!session) {
    return count > 0 ? (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-t-muted">
        <Heart className="h-3 w-3" />
        {count}
      </span>
    ) : null;
  }

  async function toggle() {
    setLoading(true);
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reviewId ? { reviewId } : { commentId }),
      });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setCount(data.count);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`inline-flex items-center gap-0.5 text-[10px] transition-colors ${
        liked
          ? "text-sky-red hover:text-sky-red/70"
          : "text-t-muted hover:text-sky-red"
      }`}
      title={liked ? "좋아요 취소" : "좋아요"}
    >
      <Heart className="h-3 w-3" fill={liked ? "currentColor" : "none"} />
      {count > 0 && count}
    </button>
  );
}
