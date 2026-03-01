"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { UserAvatar } from "@/components/user/user-avatar";
import { Trophy, BookOpen, UserPlus, UserCheck, ExternalLink } from "lucide-react";
import Link from "next/link";

interface UserPreviewData {
  id: string;
  displayName: string;
  email: string | null;
  role: string;
  avatarKey: string | null;
  completionCount: number;
  journalCount: number;
  recentActivity: {
    type: "completion" | "review";
    courseName: string;
    courseId: string;
    date: string;
  }[];
  isFollowing: boolean;
  isSelf: boolean;
}

// In-memory cache for preview data to avoid repeated fetches
const CACHE_MAX_SIZE = 50;
const previewCache = new Map<string, { data: UserPreviewData; ts: number }>();
const CACHE_TTL = 60_000; // 1 minute

/** Evict expired entries and enforce max size */
function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of previewCache) {
    if (now - entry.ts >= CACHE_TTL) {
      previewCache.delete(key);
    }
  }
  // If still over limit, remove oldest entries
  if (previewCache.size > CACHE_MAX_SIZE) {
    const entries = [...previewCache.entries()].sort(
      (a, b) => a[1].ts - b[1].ts
    );
    const toRemove = entries.slice(0, previewCache.size - CACHE_MAX_SIZE);
    for (const [key] of toRemove) {
      previewCache.delete(key);
    }
  }
}

interface UserPopoverProps {
  userId: string;
  displayName: string;
  children: ReactNode;
}

