"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ReportData {
  id: string;
  reason: string;
  detail: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
  reporter: { id: string; displayName: string };
  review: {
    id: string;
    content: string;
    user: { id: string; displayName: string };
    course: { id: string; name: string };
  } | null;
  comment: {
    id: string;
    content: string;
    user: { id: string; displayName: string };
  } | null;
}

const REASON_LABELS: Record<string, string> = {
  spam: "스팸",
  harassment: "괴롭힘",
  misinformation: "허위 정보",
  inappropriate: "부적절",
  other: "기타",
};

const STATUS_VARIANT: Record<string, "default" | "warning" | "success" | "primary"> = {
  pending: "warning",
  resolved: "success",
  dismissed: "default",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "대기",
  resolved: "처리됨",
  dismissed: "기각",
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const url = filter === "all" ? "/api/admin/reports" : `/api/admin/reports?status=${filter}`;
    setLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((data) => setReports(data.reports))
      .finally(() => setLoading(false));
  }, [filter]);

  async function handleStatusChange(reportId: string, status: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNote: adminNote.trim() || undefined }),
      });
      if (res.ok) {
        const updated = await res.json();
        setReports((prev) => prev.map((r) => (r.id === reportId ? updated : r)));
        setExpandedId(null);
        setAdminNote("");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">신고 관리</h1>

      <div className="mb-4 flex gap-2">
        {["all", "pending", "resolved", "dismissed"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded px-3 py-1.5 text-sm transition-colors ${
              filter === s
                ? "bg-sky-darkblue text-white"
                : "bg-t-subtle text-t-muted hover:bg-t-hover"
            }`}
          >
            {s === "all" ? "전체" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-t-subtle" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <div className="px-4 py-8 text-center text-t-faint">신고가 없습니다.</div>
        </Card>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => (
            <Card key={report.id}>
              <div
                className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-t-hover"
                onClick={() => {
                  setExpandedId(expandedId === report.id ? null : report.id);
                  setAdminNote(report.adminNote ?? "");
                }}
              >
                <div className="flex items-center gap-3">
                  <Badge variant="danger">{REASON_LABELS[report.reason] ?? report.reason}</Badge>
                  <span className="text-sm max-w-[200px] truncate">
                    {report.review
                      ? `후기: ${report.review.user.displayName}`
                      : report.comment
                      ? `댓글: ${report.comment.user.displayName}`
                      : "-"}
                  </span>
                  <span className="text-xs text-t-muted">신고자: {report.reporter.displayName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={STATUS_VARIANT[report.status] ?? "default"}>
                    {STATUS_LABELS[report.status] ?? report.status}
                  </Badge>
                  <span className="text-xs text-t-muted">
                    {format(new Date(report.createdAt), "yyyy.MM.dd")}
                  </span>
                  {expandedId === report.id ? (
                    <ChevronUp className="h-4 w-4 text-t-muted" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-t-muted" />
                  )}
                </div>
              </div>

              {expandedId === report.id && (
                <div className="border-t border-t-border bg-t-bg/50 px-4 py-3 space-y-2">
                  <div className="text-xs">
                    <span className="text-t-muted">신고 대상 내용: </span>
                    <span className="text-t-text">
                      {report.review?.content?.replace(/<[^>]+>/g, "").slice(0, 200) ?? report.comment?.content ?? "-"}
                    </span>
                  </div>
                  {report.detail && (
                    <div className="text-xs">
                      <span className="text-t-muted">상세: </span>
                      <span className="text-t-text">{report.detail}</span>
                    </div>
                  )}
                  {report.review?.course && (
                    <div className="text-xs">
                      <span className="text-t-muted">코스: </span>
                      <span className="text-t-text">{report.review.course.name}</span>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-t-muted mb-1">관리자 메모</label>
                    <textarea
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      className="w-full rounded border border-t-border bg-t-surface p-2 text-xs text-t-text resize-none"
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStatusChange(report.id, "resolved")}
                      disabled={saving}
                      className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      처리
                    </button>
                    <button
                      onClick={() => handleStatusChange(report.id, "dismissed")}
                      disabled={saving}
                      className="rounded bg-gray-500 px-3 py-1 text-xs text-white hover:bg-gray-600 disabled:opacity-50"
                    >
                      기각
                    </button>
                    {report.status !== "pending" && (
                      <button
                        onClick={() => handleStatusChange(report.id, "pending")}
                        disabled={saving}
                        className="rounded border border-t-border px-3 py-1 text-xs text-t-muted hover:bg-t-hover disabled:opacity-50"
                      >
                        대기로
                      </button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
