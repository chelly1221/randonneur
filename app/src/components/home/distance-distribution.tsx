"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface DistanceDistributionProps {
  data: { range: string; count: number }[];
}

export default function DistanceDistribution({ data }: DistanceDistributionProps) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl bg-t-surface border border-t-border p-6">
        <h3 className="text-sm font-semibold text-t-text mb-4">거리별 코스 분포</h3>
        <div className="text-sm text-t-muted text-center py-8">데이터가 없습니다</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-t-surface border border-t-border p-6">
      <h3 className="text-sm font-semibold text-t-text mb-4">거리별 코스 분포</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4fc3f7" />
              <stop offset="100%" stopColor="#1a237e" />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--color-t-border, #333)"
          />
          <XAxis
            dataKey="range"
            tick={{ fontSize: 11, fill: "var(--color-t-muted, #999)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-t-muted, #999)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-t-surface, #1a1a2e)",
              border: "1px solid var(--color-t-border, #333)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value: number) => [`${value.toLocaleString()}개`, "코스 수"]}
            labelFormatter={(label: string) => `거리: ${label}`}
            cursor={{ fill: "var(--color-t-faint, rgba(255,255,255,0.05))" }}
          />
          <Bar
            dataKey="count"
            fill="url(#barGradient)"
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
