"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Bike, Users, Trophy, Download } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

interface Stats {
  courseCount: number;
  userCount: number;
  completionCount: number;
  downloadCount: number;
  recentCourses: {
    id: string;
    name: string;
    distanceKm: number;
    region: string;
    createdAt: string;
  }[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  const cards = [
    {
      icon: Bike,
      label: "총 코스",
      value: stats?.courseCount ?? "...",
      href: "/admin/courses",
    },
    {
      icon: Users,
      label: "사용자",
      value: stats?.userCount ?? "...",
      href: "/admin/users",
    },
    {
      icon: Trophy,
      label: "완주 기록",
      value: stats?.completionCount ?? "...",
      href: "#",
    },
    {
      icon: Download,
      label: "다운로드",
      value: stats?.downloadCount ?? "...",
      href: "#",
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">관리자 대시보드</h1>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.label} href={card.href}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center gap-4">
                <div className="rounded-lg bg-t-subtle p-3">
                  <card.icon className="h-6 w-6 text-t-icon" />
                </div>
                <div>
                  <p className="text-sm text-t-muted">{card.label}</p>
                  <p className="text-2xl font-bold">{card.value}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">최근 추가된 코스</h2>
        <Card>
          <div className="divide-y divide-t-divider">
            {stats?.recentCourses?.map((course) => (
              <div
                key={course.id}
                className="flex items-center justify-between px-6 py-3"
              >
                <div>
                  <Link
                    href={`/admin/courses/${course.id}/edit`}
                    className="font-medium hover:text-t-link"
                  >
                    {course.name}
                  </Link>
                  <p className="text-sm text-t-muted">
                    {course.distanceKm} km &middot; {course.region}
                  </p>
                </div>
                <span className="text-xs text-t-faint">
                  {format(new Date(course.createdAt), "yyyy.MM.dd")}
                </span>
              </div>
            )) ?? (
              <div className="px-6 py-8 text-center text-t-faint">
                로딩중...
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
