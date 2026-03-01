"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
  total: number;
}

function NotificationIcon({ type }: { type: string }) {
  switch (type) {
    case "comment":
      return (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      );
    case "follow":
      return (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
          />
        </svg>
      );
    case "like":
      return (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
      );
    case "completion":
      return (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
          />
        </svg>
      );
    case "event_reminder":
      return (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      );
    default:
      return (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
      );
  }
}

function typeColor(type: string): string {
  switch (type) {
    case "comment":
      return "bg-sky-blue/20 text-sky-blue";
    case "follow":
      return "bg-sky-blue/20 text-sky-blue";
    case "like":
      return "bg-sky-red/20 text-sky-red";
    case "completion":
      return "bg-emerald-500/20 text-emerald-600";
    case "event_reminder":
      return "bg-sky-orange/20 text-sky-orange";
    default:
      return "bg-t-subtle text-t-muted";
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR");
}

export function NotificationBell() {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const isLoggedIn = !!session?.user;

  // Fetch notifications
  const fetchNotifications = useCallback(async (signal?: AbortSignal) => {
    if (!isLoggedIn) return;
    try {
      const res = await fetch("/api/notifications?limit=20", { signal });
      if (res.ok) {
        const data: NotificationsResponse = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      // Silently fail other errors
    }
  }, [isLoggedIn]);

  // Fetch unread count only (lightweight polling)
  const fetchUnreadCount = useCallback(async (signal?: AbortSignal) => {
    if (!isLoggedIn) return;
    try {
      const res = await fetch("/api/notifications?limit=1", { signal });
      if (res.ok) {
        const data: NotificationsResponse = await res.json();
        setUnreadCount(data.unreadCount);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      // Silently fail other errors
    }
  }, [isLoggedIn]);

  // Initial load of unread count
  useEffect(() => {
    if (isLoggedIn && !initialLoad) {
      const controller = new AbortController();
      fetchUnreadCount(controller.signal);
      setInitialLoad(true);
      return () => controller.abort();
    }
  }, [isLoggedIn, initialLoad, fetchUnreadCount]);

  // Poll for unread count every 60 seconds, pause when tab is not visible
  useEffect(() => {
    if (!isLoggedIn) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (interval) clearInterval(interval);
      interval = setInterval(fetchUnreadCount, 60000);
    }

    function stopPolling() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stopPolling();
      } else {
        // Fetch immediately when tab becomes visible again, then resume polling
        fetchUnreadCount();
        startPolling();
      }
    }

    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isLoggedIn, fetchUnreadCount]);

  // Fetch full notifications when dropdown opens
  useEffect(() => {
    if (open) {
      const controller = new AbortController();
      setLoading(true);
      fetchNotifications(controller.signal).finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
      return () => controller.abort();
    }
  }, [open, fetchNotifications]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        bellRef.current &&
        !bellRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  // Mark all as read
  async function handleMarkAllRead() {
    if (markingRead) return;
    setMarkingRead(true);
    try {
      // Optimistic update
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);

      const res = await fetch("/api/notifications/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) {
        // Revert optimistic update on failure
        fetchNotifications();
      }
    } catch {
      // Revert optimistic update on network error
      fetchNotifications();
    } finally {
      setMarkingRead(false);
    }
  }

  // Click on a notification
  async function handleNotificationClick(notification: Notification) {
    // Mark as read (with optimistic update)
    if (!notification.read) {
      // Optimistic update immediately
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        await fetch("/api/notifications/read", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [notification.id] }),
        });
      } catch {
        // Silently fail — optimistic update stays, will sync on next poll
      }
    }

    setOpen(false);

    // Navigate if there's a link
    if (notification.link) {
      router.push(notification.link);
    }
  }

  // Don't render anything if not logged in
  if (!isLoggedIn) return null;

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={bellRef}
        onClick={() => setOpen((prev) => !prev)}
        className="relative rounded-lg p-2 text-t-muted transition-colors hover:bg-t-hover hover:text-t-text"
        title="알림"
        aria-label="알림"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-sky-red px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          ref={dropdownRef}
          className="fixed right-2 left-2 top-auto z-50 mt-2 max-w-96 overflow-hidden rounded-xl border border-t-border bg-t-surface shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-full sm:w-96"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-t-border px-4 py-3">
            <h3 className="text-sm font-semibold text-t-text">알림</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-sky-blue transition-colors hover:text-sky-blue/80"
              >
                모두 읽음
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="space-y-1 p-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="flex gap-3 rounded-lg p-3"
                  >
                    <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-t-subtle" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 animate-pulse rounded bg-t-subtle" />
                      <div className="h-2.5 w-full animate-pulse rounded bg-t-subtle" />
                      <div className="h-2 w-1/4 animate-pulse rounded bg-t-subtle" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-t-subtle">
                  <svg
                    className="h-6 w-6 text-t-muted"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                </div>
                <p className="text-sm text-t-muted">알림이 없습니다</p>
              </div>
            ) : (
              <div className="p-1">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`flex w-full gap-3 rounded-lg p-3 text-left transition-colors hover:bg-t-hover ${
                      !notification.read ? "bg-sky-blue/5" : ""
                    }`}
                  >
                    {/* Type icon */}
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${typeColor(
                        notification.type
                      )}`}
                    >
                      <NotificationIcon type={notification.type} />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-xs leading-snug ${
                            !notification.read
                              ? "font-semibold text-t-text"
                              : "font-medium text-t-text"
                          }`}
                        >
                          {notification.title}
                        </p>
                        {/* Unread dot */}
                        {!notification.read && (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-blue" />
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-t-muted line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="mt-1 text-[10px] text-t-faint">
                        {timeAgo(notification.createdAt)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
