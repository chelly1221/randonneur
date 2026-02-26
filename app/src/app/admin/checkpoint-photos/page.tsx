"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";

export const dynamic = "force-dynamic";

interface PhotoSubmission {
  id: string;
  imageKey: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
  user: { id: string; displayName: string; email: string };
  checkpoint: {
    id: string;
    name: string;
    course: { id: string; name: string; courseNumber: string | null };
  };
}

type StatusFilter = "all" | "pending" | "approved" | "rejected";

export default function AdminCheckpointPhotosPage() {
  const [submissions, setSubmissions] = useState<PhotoSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const fetchSubmissions = useCallback(() => {
    setLoading(true);
    const url =
      statusFilter === "all"
        ? "/api/admin/checkpoint-photo-submissions"
        : `/api/admin/checkpoint-photo-submissions?status=${statusFilter}`;
    fetch(url)
      .then((r) => r.json())
      .then((data: PhotoSubmission[]) => {
        setSubmissions(data);
        setLoading(false);
        const notes: Record<string, string> = {};
        for (const s of data) {
          notes[s.id] = s.adminNote ?? "";
        }
        setAdminNotes((prev) => ({ ...notes, ...prev }));
      })
      .catch(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  async function handleAction(id: string, action: "approve" | "reject") {
    setSaving(id);
    try {
      const res = await fetch(`/api/admin/checkpoint-photo-submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adminNote: adminNotes[id] || null }),
      });
      if (res.ok) {
        fetchSubmissions();
        setExpandedId(null);
      }
    } finally {
      setSaving(null);
    }
  }

  const tabs: { label: string; value: StatusFilter }[] = [
    { label: "전체", value: "all" },
    { label: "대기 중", value: "pending" },
    { label: "처리 완료", value: "approved" },
    { label: "거부됨", value: "rejected" },
  ];

  const statusLabel = (status: string) => {
    if (status === "pending") return "대기 중";
    if (status === "approved") return "승인됨";
    if (status === "rejected") return "거부됨";
    return status;
  };

  const statusVariant = (status: string): "warning" | "success" | "danger" | "default" => {
    if (status === "pending") return "warning";
    if (status === "approved") return "success";
    if (status === "rejected") return "danger";
    return "default";
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-t-text">CP 사진 제출</h1>
        <p className="text-sm text-t-muted">
          사용자가 제출한 체크포인트 사진을 검토하고 공식 CP 사진으로 등록합니다.
        </p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-t-border">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              statusFilter === tab.value
                ? "border-sky-blue text-sky-blue"
                : "border-transparent text-t-muted hover:text-t-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-t-hover animate-pulse" />
          ))}
        </div>
      )}

      {!loading && submissions.length === 0 && (
        <div className="rounded-lg border border-t-border bg-t-surface px-4 py-8 text-center">
          <p className="text-sm text-t-muted">제출된 사진이 없습니다.</p>
        </div>
      )}

      {!loading && submissions.length > 0 && (
        <div className="space-y-1">
          {submissions.map((sub) => (
            <div
              key={sub.id}
              className="rounded-lg border border-t-border bg-t-surface overflow-hidden"
            >
              {/* Row */}
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-t-hover transition-colors"
                onClick={() =>
                  setExpandedId((prev) => (prev === sub.id ? null : sub.id))
                }
              >
                {/* Thumbnail */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/images/${sub.imageKey}`}
                  alt={sub.checkpoint.name}
                  className="h-12 w-12 shrink-0 rounded object-cover border border-t-border"
                  loading="lazy"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-t-text truncate">
                      {sub.checkpoint.name}
                    </span>
                    <span className="text-xs text-t-muted truncate">
                      {sub.checkpoint.course.name}
                      {sub.checkpoint.course.courseNumber && (
                        <> · {sub.checkpoint.course.courseNumber}</>
                      )}
                    </span>
                    <Badge
                      variant={statusVariant(sub.status)}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {statusLabel(sub.status)}
                    </Badge>
                  </div>
                  <p className="text-xs text-t-muted truncate">
                    {sub.user.displayName} · {new Date(sub.createdAt).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <div className="shrink-0 text-t-muted">
                  {expandedId === sub.id ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </button>

              {/* Expanded detail */}
              {expandedId === sub.id && (
                <div className="border-t border-t-border px-4 py-3 space-y-3">
                  {/* Full image preview */}
                  <div>
                    <p className="text-xs font-medium text-t-muted mb-2">제출된 사진</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/images/${sub.imageKey}`}
                      alt={sub.checkpoint.name}
                      className="max-h-64 rounded border border-t-border object-contain"
                      loading="lazy"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`note-${sub.id}`}
                      className="text-xs font-medium text-t-muted block mb-1"
                    >
                      관리자 메모
                    </label>
                    <textarea
                      id={`note-${sub.id}`}
                      value={adminNotes[sub.id] ?? sub.adminNote ?? ""}
                      onChange={(e) =>
                        setAdminNotes((prev) => ({
                          ...prev,
                          [sub.id]: e.target.value,
                        }))
                      }
                      rows={2}
                      placeholder="메모를 입력하세요..."
                      className="w-full rounded border border-t-border bg-t-bg px-3 py-2 text-sm text-t-text placeholder:text-t-muted resize-none"
                    />
                  </div>

                  {sub.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleAction(sub.id, "approve")}
                        disabled={saving === sub.id}
                        className="rounded bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {saving === sub.id ? "처리 중..." : "승인 (CP 사진 등록)"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction(sub.id, "reject")}
                        disabled={saving === sub.id}
                        className="rounded bg-sky-red/80 px-4 py-1.5 text-sm text-white hover:bg-sky-red disabled:opacity-50"
                      >
                        {saving === sub.id ? "처리 중..." : "거부"}
                      </button>
                    </div>
                  )}

                  {sub.status !== "pending" && (
                    <p className="text-xs text-t-muted">
                      이미 처리된 제출입니다.
                      {sub.adminNote && <> 메모: {sub.adminNote}</>}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
