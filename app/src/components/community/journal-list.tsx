"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { JournalCard } from "@/components/community/journal-card";
import { Loader2, BookOpen } from "lucide-react";

interface JournalEntry {
  id: string;
  title: string;
  content: string;
  rideDate: string | null;
  distance: number | null;
  createdAt: string;
  user: { id: string; displayName: string; avatarKey: string | null };
  course: { id: string; name: string } | null;
  _count: { photos: number };
  photos: { imageKey: string }[];
}

const PAGE_SIZE = 20;

export function JournalList({ userId }: { userId?: string }) {
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const fetchJournals = useCallback(
    async (currentOffset: number, append: boolean) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(currentOffset),
      });
      if (userId) params.set("userId", userId);

      const res = await fetch(`/api/journals?${params}`);
      if (!res.ok) return;
      const data = await res.json();

      if (append) {
        setJournals((prev) => [...prev, ...data.journals]);
      } else {
        setJournals(data.journals);
      }
      setTotal(data.total);
    },
    [userId]
  );

  useEffect(() => {
    setLoading(true);
    fetchJournals(0, false).finally(() => setLoading(false));
  }, [fetchJournals]);

  const handleLoadMore = async () => {
    const nextOffset = offset + PAGE_SIZE;
    setLoadingMore(true);
    await fetchJournals(nextOffset, true);
    setOffset(nextOffset);
    setLoadingMore(false);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-t-subtle" />
        ))}
      </div>
    );
  }

  if (journals.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <BookOpen className="mx-auto mb-2 h-8 w-8 text-t-muted" />
          <p className="text-sm text-t-muted">아직 작성된 일지가 없습니다.</p>
          <p className="mt-1 text-xs text-t-muted">첫 번째 라이드 일지를 작성해보세요!</p>
        </CardContent>
      </Card>
    );
  }

  const hasMore = journals.length < total;

  return (
    <div className="space-y-2">
      {journals.map((journal) => (
        <JournalCard key={journal.id} journal={journal} />
      ))}

      {hasMore && (
        <div className="pt-2 text-center">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-1.5 rounded-md border border-t-border px-4 py-2 text-sm text-t-text hover:bg-t-hover transition-colors disabled:opacity-50"
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                불러오는 중...
              </>
            ) : (
              "더 보기"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
