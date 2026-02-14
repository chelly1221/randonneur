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
                  완주
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  가입일
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
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
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
                    <td className="px-4 py-3">{user._count.completions}</td>
                    <td className="px-4 py-3 text-t-muted">
                      {format(new Date(user.createdAt), "yyyy.MM.dd")}
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
