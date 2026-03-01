"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PollCard, type PollCardData } from "@/components/community/poll-card";
import { BarChart3 } from "lucide-react";
import { useSession } from "next-auth/react";

export function PollList() {
  const { data: session } = useSession();
  const [polls, setPolls] = useState<PollCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEnded, setShowEnded] = useState(false);

  const isLoggedIn = !!session?.user;

  // For checking ownership
  const [currentDbUserId, setCurrentDbUserId] = useState<string | null>(null);
  const isAdmin = (session?.user?.roles ?? []).includes("admin");

  useEffect(() => {
    if (session?.user?.id) {
      fetch("/api/users/me")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.id) setCurrentDbUserId(data.id);
        })
        .catch(() => {});
    }
  }, [session?.user?.id]);

  const fetchPolls = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (showEnded) params.set("includeEnded", "true");
      const res = await fetch(`/api/polls?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPolls(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [showEnded]);

  useEffect(() => {
    fetchPolls();
  }, [fetchPolls]);

  const handleDelete = (pollId: string) => {
    setPolls((prev) => prev.filter((p) => p.id !== pollId));
  };

  const activePolls = polls.filter((p) => !p.hasEnded);
  const endedPolls = polls.filter((p) => p.hasEnded);

  return (
    <div>
      {/* Filter toggle */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setShowEnded(false)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            !showEnded
              ? "bg-sky-darkblue text-white"
              : "text-t-muted hover:bg-t-hover"
          }`}
        >
          진행 중
        </button>
        <button
          onClick={() => setShowEnded(true)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            showEnded
              ? "bg-sky-darkblue text-white"
              : "text-t-muted hover:bg-t-hover"
          }`}
        >
          전체 (종료 포함)
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-t-subtle" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && polls.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <BarChart3 className="mx-auto mb-2 h-8 w-8 text-t-muted" />
            <p className="text-sm text-t-muted">진행 중인 투표가 없습니다.</p>
          </CardContent>
        </Card>
      )}

      {/* Poll list */}
      {!loading && polls.length > 0 && (
        <div className="space-y-3">
          {!showEnded
            ? activePolls.map((poll) => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  isLoggedIn={isLoggedIn}
                  onDelete={handleDelete}
                  isOwnerOrAdmin={
                    isAdmin || (currentDbUserId !== null && poll.user.id === currentDbUserId)
                  }
                />
              ))
            : [...activePolls, ...endedPolls].map((poll) => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  isLoggedIn={isLoggedIn}
                  onDelete={handleDelete}
                  isOwnerOrAdmin={
                    isAdmin || (currentDbUserId !== null && poll.user.id === currentDbUserId)
                  }
                />
              ))}
          {!showEnded && activePolls.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center">
                <BarChart3 className="mx-auto mb-2 h-8 w-8 text-t-muted" />
                <p className="text-sm text-t-muted">진행 중인 투표가 없습니다.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
