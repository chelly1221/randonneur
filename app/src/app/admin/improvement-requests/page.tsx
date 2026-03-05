"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  gpx:        "GPX 최신화",
  checkpoint: "체크포인트 수정",
  route:      "경로 변경",
  info:       "코스 정보 오류",
  other:      "기타",
};

interface ImprovementRequest {
  id: string;
  category: string | null;
  content: string;
  images: string[];
  imageUrls: string[];
  status: string;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; displayName: string; email: string };
  course: { id: string; name: string; courseNumber: string | null };
}

type StatusFilter = "all" | "pending" | "resolved";

export default function AdminImprovementRequestsPage() {
  const [requests, setRequests] = useState<ImprovementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const fetchRequests = useCallback(() => {
    setLoading(true);
    const url =
      statusFilter === "all"
        ? "/api/admin/improvement-requests"
        : `/api/admin/improvement-requests?status=${statusFilter}`;
    fetch(url)
      .then((r) => r.json())
      .then((data: ImprovementRequest[]) => {
        setRequests(data);
        setLoading(false);
        // Initialize admin note inputs
        const notes: Record<string, string> = {};
        for (const r of data) {
          notes[r.id] = r.adminNote ?? "";
        }
        setAdminNotes((prev) => ({ ...notes, ...prev }));
      })
      .catch(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  async function handlePatch(
    id: string,
    status: string,
    adminNote: string
  ) {
    setSaving(id);
    try {
      const res = await fetch(`/api/admin/improvement-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNote: adminNote || null }),
      });
      if (res.ok) {
        fetchRequests();
        setExpandedId(null);
      }
    } finally {
      setSaving(null);
    }
  }

  const tabs: { label: string; value: StatusFilter }[] = [
    { label: "전체", value: "all" },
    { label: "대기 중", value: "pending" },
    { label: "처리 완료", value: "resolved" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-t-text">코스 수정 요청</h1>
        <p className="text-sm text-t-muted">사용자가 제출한 코스 수정 요청을 검토하고 처리합니다.</p>
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

      {!loading && requests.length === 0 && (
        <div className="rounded-lg border border-t-border bg-t-surface px-4 py-8 text-center">
          <p className="text-sm text-t-muted">요청이 없습니다.</p>
        </div>
      )}

      {!loading && requests.length > 0 && (
        <div className="space-y-1">
          {requests.map((req) => (
            <div
              key={req.id}
              className="rounded-lg border border-t-border bg-t-surface overflow-hidden"
            >
              {/* Row */}
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-t-hover transition-colors"
                onClick={() =>
                  setExpandedId((prev) => (prev === req.id ? null : req.id))
                }
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-t-text truncate">
                      {req.course.name}
                    </span>
                    {req.course.courseNumber && (
                      <span className="text-xs text-t-muted">
                        {req.course.courseNumber}
                      </span>
                    )}
                    {req.category && (
                      <Badge className="text-[10px] px-1.5 py-0">
                        {CATEGORY_LABELS[req.category] ?? req.category}
                      </Badge>
                    )}
                    <Badge
                      variant={req.status === "pending" ? "warning" : "success"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {req.status === "pending" ? "대기 중" : "처리 완료"}
                    </Badge>
                  </div>
                  <p className="text-xs text-t-muted truncate">
                    {req.user.displayName} · {new Date(req.createdAt).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <div className="shrink-0 text-t-muted">
                  {expandedId === req.id ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </button>

              {/* Expanded detail */}
              {expandedId === req.id && (
                <div className="border-t border-t-border px-4 py-3 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-t-muted mb-1">요청 내용</p>
                    <p className="text-sm text-t-text whitespace-pre-wrap break-words">
                      {req.content}
                    </p>
                  </div>

                  {req.imageUrls && req.imageUrls.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-t-muted mb-1">첨부 이미지</p>
                      <div className="flex flex-wrap gap-2">
                        {req.imageUrls.map((url, i) => (
                          <a
                            key={req.images[i] || i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`첨부 ${i + 1}`}
                              className="h-20 w-20 rounded-lg object-cover border border-t-border hover:opacity-80 transition-opacity"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor={`note-${req.id}`}
                      className="text-xs font-medium text-t-muted block mb-1"
                    >
                      관리자 메모
                    </label>
                    <textarea
                      id={`note-${req.id}`}
                      value={adminNotes[req.id] ?? req.adminNote ?? ""}
                      onChange={(e) =>
                        setAdminNotes((prev) => ({
                          ...prev,
                          [req.id]: e.target.value,
                        }))
                      }
                      rows={2}
                      placeholder="처리 내용 또는 메모를 입력하세요..."
                      className="w-full rounded border border-t-border bg-t-bg px-3 py-2 text-sm text-t-text placeholder:text-t-muted resize-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    {req.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() =>
                          handlePatch(req.id, "resolved", adminNotes[req.id] ?? "")
                        }
                        disabled={saving === req.id}
                        className="rounded bg-sky-blue/80 px-4 py-1.5 text-sm text-white hover:bg-sky-blue disabled:opacity-50"
                      >
                        {saving === req.id ? "처리 중..." : "처리 완료"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          handlePatch(req.id, "pending", adminNotes[req.id] ?? "")
                        }
                        disabled={saving === req.id}
                        className="rounded border border-t-border px-4 py-1.5 text-sm text-t-text hover:bg-t-hover disabled:opacity-50"
                      >
                        {saving === req.id ? "처리 중..." : "재오픈"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        handlePatch(req.id, req.status, adminNotes[req.id] ?? "")
                      }
                      disabled={saving === req.id}
                      className="rounded border border-t-border px-4 py-1.5 text-sm text-t-muted hover:bg-t-hover disabled:opacity-50"
                    >
                      메모만 저장
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
