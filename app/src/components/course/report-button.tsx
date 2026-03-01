"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Flag } from "lucide-react";

const REASONS = [
  { value: "spam", label: "스팸" },
  { value: "harassment", label: "괴롭힘" },
  { value: "misinformation", label: "허위 정보" },
  { value: "inappropriate", label: "부적절한 내용" },
  { value: "other", label: "기타" },
];

interface ReportButtonProps {
  reviewId?: string;
  commentId?: string;
}

export function ReportButton({ reviewId, commentId }: ReportButtonProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!session) return null;

  async function handleSubmit() {
    if (!reason) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId: reviewId ?? undefined,
          commentId: commentId ?? undefined,
          reason,
          detail: detail.trim() || undefined,
        }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(() => {
          setOpen(false);
          setDone(false);
          setReason("");
          setDetail("");
        }, 1500);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return <span className="text-[9px] text-t-muted">신고 완료</span>;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded p-0.5 text-t-muted hover:text-sky-red"
        title="신고"
      >
        <Flag className="h-2.5 w-2.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded border border-t-border bg-t-surface p-2 shadow-lg">
          <p className="mb-1.5 text-[10px] font-medium text-t-text">신고 사유</p>
          <div className="space-y-1 mb-2">
            {REASONS.map((r) => (
              <label key={r.value} className="flex items-center gap-1.5 text-[10px] text-t-text cursor-pointer">
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="h-3 w-3"
                />
                {r.label}
              </label>
            ))}
          </div>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="상세 내용 (선택)"
            className="w-full rounded border border-t-border bg-t-bg p-1.5 text-[10px] text-t-text resize-none"
            rows={2}
          />
          <div className="mt-1.5 flex gap-1">
            <button
              onClick={handleSubmit}
              disabled={submitting || !reason}
              className="rounded bg-sky-red px-2 py-0.5 text-[10px] text-white hover:bg-sky-red/80 disabled:opacity-50"
            >
              {submitting ? "전송 중..." : "신고"}
            </button>
            <button
              onClick={() => { setOpen(false); setReason(""); setDetail(""); }}
              className="rounded border border-t-border px-2 py-0.5 text-[10px] text-t-muted hover:bg-t-hover"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
