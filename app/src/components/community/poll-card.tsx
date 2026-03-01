"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/user/user-avatar";
import { Clock, Trash2, BarChart3, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

interface PollOption {
  id: string;
  label: string;
  sortOrder: number;
  voteCount: number;
}

export interface PollCardData {
  id: string;
  title: string;
  description: string | null;
  endsAt: string | null;
  isActive: boolean;
  hasEnded: boolean;
  createdAt: string;
  user: { id: string; displayName: string; avatarKey: string | null };
  totalVotes: number;
  userVotedOptionId: string | null;
  options: PollOption[];
}

interface PollCardProps {
  poll: PollCardData;
  isLoggedIn: boolean;
  onDelete?: (pollId: string) => void;
  isOwnerOrAdmin?: boolean;
}

/* ------------------------------------------------------------------ */
/*  CSS keyframes – injected once via a shared style element           */
/* ------------------------------------------------------------------ */
const POLL_KEYFRAMES = `
@keyframes poll-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.8); }
}
@keyframes poll-flash-success {
  0% { background-color: rgba(79, 195, 247, 0.15); }
  50% { background-color: rgba(79, 195, 247, 0.35); }
  100% { background-color: rgba(79, 195, 247, 0.05); }
}
@keyframes poll-activity-enter {
  0% { opacity: 0; transform: translateY(4px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes poll-activity-fade {
  0% { opacity: 1; }
  70% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes poll-vote-press {
  0% { transform: scale(1); }
  50% { transform: scale(0.97); }
  100% { transform: scale(1); }
}
@keyframes poll-check-pop {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.3); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
`;

function usePollStyles() {
  useEffect(() => {
    // Check the DOM for an existing style element rather than relying on a
    // module-level boolean, which breaks under React Strict Mode / concurrent
    // rendering where effects fire twice and the flag becomes stale.
    if (document.querySelector("style[data-poll-animations]")) return;
    const style = document.createElement("style");
    style.setAttribute("data-poll-animations", "");
    style.textContent = POLL_KEYFRAMES;
    document.head.appendChild(style);
    // Intentionally no cleanup — the style element is shared across all
    // PollCard instances and should persist for the lifetime of the page.
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Animated counter hook – counts from `from` to `to` over duration  */
/* ------------------------------------------------------------------ */
function useCountUp(target: number, duration = 500): number {
  const [display, setDisplay] = useState(target);
  const prevTarget = useRef(target);

  useEffect(() => {
    const from = prevTarget.current;
    prevTarget.current = target;

    if (from === target) return;

    const start = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}

export function PollCard({ poll, isLoggedIn, onDelete, isOwnerOrAdmin }: PollCardProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [userVotedOptionId, setUserVotedOptionId] = useState<string | null>(poll.userVotedOptionId);
  const [options, setOptions] = useState<PollOption[]>(poll.options);
  const [totalVotes, setTotalVotes] = useState(poll.totalVotes);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Animation states
  const [barsReady, setBarsReady] = useState(!!poll.userVotedOptionId || poll.hasEnded || !poll.isActive);
  const [justVoted, setJustVoted] = useState(false);
  const [votedOptionFlash, setVotedOptionFlash] = useState<string | null>(null);
  const [pressedOptionId, setPressedOptionId] = useState<string | null>(null);
  const [activityMessage, setActivityMessage] = useState<string | null>(null);
  const activityTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const voteFlashTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const mountedRef = useRef(true);

  const showResults = !!userVotedOptionId || poll.hasEnded || !poll.isActive;
  const canVote = isLoggedIn && !poll.hasEnded && poll.isActive;

  const animatedTotalVotes = useCountUp(totalVotes);
  usePollStyles();

  // Clean up all pending timers on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (activityTimer.current) clearTimeout(activityTimer.current);
      if (voteFlashTimer.current) clearTimeout(voteFlashTimer.current);
    };
  }, []);

  // When transitioning to results view, trigger staggered bar animation
  useEffect(() => {
    if (showResults && !barsReady) {
      // Small delay to allow DOM to paint at 0% first
      const t = setTimeout(() => setBarsReady(true), 50);
      return () => clearTimeout(t);
    }
  }, [showResults, barsReady]);

  const showActivity = useCallback((msg: string) => {
    setActivityMessage(msg);
    if (activityTimer.current) clearTimeout(activityTimer.current);
    activityTimer.current = setTimeout(() => {
      if (mountedRef.current) setActivityMessage(null);
    }, 3000);
  }, []);

  const handleVote = async () => {
    if (!selectedOptionId || submitting) return;
    setSubmitting(true);
    setPressedOptionId(selectedOptionId);

    try {
      const res = await fetch(`/api/polls/${poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId: selectedOptionId }),
      });

      if (res.ok) {
        const data = await res.json();
        // Reset bars so they animate from 0
        setBarsReady(false);
        setVotedOptionFlash(data.userVotedOptionId);
        setJustVoted(true);
        setUserVotedOptionId(data.userVotedOptionId);
        setTotalVotes(data.totalVotes);
        setOptions(data.options);
        setSelectedOptionId(null);

        showActivity("방금 투표가 추가되었습니다");

        // Clear flash after animation
        if (voteFlashTimer.current) clearTimeout(voteFlashTimer.current);
        voteFlashTimer.current = setTimeout(() => {
          if (mountedRef.current) {
            setVotedOptionFlash(null);
            setJustVoted(false);
          }
        }, 800);
      } else {
        const data = await res.json();
        alert(data.error || "오류가 발생했습니다.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
      setPressedOptionId(null);
    }
  };

  const handleChangeVote = () => {
    setUserVotedOptionId(null);
    setSelectedOptionId(null);
    setBarsReady(false);
  };

  const handleDelete = async () => {
    if (!confirm("이 투표를 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/polls/${poll.id}`, { method: "DELETE" });
      if (res.ok) {
        onDelete?.(poll.id);
      } else {
        alert("삭제에 실패했습니다.");
      }
    } catch {
      alert("오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const endsAtLabel = poll.endsAt
    ? poll.hasEnded
      ? "종료됨"
      : `${formatDistanceToNow(new Date(poll.endsAt), { locale: ko })} 남음`
    : null;

  return (
    <Card>
      <CardContent className="py-4 px-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-t-text">{poll.title}</h3>
            {/* Live pulse dot for active polls */}
            {poll.isActive && !poll.hasEnded && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span
                  className="absolute inline-flex h-full w-full rounded-full bg-sky-blue"
                  style={{ animation: "poll-pulse 2s ease-in-out infinite" }}
                />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-blue" />
              </span>
            )}
          </div>
          {isOwnerOrAdmin && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md p-1 hover:bg-sky-red/10 transition-colors text-t-muted hover:text-sky-red shrink-0 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {poll.description && (
          <p className="mb-3 -mt-1 text-xs text-t-muted line-clamp-2">
            {poll.description}
          </p>
        )}

        {/* Voting UI or Results */}
        {showResults ? (
          <div className="space-y-2">
            {options.map((option, index) => {
              const percentage =
                totalVotes > 0
                  ? Math.round((option.voteCount / totalVotes) * 100)
                  : 0;
              const isUserVote = option.id === userVotedOptionId;
              const isFlashing = option.id === votedOptionFlash;

              return (
                <div
                  key={option.id}
                  className="relative overflow-hidden rounded-md"
                  style={
                    isFlashing
                      ? { animation: "poll-flash-success 800ms ease-out" }
                      : undefined
                  }
                >
                  <div
                    className={cn(
                      "relative z-10 flex items-center justify-between border px-3 py-2 text-sm rounded-md",
                      isUserVote
                        ? "border-sky-blue bg-sky-blue/5"
                        : "border-t-border"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isUserVote && (
                        <span
                          style={
                            justVoted
                              ? { animation: "poll-check-pop 400ms ease-out" }
                              : undefined
                          }
                        >
                          <Check className="h-3.5 w-3.5 text-sky-blue shrink-0" />
                        </span>
                      )}
                      <span
                        className={cn(
                          "truncate",
                          isUserVote ? "font-medium text-sky-blue" : "text-t-text"
                        )}
                      >
                        {option.label}
                      </span>
                    </div>
                    <span className="ml-2 shrink-0 text-xs text-t-muted">
                      {option.voteCount}표 ({percentage}%)
                    </span>
                  </div>
                  {/* Animated result bar */}
                  <div
                    className={cn(
                      "absolute left-0 top-0 h-full rounded-md",
                      isUserVote ? "bg-sky-blue/10" : "bg-t-subtle"
                    )}
                    style={{
                      width: barsReady ? `${percentage}%` : "0%",
                      transition: `width 600ms ease-out ${index * 100}ms`,
                    }}
                  />
                </div>
              );
            })}

            {/* Change vote button */}
            {canVote && userVotedOptionId && (
              <button
                onClick={handleChangeVote}
                className="mt-1 text-xs text-sky-blue hover:underline"
              >
                투표 변경
              </button>
            )}
          </div>
        ) : canVote ? (
          <div className="space-y-2">
            {options.map((option) => {
              const isPressed = option.id === pressedOptionId;

              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors",
                    selectedOptionId === option.id
                      ? "border-sky-blue bg-sky-blue/5"
                      : "border-t-border hover:bg-t-hover"
                  )}
                  style={
                    isPressed
                      ? { animation: "poll-vote-press 200ms ease-out" }
                      : undefined
                  }
                >
                  <input
                    type="radio"
                    name={`poll-${poll.id}`}
                    value={option.id}
                    checked={selectedOptionId === option.id}
                    onChange={() => setSelectedOptionId(option.id)}
                    className="accent-sky-blue"
                  />
                  <span className="text-t-text">{option.label}</span>
                </label>
              );
            })}

            <button
              onClick={handleVote}
              disabled={!selectedOptionId || submitting}
              className={cn(
                "mt-1 w-full rounded-md bg-sky-darkblue px-3 py-2 text-sm font-medium text-white transition-all disabled:opacity-50",
                submitting
                  ? "scale-[0.98]"
                  : "hover:bg-sky-darkblue/90 active:scale-[0.97]"
              )}
            >
              {submitting ? "투표 중..." : "투표"}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {options.map((option) => (
              <div
                key={option.id}
                className="rounded-md border border-t-border px-3 py-2 text-sm text-t-muted"
              >
                {option.label}
              </div>
            ))}
            {!isLoggedIn && (
              <p className="text-xs text-t-muted text-center">
                로그인 후 투표할 수 있습니다.
              </p>
            )}
          </div>
        )}

        {/* Activity indicator */}
        {activityMessage && (
          <div
            className="mt-2 text-center"
            style={{ animation: "poll-activity-enter 300ms ease-out, poll-activity-fade 3s ease-out forwards" }}
          >
            <span className="inline-flex items-center gap-1 text-[10px] text-sky-blue">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-sky-blue"
                style={{ animation: "poll-pulse 1s ease-in-out infinite" }}
              />
              {activityMessage}
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between text-[10px] text-t-muted">
          <div className="flex items-center gap-2">
            <UserAvatar
              displayName={poll.user.displayName}
              avatarKey={poll.user.avatarKey}
              size="sm"
            />
            <span>{poll.user.displayName}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-0.5">
              <BarChart3 className="h-3 w-3" />
              {animatedTotalVotes}표
            </span>
            {endsAtLabel && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {endsAtLabel}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
