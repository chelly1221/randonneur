"use client";

import { useEffect, useState } from "react";
import { Flame, Award } from "lucide-react";

interface StreakData {
  dates: string[];
  currentStreak: number;
  longestStreak: number;
}

interface StreakCalendarProps {
  userId: string;
}

const MONTH_LABELS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export function StreakCalendar({ userId }: StreakCalendarProps) {
  const [data, setData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${userId}/streak`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-t-subtle" />
        <div className="h-24 animate-pulse rounded bg-t-subtle" />
      </div>
    );
  }

  if (!data) return null;

  const dateSet = new Set(data.dates);

  // Build grid: 53 weeks x 7 days, ending at today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find the Monday of the week 52 weeks ago
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 364); // ~52 weeks
  // Adjust to Monday
  const startDay = startDate.getDay();
  const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
  startDate.setDate(startDate.getDate() + mondayOffset);

  // Generate all weeks
  const weeks: { date: Date; dateStr: string }[][] = [];
  const current = new Date(startDate);

  while (current <= today) {
    const week: { date: Date; dateStr: string }[] = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(current);
      const dateStr = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, "0")}-${String(cellDate.getDate()).padStart(2, "0")}`;
      week.push({ date: cellDate, dateStr });
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }

  // Determine month labels with their column positions
  const monthPositions: { label: string; col: number }[] = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks.length; w++) {
    const month = weeks[w][0].date.getMonth();
    if (month !== lastMonth) {
      monthPositions.push({ label: MONTH_LABELS[month], col: w });
      lastMonth = month;
    }
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-fit">
          {/* Month labels */}
          <div className="flex ml-7 mb-1">
            {monthPositions.map((mp, i) => {
              const nextCol = i < monthPositions.length - 1 ? monthPositions[i + 1].col : weeks.length;
              const span = nextCol - mp.col;
              return (
                <div
                  key={`${mp.label}-${mp.col}`}
                  style={{ width: `${span * 13}px` }}
                  className="text-[10px] text-t-muted"
                >
                  {mp.label}
                </div>
              );
            })}
          </div>

          {/* Grid */}
          <div className="flex gap-0">
            {/* Day labels */}
            <div className="flex flex-col gap-px mr-1 pt-px">
              {DAY_LABELS.map((label, i) => (
                <div
                  key={label}
                  className="h-[11px] text-[9px] leading-[11px] text-t-muted text-right pr-1"
                  style={{ visibility: i % 2 === 0 ? "visible" : "hidden" }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Weeks */}
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-px">
                {week.map((cell) => {
                  const isActive = dateSet.has(cell.dateStr);
                  const isFuture = cell.date > today;
                  return (
                    <div
                      key={cell.dateStr}
                      title={
                        isFuture
                          ? ""
                          : `${cell.dateStr}${isActive ? " - 완주" : ""}`
                      }
                      className={`h-[11px] w-[11px] rounded-sm ${
                        isFuture
                          ? "bg-transparent"
                          : isActive
                          ? "bg-sky-blue"
                          : "bg-t-subtle"
                      }`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Streak info */}
      <div className="mt-3 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5 text-sky-orange">
          <Flame className="h-3.5 w-3.5" />
          <span className="font-medium">
            현재 {data.currentStreak}주 연속
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-t-muted">
          <Award className="h-3.5 w-3.5" />
          <span>
            최장 {data.longestStreak}주 연속
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto text-[10px] text-t-muted">
          <span>적음</span>
          <div className="flex gap-0.5">
            <div className="h-[9px] w-[9px] rounded-sm bg-t-subtle" />
            <div className="h-[9px] w-[9px] rounded-sm bg-sky-blue/40" />
            <div className="h-[9px] w-[9px] rounded-sm bg-sky-blue" />
          </div>
          <span>많음</span>
        </div>
      </div>
    </div>
  );
}
