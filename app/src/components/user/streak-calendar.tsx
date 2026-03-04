"use client";

import { useEffect, useState, useCallback } from "react";
import { Flame, Award, ChevronLeft, ChevronRight } from "lucide-react";

interface StreakData {
  dates: string[];
  currentStreak: number;
  longestStreak: number;
  availableYears: number[];
  year: number | null;
}

interface StreakCalendarProps {
  userId: string;
}

const MONTH_LABELS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export function StreakCalendar({ userId }: StreakCalendarProps) {
  const [data, setData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const fetchData = useCallback(
    (year: number | null) => {
      setLoading(true);
      const url = year
        ? `/api/users/${userId}/streak?year=${year}`
        : `/api/users/${userId}/streak`;
      fetch(url)
        .then((r) => r.json())
        .then((d: StreakData) => {
          setData(d);
          // On first load, keep selectedYear as null (shows "최근 12개월")
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    },
    [userId]
  );

  useEffect(() => {
    fetchData(selectedYear);
  }, [fetchData, selectedYear]);

  if (loading && !data) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-t-subtle" />
        <div className="h-24 animate-pulse rounded bg-t-subtle" />
      </div>
    );
  }

  if (!data) return null;

  const dateSet = new Set(data.dates);
  const currentYear = new Date().getFullYear();
  const availableYears = data.availableYears ?? [];

  // Determine if we can navigate to previous/next year
  const canGoPrev = availableYears.length > 0 && (
    selectedYear === null
      ? availableYears.some((y) => y < currentYear)
      : availableYears.some((y) => y < selectedYear)
  );
  const canGoNext = selectedYear !== null && (
    selectedYear < currentYear ||
    availableYears.some((y) => y > selectedYear)
  );

  const handlePrevYear = () => {
    if (selectedYear === null) {
      // Going from "last 12 months" to previous year
      const prevYears = availableYears.filter((y) => y < currentYear);
      if (prevYears.length > 0) {
        setSelectedYear(Math.max(...prevYears));
      } else {
        setSelectedYear(currentYear - 1);
      }
    } else {
      setSelectedYear(selectedYear - 1);
    }
  };

  const handleNextYear = () => {
    if (selectedYear !== null) {
      if (selectedYear + 1 >= currentYear) {
        // Return to "last 12 months" view
        setSelectedYear(null);
      } else {
        setSelectedYear(selectedYear + 1);
      }
    }
  };

  const handleSelectYear = (year: number | null) => {
    setSelectedYear(year);
  };

  // Build grid
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let startDate: Date;
  let endDate: Date;

  if (selectedYear !== null) {
    // Show full year: Jan 1 - Dec 31 of the selected year
    startDate = new Date(selectedYear, 0, 1);
    endDate = new Date(selectedYear, 11, 31);
    // Adjust start to Monday
    const startDay = startDate.getDay();
    const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
    startDate.setDate(startDate.getDate() + mondayOffset);
  } else {
    // Last 12 months (default behavior)
    endDate = new Date(today);
    startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 364);
    const startDay = startDate.getDay();
    const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
    startDate.setDate(startDate.getDate() + mondayOffset);
  }

  // Generate all weeks
  const weeks: { date: Date; dateStr: string }[][] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
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

  // Year label
  const yearLabel = selectedYear !== null ? `${selectedYear}년` : "최근 12개월";

  return (
    <div>
      {/* Year selector */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={handlePrevYear}
          disabled={!canGoPrev || loading}
          className="rounded-md p-1 hover:bg-t-hover transition-colors text-t-muted disabled:opacity-30 disabled:cursor-not-allowed"
          title="이전 년도"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="relative">
          <select
            value={selectedYear === null ? "recent" : String(selectedYear)}
            onChange={(e) => {
              const val = e.target.value;
              handleSelectYear(val === "recent" ? null : parseInt(val, 10));
            }}
            className="appearance-none rounded-md border border-t-border bg-t-surface px-3 py-1 text-sm font-medium text-t-text cursor-pointer pr-6"
          >
            <option value="recent">최근 12개월</option>
            {/* Always include current year */}
            {!availableYears.includes(currentYear) && (
              <option value={String(currentYear)}>{currentYear}년</option>
            )}
            {availableYears.map((y) => (
              <option key={y} value={String(y)}>
                {y}년
              </option>
            ))}
          </select>
          <ChevronLeft className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-[-90deg] text-t-muted" />
        </div>

        <button
          onClick={handleNextYear}
          disabled={!canGoNext || loading}
          className="rounded-md p-1 hover:bg-t-hover transition-colors text-t-muted disabled:opacity-30 disabled:cursor-not-allowed"
          title="다음 년도"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {loading && (
          <div className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-t-muted border-t-transparent" />
        )}
      </div>

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
                  // For year view, also hide cells outside the selected year
                  const isOutOfRange =
                    selectedYear !== null &&
                    cell.date.getFullYear() !== selectedYear;
                  return (
                    <div
                      key={cell.dateStr}
                      title={
                        isFuture || isOutOfRange
                          ? ""
                          : `${cell.dateStr}${isActive ? " - 완주" : ""}`
                      }
                      className={`h-[11px] w-[11px] rounded-sm ${
                        isFuture || isOutOfRange
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
