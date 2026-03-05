"use client";

import { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { UserAvatar } from "@/components/user/user-avatar";
import Link from "next/link";

interface PhotoLightboxProps {
  imageUrl: string;
  imageKey: string;
  user?: { id: string; displayName: string; avatarKey?: string | null } | null;
  course?: { id: string; slug: string; name: string; region?: string | null } | null;
  caption?: string | null;
  createdAt?: string | null;
  onClose: () => void;
}

export function PhotoLightbox({
  imageUrl,
  imageKey,
  user,
  course,
  caption,
  createdAt,
  onClose,
}: PhotoLightboxProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
        aria-label="닫기"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="relative mx-4 flex max-h-[90vh] max-w-4xl flex-col items-center">
        {/* Image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl || `/api/images/${encodeURIComponent(imageKey)}`}
          alt={caption ?? "사진"}
          className="max-h-[75vh] max-w-full rounded-lg object-contain"
        />

        {/* Info panel */}
        <div className="mt-3 w-full max-w-lg rounded-lg bg-t-surface/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            {/* User info */}
            {user && (
              <Link
                href={`/users/${user.id}`}
                className="flex items-center gap-2 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <UserAvatar
                  displayName={user.displayName}
                  avatarKey={user.avatarKey}
                  size="sm"
                />
                <span className="text-sm font-medium text-t-text">
                  {user.displayName}
                </span>
              </Link>
            )}

            {/* Date */}
            {createdAt && (
              <span className="text-xs text-t-muted whitespace-nowrap">
                {new Date(createdAt).toLocaleDateString("ko-KR")}
              </span>
            )}
          </div>

          {/* Course link */}
          {course && (
            <Link
              href={`/courses/${course.slug}`}
              className="mt-1.5 block text-xs text-sky-blue hover:underline truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {course.name}
              {course.region && (
                <span className="ml-1 text-t-muted">({course.region})</span>
              )}
            </Link>
          )}

          {/* Caption */}
          {caption && (
            <p className="mt-1.5 text-sm text-t-text">{caption}</p>
          )}
        </div>
      </div>
    </div>
  );
}
