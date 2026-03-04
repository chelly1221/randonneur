"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Trophy,
  Map,
  Heart,
  MessageSquare,
  Award,
  Globe,
  LogIn,
} from "lucide-react";

interface MySummaryData {
  displayName: string;
  completionCount: number;
  totalDistance: number;
  favoriteCount: number;
  reviewCount: number;
  badgeCount: number;
  countriesRidden: number;
}

export default function MySummary() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<MySummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;

    setLoading(true);
    fetch("/api/home/my-summary")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [status]);

  if (status === "loading") return null;

  if (status === "unauthenticated") {
    return (
      <div className="rounded-xl border border-t-border bg-t-surface p-4 flex items-center justify-between">
        <p className="text-sm text-t-muted">
          로그인하고 나만의 라이딩 기록을 확인하세요
        </p>
        <Link
          href="/api/auth/signin"
          className="flex items-center gap-1.5 text-sm text-sky-blue hover:underline font-medium"
        >
          <LogIn className="h-4 w-4" />
          로그인
        </Link>
      </div>
    );
  }

  if (error) return null;

  if (loading || !data) {
    return (
      <div className="rounded-xl border border-sky-blue/20 bg-gradient-to-r from-sky-blue/5 to-transparent p-4">
        <div className="h-5 w-48 bg-t-faint rounded animate-pulse" />
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="h-4 w-4 bg-t-faint rounded animate-pulse" />
              <div className="h-5 w-10 bg-t-faint rounded animate-pulse" />
              <div className="h-3 w-12 bg-t-faint rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const stats = [
    {
      icon: Trophy,
      value: data.completionCount.toString(),
      label: "완주",
    },
    {
      icon: Map,
      value: data.totalDistance.toLocaleString() + "km",
      label: "총 거리",
    },
    {
      icon: Heart,
      value: data.favoriteCount.toString(),
      label: "즐겨찾기",
    },
    {
      icon: MessageSquare,
      value: data.reviewCount.toString(),
      label: "후기",
    },
    {
      icon: Award,
      value: data.badgeCount.toString(),
      label: "뱃지",
    },
    {
      icon: Globe,
      value: data.countriesRidden.toString(),
      label: "국가",
    },
  ];

  return (
    <div className="rounded-xl border border-sky-blue/20 bg-gradient-to-r from-sky-blue/5 to-transparent p-4">
      <p className="text-sm font-medium text-t-text">
        안녕하세요, {data.displayName}님!
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col items-center gap-0.5">
            <stat.icon className="h-4 w-4 text-sky-blue" />
            <span className="text-lg font-bold text-t-text">{stat.value}</span>
            <span className="text-[10px] text-t-muted">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
