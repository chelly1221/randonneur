"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { UserPlus, UserCheck } from "lucide-react";

interface FollowButtonProps {
  userId: string;
  initialFollowing?: boolean;
}

export function FollowButton({ userId, initialFollowing = false }: FollowButtonProps) {
  const { data: session } = useSession();
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  if (!session) return null;

  async function toggle() {
    setLoading(true);
    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followingId: userId }),
      });
      if (res.ok) {
        const data = await res.json();
        setFollowing(data.following);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        following
          ? "border border-t-border bg-t-surface text-t-text hover:bg-t-hover"
          : "bg-sky-darkblue text-white hover:bg-sky-darkblue/90"
      } disabled:opacity-50`}
    >
      {following ? (
        <>
          <UserCheck className="h-3.5 w-3.5" />
          팔로잉
        </>
      ) : (
        <>
          <UserPlus className="h-3.5 w-3.5" />
          팔로우
        </>
      )}
    </button>
  );
}
