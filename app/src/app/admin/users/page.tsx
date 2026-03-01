"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

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

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => setUsers(data.users))
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">사용자 관리</h1>

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
                    로딩중...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-t-faint"
                  >
                    등록된 사용자가 없습니다.
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
      </Card>
    </div>
  );
}
