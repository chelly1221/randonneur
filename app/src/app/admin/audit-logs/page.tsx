"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  course_create: "코스 생성",
  course_update: "코스 수정",
  course_delete: "코스 삭제",
  course_archive: "코스 보관",
  user_ban: "유저 정지",
  user_mute: "유저 음소거",
  user_activate: "유저 활성화",
  settings_update: "설정 변경",
  scraper_run: "스크래퍼 실행",
  backup_create: "백업 생성",
  backup_restore: "백업 복원",
};

const ACTION_VARIANTS: Record<string, "default" | "primary" | "success" | "warning" | "danger"> = {
  course_create: "success",
  course_update: "primary",
  course_delete: "danger",
  course_archive: "warning",
  user_ban: "danger",
  user_mute: "warning",
  user_activate: "success",
  settings_update: "primary",
  scraper_run: "default",
  backup_create: "default",
  backup_restore: "warning",
};

interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ipHash: string | null;
  createdAt: string;
  user: {
    id: string;
    displayName: string;
    email: string;
  };
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "30");
    if (actionFilter) params.set("action", actionFilter);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);

    try {
      const res = await fetch(`/api/admin/audit-logs?${params}`);
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function handleFilterApply() {
    setPage(1);
    fetchLogs();
  }

  function formatDetails(entry: AuditLogEntry): string {
    const parts: string[] = [];
    if (entry.targetType) parts.push(entry.targetType);
    if (entry.targetId) parts.push(entry.targetId.slice(0, 8) + "...");
    if (entry.details) {
      const d = entry.details;
      if (typeof d === "object") {
        // Show meaningful detail fields
        if ("name" in d) parts.push(String(d.name));
        if ("scraper" in d) parts.push(String(d.scraper));
        if ("status" in d) parts.push(String(d.status));
        if ("displayName" in d) parts.push(String(d.displayName));
      }
    }
    return parts.join(" / ") || "—";
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">감사 로그</h1>
        <span className="text-sm text-t-muted">
          총 {total.toLocaleString()}건
        </span>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-t-muted">
              액션
            </label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="rounded border border-t-border bg-t-surface px-3 py-1.5 text-sm"
            >
              <option value="">전체</option>
              {Object.entries(ACTION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-t-muted">
              시작일
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded border border-t-border bg-t-surface px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-t-muted">
              종료일
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded border border-t-border bg-t-surface px-3 py-1.5 text-sm"
            />
          </div>
          <Button size="sm" onClick={handleFilterApply}>
            <Search className="mr-1 h-3.5 w-3.5" />
            검색
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-t-border bg-t-subtle">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  시간
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  관리자
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  액션
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  대상
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  상세
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-t-divider">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-t-faint"
                  >
                    로딩중...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-t-faint"
                  >
                    감사 로그가 없습니다.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-t-hover">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-t-muted">
                      {format(new Date(log.createdAt), "yyyy.MM.dd HH:mm:ss")}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">
                        {log.user.displayName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={ACTION_VARIANTS[log.action] ?? "default"}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-t-muted">
                      {log.targetType ?? "—"}
                    </td>
                    <td className="max-w-[300px] truncate px-4 py-3 text-xs text-t-muted">
                      {formatDetails(log)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-t-border px-4 py-3">
            <span className="text-xs text-t-muted">
              {page} / {totalPages} 페이지
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
