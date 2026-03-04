"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { BarChart3, Vote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface PollOption {
  id: string;
  label: string;
  sortOrder: number;
  voteCount: number;
}

interface PollData {
  id: string;
  title: string;
  description: string | null;
  endsAt: string;
  isActive: boolean;
  hasEnded: boolean;
  createdAt: string;
  user: { id: string; displayName: string; avatarKey: string | null } | null;
  totalVotes: number;
  userVotedOptionId: string | null;
  options: PollOption[];
}

export default function ActivePolls() {
  const [polls, setPolls] = useState<PollData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPolls() {
      try {
        const res = await fetch("/api/polls?limit=2");
        if (!res.ok) throw new Error("Failed to fetch polls");
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.polls ?? [];
        setPolls(list.slice(0, 2));
      } catch {
        setPolls([]);
      } finally {
        setLoading(false);
      }
    }
    fetchPolls();
  }, []);

  return (
    <Card className="bg-t-surface border-t-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-t-text flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-t-icon" />
            진행 중인 투표
          </h3>
          <Link
            href="/community/polls"
            className="text-xs text-sky-blue hover:text-sky-orange transition-colors"
          >
            전체 보기 →
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-28 rounded-lg bg-t-faint animate-pulse"
              />
            ))}
          </div>
        ) : polls.length === 0 ? (
          <p className="text-sm text-t-muted text-center py-6">
            진행 중인 투표가 없습니다
          </p>
        ) : (
          <div className="space-y-3">
            {polls.map((poll) => {
              const maxVotes = Math.max(...poll.options.map((o) => o.voteCount), 1);
              const endsAt = new Date(poll.endsAt);
              const timeRemaining = formatDistanceToNow(endsAt, {
                locale: ko,
                addSuffix: true,
              });

              return (
                <Link
                  key={poll.id}
                  href="/community/polls"
                  className="block p-3 rounded-lg border border-t-border hover:bg-t-hover transition-colors group"
                >
                  {/* Title with live dot */}
                  <div className="flex items-center gap-2 mb-2">
                    {poll.isActive && !poll.hasEnded && (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-blue opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-blue" />
                      </span>
                    )}
                    <p className="text-sm font-semibold text-t-text truncate group-hover:text-sky-blue transition-colors">
                      {poll.title}
                    </p>
                  </div>

                  {/* Options with percentage bars */}
                  <div className="space-y-1.5">
                    {poll.options
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .slice(0, 4)
                      .map((option) => {
                        const pct =
                          poll.totalVotes > 0
                            ? Math.round((option.voteCount / poll.totalVotes) * 100)
                            : 0;

                        return (
                          <div key={option.id} className="relative">
                            <div className="flex items-center justify-between text-xs mb-0.5">
                              <span className="text-t-text truncate mr-2">
                                {option.label}
                              </span>
                              <span className="text-t-muted shrink-0">{pct}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-t-faint overflow-hidden">
                              <div
                                className="h-full rounded-full bg-sky-blue/40 transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-2 text-[11px] text-t-muted">
                    <span className="flex items-center gap-1">
                      <Vote className="h-3 w-3" />
                      {poll.totalVotes}표
                    </span>
                    <span>{timeRemaining} 마감</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
