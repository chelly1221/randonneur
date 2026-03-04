"use client";

import { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COUNTRY_NAMES: Record<string, string> = {
  AU: "호주",
  KR: "한국",
  CA: "캐나다",
  US: "미국",
  GB: "영국",
  BE: "벨기에",
  IE: "아일랜드",
  IT: "이탈리아",
  JP: "일본",
  DE: "독일",
  NO: "노르웨이",
  NZ: "뉴질랜드",
  ES: "스페인",
  DK: "덴마크",
  FR: "프랑스",
  ZA: "남아공",
};

const COLORS = [
  "#4fc3f7", // sky-blue
  "#1a237e", // sky-darkblue
  "#fdd835", // sky-yellow
  "#ff9800", // sky-orange
  "#e53935", // sky-red
  "#26a69a", // teal
  "#ab47bc", // purple
  "#66bb6a", // green
  "#78909c", // blue-grey (기타)
];

function getCountryName(code: string): string {
  return COUNTRY_NAMES[code] || code;
}

export default function CountryDistribution() {
  const [data, setData] = useState<{ country: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/home/stats")
      .then((r) => r.json())
      .then((d) => setData(d.countryDistribution ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const sorted = [...data].sort((a, b) => b.count - a.count);
    const top8 = sorted.slice(0, 8);
    const rest = sorted.slice(8);

    const result = top8.map((item) => ({
      name: getCountryName(item.country),
      value: item.count,
    }));

    if (rest.length > 0) {
      const othersTotal = rest.reduce((sum, item) => sum + item.count, 0);
      result.push({ name: "기타", value: othersTotal });
    }

    return result;
  }, [data]);

  if (loading) {
    return (
      <div className="rounded-xl bg-t-surface border border-t-border p-6">
        <h3 className="text-sm font-semibold text-t-text mb-4">국가별 코스 분포</h3>
        <div className="h-56 animate-pulse bg-t-subtle rounded-lg" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl bg-t-surface border border-t-border p-6">
        <h3 className="text-sm font-semibold text-t-text mb-4">국가별 코스 분포</h3>
        <div className="text-sm text-t-muted text-center py-8">데이터가 없습니다</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-t-surface border border-t-border p-6">
      <h3 className="text-sm font-semibold text-t-text mb-4">국가별 코스 분포</h3>
      <div className="flex flex-col items-center">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              dataKey="value"
              nameKey="name"
              strokeWidth={2}
              stroke="var(--color-t-surface, #fff)"
            >
              {chartData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-t-surface, #1a1a2e)",
                border: "1px solid var(--color-t-border, #333)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value: number, name: string) => [
                `${value.toLocaleString()}개`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
          {chartData.map((item, index) => (
            <div key={item.name} className="flex items-center gap-1.5 text-xs text-t-muted">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span>{item.name}</span>
              <span className="font-medium text-t-text">{item.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
