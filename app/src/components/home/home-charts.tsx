"use client";

import { useEffect, useState } from "react";
import DistanceDistribution from "./distance-distribution";

interface StatsData {
  distanceDistribution: { range: string; count: number }[];
}

export default function HomeCharts() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/home/stats")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl bg-t-subtle" />;
  }

  if (!data) return null;

  return <DistanceDistribution data={data.distanceDistribution ?? []} />;
}
