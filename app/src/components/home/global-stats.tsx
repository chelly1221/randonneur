"use client";

import { useEffect, useRef, useState } from "react";
import { Bike, Globe, Map, Mountain, Users } from "lucide-react";

interface HomeStats {
  totalCourses: number;
  totalDistance: number;
  totalCountries: number;
  totalCompletions: number;
  totalElevation: number;
  countryDistribution: { country: string; count: number }[];
  distanceDistribution: { range: string; count: number }[];
}

function useCountUp(target: number, duration: number = 1500, start: boolean = false) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start || target === 0) {
      if (start) setValue(0);
      return;
    }

    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration, start]);

  return value;
}

interface StatCardProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  suffix?: string;
  format?: boolean;
  animate: boolean;
}

function StatCard({ icon, value, label, suffix, format, animate }: StatCardProps) {
  const displayValue = useCountUp(value, 1500, animate);

  return (
    <div className="rounded-xl bg-t-surface border border-t-border p-4 flex items-center gap-3">
      <div className="rounded-lg bg-t-subtle p-2.5 text-t-icon shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-t-text truncate">
          {format ? displayValue.toLocaleString() : displayValue}
          {suffix && <span className="text-sm font-normal text-t-muted ml-0.5">{suffix}</span>}
        </div>
        <div className="text-xs text-t-muted">{label}</div>
      </div>
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse bg-t-subtle rounded-xl" />
      ))}
    </div>
  );
}

export default function GlobalStats() {
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [animate, setAnimate] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/home/stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (loading || !stats) return;

    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setAnimate(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);

    return () => observer.disconnect();
  }, [loading, stats]);

  if (loading) {
    return <SkeletonCards />;
  }

  if (!stats) {
    return null;
  }

  return (
    <div ref={sectionRef} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard
        icon={<Bike size={20} />}
        value={stats.totalCourses}
        label="등록 코스"
        format
        animate={animate}
      />
      <StatCard
        icon={<Globe size={20} />}
        value={stats.totalCountries}
        label="참여 국가"
        suffix="개국"
        animate={animate}
      />
      <StatCard
        icon={<Map size={20} />}
        value={stats.totalDistance}
        label="총 거리"
        suffix="km"
        format
        animate={animate}
      />
      <StatCard
        icon={<Mountain size={20} />}
        value={stats.totalElevation}
        label="총 획득고도"
        suffix="m"
        format
        animate={animate}
      />
      <StatCard
        icon={<Users size={20} />}
        value={stats.totalCompletions}
        label="완주 기록"
        format
        animate={animate}
      />
    </div>
  );
}
