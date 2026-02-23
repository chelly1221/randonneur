"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bike, Mountain, Map, Trophy } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface CompletionData {
  completions: {
    id: string;
    completedAt: string;
    notes: string | null;
    course: {
      id: string;
      name: string;
      distanceKm: number;
      elevationM: number;
      region: string | null;
    };
  }[];
  stats: {
    totalCompletions: number;
    totalDistance: number;
    totalElevation: number;
    uniqueRegions: number;
  };
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const [data, setData] = useState<CompletionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/completions/me")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!session) return null;

  const stats = data?.stats ?? {
    totalCompletions: 0,
    totalDistance: 0,
    totalElevation: 0,
    uniqueRegions: 0,
  };

  const statCards = [
    { icon: Trophy, label: "완주 코스", value: stats.totalCompletions },
    {
      icon: Bike,
      label: "총 거리",
      value: `${stats.totalDistance.toLocaleString()} km`,
    },
    {
      icon: Mountain,
      label: "총 획득 고도",
      value: `${stats.totalElevation.toLocaleString()} m`,
    },
    { icon: Map, label: "방문 지역", value: `${stats.uniqueRegions}개 지역` },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">프로필</h1>
        <p className="text-t-muted">
          {session.user.name ?? session.user.email}
        </p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-3">
              <div className="rounded-lg bg-t-subtle p-2">
                <stat.icon className="h-5 w-5 text-t-icon" />
              </div>
              <div>
                <p className="text-xs text-t-muted">{stat.label}</p>
                <p className="text-lg font-bold">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">완주 기록</h2>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg bg-t-subtle"
              />
            ))}
          </div>
        ) : !data?.completions.length ? (
          <Card>
            <CardContent className="py-8 text-center text-t-muted">
              아직 완주 기록이 없습니다.{" "}
              <Link href="/courses" className="text-t-accent hover:underline">
                코스를 둘러보세요!
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.completions.map((completion) => (
              <Card key={completion.id}>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <Link
                      href={`/courses/${completion.course.id}`}
                      className="font-medium hover:text-t-link"
                    >
                      {completion.course.name}
                    </Link>
                    <p className="text-sm text-t-muted">
                      {completion.course.distanceKm} km &middot;{" "}
                      {completion.course.elevationM} m
                      {completion.notes && ` — ${completion.notes}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="primary">
                      {completion.course.region}
                    </Badge>
                    <span className="text-xs text-t-faint">
                      {format(new Date(completion.completedAt), "yyyy.MM.dd", {
                        locale: ko,
                      })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
