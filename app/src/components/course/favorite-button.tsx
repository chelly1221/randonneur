"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Star } from "lucide-react";

interface FavoriteButtonProps {
  courseId: string;
  className?: string;
}

export function FavoriteButton({ courseId, className }: FavoriteButtonProps) {
  const { data: session } = useSession();
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetch("/api/favorites/me")
      .then((r) => r.json())
      .then((ids: string[]) => {
        if (ids.includes(courseId)) setFavorited(true);
      })
      .catch(() => {});
  }, [session, courseId]);

  if (!session) return null;

  async function toggle() {
    setLoading(true);
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      if (res.ok) {
        const data = await res.json();
        setFavorited(data.favorited);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`inline-flex items-center gap-1 text-sm transition-colors ${
        favorited
          ? "text-sky-yellow hover:text-sky-orange"
          : "text-t-muted hover:text-sky-yellow"
      } ${className ?? ""}`}
      title={favorited ? "즐겨찾기 해제" : "즐겨찾기 추가"}
    >
      <Star
        className="h-4 w-4"
        fill={favorited ? "currentColor" : "none"}
      />
    </button>
  );
}
