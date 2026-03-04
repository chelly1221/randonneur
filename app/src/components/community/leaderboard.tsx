"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { UserAvatar } from "@/components/user/user-avatar";

type Category = "completions" | "distance" | "elevation";
type Period = "all" | "year" | "month";

interface RankingEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarKey: string | null;
  value: number;
  completionCount: number;
}

const CATEGORY_TABS: { key: Category; label: string; unit: string }[] = [
  { key: "completions", label: "완주 횟수", unit: "회" },
  { key: "distance", label: "총 거리 (km)", unit: "km" },
  { key: "elevation", label: "총 고도 (m)", unit: "m" },
];

const PERIOD_FILTERS: { key: Period; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "year", label: "올해" },
  { key: "month", label: "이번 달" },
];

function formatValue(value: number, category: Category): string {
  if (category === "distance") {
    return value.toLocaleString("ko-KR", {
      maximumFractionDigits: 1,
    });
  }
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-white shadow-sm">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-white shadow-sm">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-700 text-xs font-bold text-white shadow-sm">
        3
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center text-sm font-semibold text-t-muted">
      {rank}
    </span>
  );
}

export function Leaderboard() {
  const [category, setCategory] = useState<Category>("completions");
  const [period, setPeriod] = useState<Period>("all");
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);

    fetch(
      `/api/community/leaderboard?category=${category}&period=${period}&limit=20`,
      { signal: controller.signal }
    )
      .then((r) => r.json())
      .then((data) => {
        setRankings(data.rankings ?? []);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setRankings([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return controller;
  }, [category, period]);

  useEffect(() => {
    const controller = fetchLeaderboard();
    return () => controller.abort();
  }, [fetchLeaderboard]);

  const currentTab = CATEGORY_TABS.find((t) => t.key === category)!;

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      <div className="flex gap-1 rounded-lg border border-t-border bg-t-surface p-1">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCategory(tab.key)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              category === tab.key
                ? "bg-sky-blue/15 text-sky-blue"
                : "text-t-muted hover:text-t-text hover:bg-t-hover"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Period filter */}
      <div className="flex gap-1 text-xs">
        {PERIOD_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setPeriod(f.key)}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              period === f.key
                ? "bg-sky-blue text-white"
                : "bg-t-subtle text-t-muted hover:text-t-text"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Rankings list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-t-border p-3"
            >
              <div className="h-7 w-7 animate-pulse rounded-full bg-t-subtle" />
              <div className="h-8 w-8 animate-pulse rounded-full bg-t-subtle" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-24 animate-pulse rounded bg-t-subtle" />
              </div>
              <div className="h-4 w-16 animate-pulse rounded bg-t-subtle" />
            </div>
          ))}
        </div>
      ) : rankings.length === 0 ? (
        <div className="rounded-lg border border-t-border py-12 text-center text-sm text-t-muted">
          {period === "month"
            ? "이번 달 기록이 없습니다."
            : period === "year"
              ? "올해 기록이 없습니다."
              : "아직 완주 기록이 없습니다."}
        </div>
      ) : (
        <div className="divide-y divide-t-border rounded-lg border border-t-border overflow-hidden">
          {rankings.map((entry) => (
            <div
              key={entry.userId}
              className={`flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-t-hover ${
                entry.rank <= 3 ? "bg-t-surface" : ""
              }`}
            >
              {/* Rank */}
              <RankBadge rank={entry.rank} />

              {/* Avatar */}
              <UserAvatar
                displayName={entry.displayName}
                avatarKey={entry.avatarKey}
                size="md"
              />

              {/* User info */}
              <div className="flex-1 min-w-0">
                <Link
                  href={`/users/${entry.userId}`}
                  className="text-sm font-medium text-t-text hover:text-sky-blue hover:underline transition-colors truncate block"
                >
                  {entry.displayName}
                </Link>
                {category !== "completions" && (
                  <span className="text-[11px] text-t-muted">
                    {entry.completionCount.toLocaleString("ko-KR")}회 완주
                  </span>
                )}
              </div>

              {/* Value */}
              <div className="text-right shrink-0">
                <span
                  className={`text-sm font-bold ${
                    entry.rank === 1
                      ? "text-amber-500"
                      : entry.rank === 2
                        ? "text-gray-400"
                        : entry.rank === 3
                          ? "text-amber-700"
                          : "text-t-text"
                  }`}
                >
                  {formatValue(entry.value, category)}
                </span>
                <span className="ml-0.5 text-xs text-t-muted">
                  {currentTab.unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
