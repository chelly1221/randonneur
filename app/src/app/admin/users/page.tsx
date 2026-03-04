"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Search, Loader2 } from "lucide-react";

interface UserData {
  id: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  _count: { completions: number };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const observerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const fetchUsers = useCallback(
    async (cursor?: string | null) => {
      const isInitial = !cursor;
      if (isInitial) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const params = new URLSearchParams();
      params.set("limit", "20");
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (cursor) params.set("cursor", cursor);

      try {
        const res = await fetch(`/api/admin/users?${params}`);
        const data = await res.json();

        if (isInitial) {
          setUsers(data.users);
        } else {
          setUsers((prev) => [...prev, ...data.users]);
        }
        setTotal(data.total);
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      } finally {
        if (isInitial) {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
        loadingRef.current = false;
      }
    },
    [search, statusFilter]
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Infinite scroll
  useEffect(() => {
    const el = observerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
          loadingRef.current = true;
          fetchUsers(nextCursor);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, fetchUsers]);

  async function handleStatusChange(userId: string, status: string) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status } : u))
      );
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">사용자 관리</h1>
          <span className="text-sm text-t-muted">
            {total.toLocaleString()}명
          </span>
        </div>
      </div>

      {/* Search and filters */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-t-muted">
                검색
              </label>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="이름, 이메일..."
                className="w-56 rounded border border-t-border bg-t-surface px-3 py-1.5 text-sm placeholder:text-t-faint"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" size="sm">
                <Search className="h-3.5 w-3.5" />
              </Button>
            </div>
          </form>
          <div>
            <label className="mb-1 block text-xs font-medium text-t-muted">
              상태
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded border border-t-border bg-t-surface px-3 py-1.5 text-sm"
            >
              <option value="">전체</option>
              <option value="active">활성</option>
              <option value="muted">제한</option>
              <option value="banned">정지</option>
            </select>
          </div>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-t-border bg-t-subtle">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  이름
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  이메일
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  역할
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  상태
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  완주
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  가입일
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  조치
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-t-divider">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-t-faint"
                  >
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-t-faint"
                  >
                    {search || statusFilter
                      ? "검색 결과가 없습니다."
                      : "등록된 사용자가 없습니다."}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-t-hover">
                    <td className="px-4 py-3 font-medium">
                      {user.displayName}
                    </td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          user.role === "admin" ? "danger" : "default"
                        }
                      >
                        {user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          user.status === "banned"
                            ? "danger"
                            : user.status === "muted"
                            ? "warning"
                            : "success"
                        }
                      >
                        {user.status === "active" ? "활성" : user.status === "muted" ? "제한" : "정지"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{user._count.completions}</td>
                    <td className="px-4 py-3 text-t-muted">
                      {format(new Date(user.createdAt), "yyyy.MM.dd")}
                    </td>
                    <td className="px-4 py-3">
                      {user.role !== "admin" && (
                        <div className="flex gap-1">
                          {user.status !== "active" && (
                            <button
                              onClick={() => handleStatusChange(user.id, "active")}
                              className="rounded bg-green-600 px-2 py-0.5 text-[10px] text-white hover:bg-green-700"
                            >
                              해제
                            </button>
                          )}
                          {user.status !== "muted" && (
                            <button
                              onClick={() => handleStatusChange(user.id, "muted")}
                              className="rounded bg-sky-yellow/80 px-2 py-0.5 text-[10px] text-black hover:bg-sky-yellow"
                            >
                              제한
                            </button>
                          )}
                          {user.status !== "banned" && (
                            <button
                              onClick={() => {
                                if (confirm(`${user.displayName}을(를) 정지하시겠습니까?`))
                                  handleStatusChange(user.id, "banned");
                              }}
                              className="rounded bg-sky-red px-2 py-0.5 text-[10px] text-white hover:bg-sky-red/80"
                            >
                              정지
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Infinite scroll sentinel */}
        <div ref={observerRef} className="h-1" />
        {loadingMore && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-t-muted" />
          </div>
        )}
        {!loading && users.length > 0 && !hasMore && (
          <div className="py-3 text-center text-xs text-t-faint">
            전체 {total.toLocaleString()}명 표시 완료
          </div>
        )}
      </Card>
    </div>
  );
}