export function UserPopover({ userId, displayName, children }: UserPopoverProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<UserPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    placement: "above" | "below";
  }>({ top: 0, left: 0, placement: "below" });

  const triggerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);

  // Track mount state to safely use createPortal (avoids SSR document access)
  useEffect(() => {
    setMounted(true);
  }, []);

  const clearTimers = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverHeight = 260; // approximate height
    const popoverWidth = 280;
    const margin = 8;

    // Determine if popover fits above or below
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement = spaceBelow >= popoverHeight + margin || spaceBelow >= spaceAbove
      ? "below"
      : "above";

    // Horizontal centering with viewport constraints (viewport-relative for fixed positioning)
    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8));

    const top = placement === "below"
      ? rect.bottom + margin
      : rect.top - popoverHeight - margin;

    setPosition({ top, left, placement });
  }, []);

  const fetchPreview = useCallback(async () => {
    // Check cache first
    const cached = previewCache.get(userId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setPreview(cached.data);
      setFollowing(cached.data.isFollowing);
      return;
    }

    setLoading(true);
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    try {
      const res = await fetch(`/api/users/${userId}/preview`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data: UserPreviewData = await res.json();
      setPreview(data);
      setFollowing(data.isFollowing);
      previewCache.set(userId, { data, ts: Date.now() });
      pruneCache();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const handleShow = useCallback(() => {
    clearTimers();
    showTimeoutRef.current = setTimeout(() => {
      setOpen(true);
      calculatePosition();
      fetchPreview();
    }, 300);
  }, [clearTimers, calculatePosition, fetchPreview]);

  const handleHide = useCallback(() => {
    clearTimers();
    hideTimeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 200);
  }, [clearTimers]);

  const handlePopoverEnter = useCallback(() => {
    // Cancel the hide timeout when mouse enters popover
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const handlePopoverLeave = useCallback(() => {
    handleHide();
  }, [handleHide]);

  // Handle tap on mobile
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Only intercept on touch devices
      if (window.matchMedia("(hover: none)").matches) {
        e.preventDefault();
        e.stopPropagation();
        if (open) {
          setOpen(false);
        } else {
          setOpen(true);
          calculatePosition();
          fetchPreview();
        }
      }
    },
    [open, calculatePosition, fetchPreview]
  );

  // Close on outside click (mobile) and also touch outside
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Close and reposition on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    function handleScrollOrResize() {
      // Reposition to follow the trigger
      calculatePosition();
    }
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open, calculatePosition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
      fetchControllerRef.current?.abort();
    };
  }, [clearTimers]);

  // Toggle follow
  const handleFollowToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!session || followLoading) return;

    setFollowLoading(true);
    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followingId: userId }),
      });
      if (res.ok) {
        const data = await res.json();
        setFollowing(data.following);
        // Update cache
        const cached = previewCache.get(userId);
        if (cached) {
          cached.data.isFollowing = data.following;
          cached.ts = Date.now();
        }
      }
    } finally {
      setFollowLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}.${d.getDate()}`;
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleShow}
        onMouseLeave={handleHide}
        onClick={handleClick}
        className="inline cursor-pointer"
      >
        {children}
      </span>

      {open &&
        mounted &&
        createPortal(
          <div
            ref={popoverRef}
            onMouseEnter={handlePopoverEnter}
            onMouseLeave={handlePopoverLeave}
            className="fixed z-[9999]"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              width: 280,
              animation: position.placement === "above"
                ? "popoverFadeInAbove 150ms ease-out"
                : "popoverFadeIn 150ms ease-out",
            }}
          >
            <div
              className={`rounded-lg border border-t-border bg-t-surface shadow-lg ${
                position.placement === "above" ? "origin-bottom" : "origin-top"
              }`}
            >
              {loading && !preview ? (
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-full bg-t-subtle" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3.5 w-24 animate-pulse rounded bg-t-subtle" />
                      <div className="h-2.5 w-16 animate-pulse rounded bg-t-subtle" />
                    </div>
                  </div>
                  <div className="h-3 w-full animate-pulse rounded bg-t-subtle" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-t-subtle" />
                </div>
              ) : preview ? (
                <div className="p-3.5">
                  {/* Header: avatar + name + role */}
                  <div className="flex items-center gap-3 mb-3">
                    <UserAvatar
                      displayName={preview.displayName}
                      avatarKey={preview.avatarKey}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-t-text truncate">
                          {preview.displayName}
                        </span>
                        {preview.role === "admin" && (
                          <span className="inline-flex items-center rounded-full bg-sky-orange/15 px-1.5 py-0.5 text-[9px] font-medium text-sky-orange">
                            관리자
                          </span>
                        )}
                      </div>
                      {preview.email && (
                        <p className="text-[10px] text-t-faint truncate">
                          {preview.email}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 mb-3 rounded-md bg-t-subtle px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Trophy className="h-3 w-3 text-sky-blue" />
                      <span className="text-xs text-t-text">
                        완주 <strong>{preview.completionCount}</strong>회
                      </span>
                    </div>
                    <span className="text-t-faint">&middot;</span>
                    <div className="flex items-center gap-1">
                      <BookOpen className="h-3 w-3 text-sky-orange" />
                      <span className="text-xs text-t-text">
                        일지 <strong>{preview.journalCount}</strong>편
                      </span>
                    </div>
                  </div>

                  {/* Recent activity */}
                  {preview.recentActivity.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-medium text-t-muted mb-1.5">
                        최근 활동
                      </p>
                      <div className="space-y-1">
                        {preview.recentActivity.map((a, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-[11px]"
                          >
                            <span className="truncate text-t-text flex-1 min-w-0">
                              <span className="text-t-muted">
                                {a.type === "completion" ? "완주" : "후기"}
                              </span>{" "}
                              {a.courseName}
                            </span>
                            <span className="text-t-faint ml-2 shrink-0">
                              {formatDate(a.date)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {session && !preview.isSelf && (
                      <button
                        onClick={handleFollowToggle}
                        disabled={followLoading}
                        className={`flex-1 inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          following
                            ? "border border-t-border bg-t-surface text-t-text hover:bg-t-hover"
                            : "bg-sky-darkblue text-white hover:bg-sky-darkblue/90"
                        } disabled:opacity-50`}
                      >
                        {following ? (
                          <>
                            <UserCheck className="h-3 w-3" />
                            팔로잉
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-3 w-3" />
                            팔로우
                          </>
                        )}
                      </button>
                    )}
                    <Link
                      href={`/users/${userId}`}
                      onClick={() => setOpen(false)}
                      className={`inline-flex items-center justify-center gap-1 rounded-md border border-t-border bg-t-surface px-3 py-1.5 text-xs font-medium text-t-text hover:bg-t-hover transition-colors ${
                        session && !preview.isSelf ? "" : "flex-1"
                      }`}
                    >
                      <ExternalLink className="h-3 w-3" />
                      프로필 보기
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-t-muted">
                  {displayName}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
