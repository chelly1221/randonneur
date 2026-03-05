"use client";

import { useState, useRef, useEffect } from "react";

interface ShareButtonProps {
  courseSlug: string;
  courseName: string;
  courseDistance: number;
  className?: string;
}

const BASE_URL = "https://audax.3chan.kr";

export function ShareButton({
  courseSlug,
  courseName,
  courseDistance,
  className,
}: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const courseUrl = `${BASE_URL}/courses/${courseSlug}`;
  const shareText = `${courseName} - ${courseDistance}km 랜도너링 코스`;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function copyLink(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(courseUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = courseUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function openKakao(e: React.MouseEvent) {
    e.stopPropagation();
    window.open(
      `https://story.kakao.com/share?url=${encodeURIComponent(courseUrl)}`,
      "_blank",
      "noopener,noreferrer,width=600,height=500"
    );
    setOpen(false);
  }

  function openTwitter(e: React.MouseEvent) {
    e.stopPropagation();
    window.open(
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(courseUrl)}&text=${encodeURIComponent(shareText)}`,
      "_blank",
      "noopener,noreferrer,width=600,height=500"
    );
    setOpen(false);
  }

  function openFacebook(e: React.MouseEvent) {
    e.stopPropagation();
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(courseUrl)}`,
      "_blank",
      "noopener,noreferrer,width=600,height=500"
    );
    setOpen(false);
  }

  return (
    <div ref={ref} className={`relative inline-flex ${className ?? ""}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-t-border text-[11px] text-t-text hover:bg-t-hover transition-colors"
        title="공유하기"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-t-border bg-t-surface shadow-lg">
          <div className="py-1">
            <button
              type="button"
              onClick={copyLink}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-t-text hover:bg-t-hover transition-colors"
            >
              <svg className="h-4 w-4 shrink-0 text-t-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied ? (
                <span className="text-sky-blue font-medium">복사됨!</span>
              ) : (
                <span>링크 복사</span>
              )}
            </button>

            <button
              type="button"
              onClick={openKakao}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-t-text hover:bg-t-hover transition-colors"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3C6.48 3 2 6.58 2 10.9c0 2.78 1.86 5.22 4.65 6.6-.15.56-.96 3.6-.99 3.82 0 0-.02.17.09.24.11.06.24.01.24.01.32-.04 3.7-2.44 4.28-2.86.56.08 1.14.13 1.73.13 5.52 0 10-3.58 10-7.94S17.52 3 12 3z" />
              </svg>
              <span>카카오톡</span>
            </button>

            <button
              type="button"
              onClick={openTwitter}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-t-text hover:bg-t-hover transition-colors"
            >
              <svg className="h-4 w-4 shrink-0 text-t-muted" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span>트위터</span>
            </button>

            <button
              type="button"
              onClick={openFacebook}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-t-text hover:bg-t-hover transition-colors"
            >
              <svg className="h-4 w-4 shrink-0 text-t-muted" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span>페이스북</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
