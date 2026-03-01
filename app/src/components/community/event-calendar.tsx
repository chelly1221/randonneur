"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EventCard, type EventCardData } from "@/components/community/event-card";
import {
  ChevronLeft,
  ChevronRight,
  CalendarX,
  X,
  Calendar,
  List,
} from "lucide-react";
import {
  format,
  addMonths,
  subMonths,
  addDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  getDay,
  addWeeks,
  subWeeks,
} from "date-fns";
import { ko } from "date-fns/locale";

const EVENT_TYPES = [
  { value: "", label: "전체" },
  { value: "brevet", label: "브레베" },
  { value: "group_ride", label: "그룹라이드" },
  { value: "festival", label: "자전거 축제" },
  { value: "other", label: "기타" },
];

const EVENT_TYPE_COLORS: Record<string, string> = {
  brevet: "bg-sky-darkblue",
  group_ride: "bg-emerald-500",
  festival: "bg-sky-orange",
  other: "bg-gray-400",
};

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

// Always produce exactly 42 cells (6 rows x 7 columns) for consistent grid height
function getCalendarDays(month: Date): Date[] {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  // Pad to 42 days if fewer (e.g., a 4-week or 5-week month view)
  while (days.length < 42) {
    days.push(addDays(days[days.length - 1], 1));
  }

  return days;
}

// Helper to group events by date string
function groupEventsByDate(events: EventCardData[]): Map<string, EventCardData[]> {
  const map = new Map<string, EventCardData[]>();
  for (const event of events) {
    const dateKey = format(new Date(event.startDate), "yyyy-MM-dd");
    if (!map.has(dateKey)) {
      map.set(dateKey, []);
    }
    map.get(dateKey)!.push(event);
  }
  return map;
}

interface EventCalendarProps {
  defaultView?: "calendar" | "list";
}

export function EventCalendar({ defaultView = "calendar" }: EventCalendarProps) {
  const [events, setEvents] = useState<EventCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedType, setSelectedType] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [view, setView] = useState<"calendar" | "list">(defaultView);
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchEvents = useCallback(async () => {
    // Cancel any in-flight request to prevent race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    const monthStr = format(currentMonth, "yyyy-MM");
    const params = new URLSearchParams({ month: monthStr });
    if (selectedType) params.set("type", selectedType);

    try {
      const res = await fetch(`/api/events?${params}`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        // Only update state if this request was not aborted
        if (!controller.signal.aborted) {
          setEvents(data);
        }
      }
    } catch (err: unknown) {
      // Ignore abort errors; they are expected when cancelling stale requests
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      // ignore other fetch errors
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [currentMonth, selectedType]);

  useEffect(() => {
    fetchEvents();
    // Cleanup: abort fetch on unmount or when dependencies change
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchEvents]);

  const prevMonth = () => {
    setCurrentMonth((m) => subMonths(m, 1));
    setSelectedDate(null);
  };
  const nextMonth = () => {
    setCurrentMonth((m) => addMonths(m, 1));
    setSelectedDate(null);
  };

  // Week navigation updates currentMonth when the week crosses a month boundary
  // so the API fetches the correct month's events for the mobile view
  const prevWeek = () => {
    setWeekStart((w) => {
      const newWeekStart = subWeeks(w, 1);
      // If the new week's midpoint (Wednesday) is in a different month, update currentMonth
      const midpoint = addDays(newWeekStart, 3);
      if (!isSameMonth(midpoint, currentMonth)) {
        setCurrentMonth(startOfMonth(midpoint));
        setSelectedDate(null);
      }
      return newWeekStart;
    });
  };
  const nextWeek = () => {
    setWeekStart((w) => {
      const newWeekStart = addWeeks(w, 1);
      const midpoint = addDays(newWeekStart, 3);
      if (!isSameMonth(midpoint, currentMonth)) {
        setCurrentMonth(startOfMonth(midpoint));
        setSelectedDate(null);
      }
      return newWeekStart;
    });
  };

  // Generate calendar days for the month grid (always 42 cells)
  const calendarDays = useMemo(() => getCalendarDays(currentMonth), [currentMonth]);

  // Generate week days for mobile weekly view
  const weekDays = useMemo(() => {
    const wEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: weekStart, end: wEnd });
  }, [weekStart]);

  // Group events by date
  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);

  // Events for the selected date
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    const key = format(selectedDate, "yyyy-MM-dd");
    return eventsByDate.get(key) || [];
  }, [selectedDate, eventsByDate]);

  // Sync weekStart when month changes (e.g., from the month navigation buttons)
  useEffect(() => {
    setWeekStart(startOfWeek(currentMonth, { weekStartsOn: 0 }));
  }, [currentMonth]);

  return (
    <div>
      {/* Controls: Month navigation + Type filter + View toggle */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="rounded-md p-1 hover:bg-t-hover transition-colors"
            aria-label="이전 달"
          >
            <ChevronLeft className="h-5 w-5 text-t-text" />
          </button>
          <span className="text-sm font-semibold text-t-text min-w-[120px] text-center">
            {format(currentMonth, "yyyy년 M월", { locale: ko })}
          </span>
          <button
            onClick={nextMonth}
            className="rounded-md p-1 hover:bg-t-hover transition-colors"
            aria-label="다음 달"
          >
            <ChevronRight className="h-5 w-5 text-t-text" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="rounded-md border border-t-border bg-t-surface px-2.5 py-1.5 text-sm text-t-text"
            aria-label="이벤트 유형 필터"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {/* View toggle */}
          <div className="flex rounded-md border border-t-border overflow-hidden" role="group" aria-label="보기 방식">
            <button
              onClick={() => setView("calendar")}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                view === "calendar"
                  ? "bg-sky-darkblue text-white"
                  : "bg-t-surface text-t-muted hover:bg-t-hover"
              }`}
              aria-label="캘린더 보기"
              aria-pressed={view === "calendar"}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">캘린더</span>
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                view === "list"
                  ? "bg-sky-darkblue text-white"
                  : "bg-t-surface text-t-muted hover:bg-t-hover"
              }`}
              aria-label="리스트 보기"
              aria-pressed={view === "list"}
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">리스트</span>
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-t-subtle" />
          ))}
        </div>
      )}

      {/* Calendar View */}
      {!loading && view === "calendar" && (
        <>
          {/* Desktop: Full month grid */}
          <div className="hidden md:block">
            <MonthGrid
              calendarDays={calendarDays}
              currentMonth={currentMonth}
              eventsByDate={eventsByDate}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </div>

          {/* Mobile: Weekly strip */}
          <div className="block md:hidden">
            <WeekStrip
              weekDays={weekDays}
              currentMonth={currentMonth}
              eventsByDate={eventsByDate}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onPrevWeek={prevWeek}
              onNextWeek={nextWeek}
            />
          </div>

          {/* Selected date events panel */}
          {selectedDate && (
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-t-text">
                  {format(selectedDate, "M월 d일 (EEEE)", { locale: ko })}
                </h3>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="rounded-md p-1 hover:bg-t-hover transition-colors"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4 text-t-muted" />
                </button>
              </div>
              {selectedDateEvents.length === 0 ? (
                <Card>
                  <CardContent className="py-6 text-center">
                    <p className="text-sm text-t-muted">이 날짜에 이벤트가 없습니다.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {selectedDateEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* No events at all */}
          {!selectedDate && events.length === 0 && (
            <Card className="mt-3">
              <CardContent className="py-10 text-center">
                <CalendarX className="mx-auto mb-2 h-8 w-8 text-t-muted" />
                <p className="text-sm text-t-muted">이 달에 예정된 이벤트가 없습니다.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* List View (original) */}
      {!loading && view === "list" && (
        <>
          {events.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <CalendarX className="mx-auto mb-2 h-8 w-8 text-t-muted" />
                <p className="text-sm text-t-muted">이 달에 예정된 이벤트가 없습니다.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   Month Grid (Desktop)
   ────────────────────────────────────────────── */

function MonthGrid({
  calendarDays,
  currentMonth,
  eventsByDate,
  selectedDate,
  onSelectDate,
}: {
  calendarDays: Date[];
  currentMonth: Date;
  eventsByDate: Map<string, EventCardData[]>;
  selectedDate: Date | null;
  onSelectDate: (d: Date) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation for the calendar grid
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, dayIndex: number) => {
      let targetIndex: number | null = null;
      switch (e.key) {
        case "ArrowRight":
          targetIndex = dayIndex + 1;
          break;
        case "ArrowLeft":
          targetIndex = dayIndex - 1;
          break;
        case "ArrowDown":
          targetIndex = dayIndex + 7;
          break;
        case "ArrowUp":
          targetIndex = dayIndex - 7;
          break;
        default:
          return;
      }

      if (targetIndex !== null && targetIndex >= 0 && targetIndex < calendarDays.length) {
        e.preventDefault();
        const buttons = gridRef.current?.querySelectorAll<HTMLButtonElement>(
          'button[data-calendar-day]'
        );
        buttons?.[targetIndex]?.focus();
      }
    },
    [calendarDays.length]
  );

  return (
    <Card>
      <CardContent className="p-3">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1" role="row">
          {DAY_NAMES.map((name, i) => (
            <div
              key={name}
              role="columnheader"
              className={`text-center text-xs font-medium py-1.5 ${
                i === 0 ? "text-sky-red" : i === 6 ? "text-sky-blue" : "text-t-muted"
              }`}
            >
              {name}
            </div>
          ))}
        </div>

        {/* Date cells */}
        <div className="grid grid-cols-7" role="grid" aria-label="이벤트 캘린더" ref={gridRef}>
          {calendarDays.map((day, idx) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDate.get(dateKey) || [];
            const inMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);
            const selected = selectedDate ? isSameDay(day, selectedDate) : false;
            const dayOfWeek = getDay(day);
            const hasEvents = dayEvents.length > 0;

            return (
              <button
                key={dateKey}
                data-calendar-day={dateKey}
                onClick={() => onSelectDate(day)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                tabIndex={selected || (idx === 0 && !selectedDate) ? 0 : -1}
                role="gridcell"
                aria-label={`${format(day, "M월 d일", { locale: ko })}${hasEvents ? `, 이벤트 ${dayEvents.length}건` : ""}`}
                aria-selected={selected}
                className={`
                  relative flex flex-col items-center py-1.5 rounded-md transition-colors
                  min-h-[60px] text-center
                  focus:outline-none focus:ring-2 focus:ring-sky-blue focus:ring-inset
                  ${selected ? "bg-sky-darkblue/10 ring-1 ring-sky-darkblue" : "hover:bg-t-hover"}
                  ${!inMonth ? "opacity-40" : ""}
                `}
              >
                {/* Day number */}
                <span
                  className={`
                    text-sm leading-none w-7 h-7 flex items-center justify-center rounded-full
                    ${today ? "bg-sky-darkblue text-white font-bold" : ""}
                    ${!today && inMonth && dayOfWeek === 0 ? "text-sky-red" : ""}
                    ${!today && inMonth && dayOfWeek === 6 ? "text-sky-blue" : ""}
                    ${!today && inMonth && dayOfWeek !== 0 && dayOfWeek !== 6 ? "text-t-text" : ""}
                    ${!inMonth ? "text-t-muted" : ""}
                  `}
                >
                  {format(day, "d")}
                </span>

                {/* Event dots */}
                {hasEvents && (
                  <div className="flex items-center gap-0.5 mt-1 flex-wrap justify-center max-w-full px-0.5">
                    {dayEvents.slice(0, 3).map((evt, dotIdx) => (
                      <span
                        key={dotIdx}
                        className={`w-1.5 h-1.5 rounded-full ${EVENT_TYPE_COLORS[evt.eventType] || "bg-gray-400"}`}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[8px] text-t-muted leading-none">+{dayEvents.length - 3}</span>
                    )}
                  </div>
                )}

                {/* Short event bar for first event if space allows */}
                {dayEvents.length > 0 && (
                  <div className="mt-0.5 w-full px-0.5">
                    <div
                      className={`text-[8px] leading-tight truncate rounded px-0.5 py-px ${
                        EVENT_TYPE_COLORS[dayEvents[0].eventType] || "bg-gray-400"
                      } text-white`}
                    >
                      {dayEvents[0].title}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Event type legend */}
        <div className="mt-3 pt-2 border-t border-t-border flex flex-wrap gap-3">
          <LegendItem color="bg-sky-darkblue" label="브레베" />
          <LegendItem color="bg-emerald-500" label="그룹라이드" />
          <LegendItem color="bg-sky-orange" label="축제" />
          <LegendItem color="bg-gray-400" label="기타" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ──────────────────────────────────────────────
   Week Strip (Mobile)
   ────────────────────────────────────────────── */

function WeekStrip({
  weekDays,
  currentMonth,
  eventsByDate,
  selectedDate,
  onSelectDate,
  onPrevWeek,
  onNextWeek,
}: {
  weekDays: Date[];
  currentMonth: Date;
  eventsByDate: Map<string, EventCardData[]>;
  selectedDate: Date | null;
  onSelectDate: (d: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}) {
  // Show the month label for the week's midpoint to give context
  const weekMidpoint = weekDays.length >= 4 ? weekDays[3] : weekDays[0];
  const weekMonthLabel = format(weekMidpoint, "M월", { locale: ko });

  return (
    <div>
      {/* Week navigation strip */}
      <Card>
        <CardContent className="px-2 py-2">
          {/* Show month indicator if the week spans a different month than currentMonth */}
          {!isSameMonth(weekMidpoint, currentMonth) && (
            <div className="text-center text-[10px] text-t-muted mb-1">
              {weekMonthLabel}
            </div>
          )}
          <div className="flex items-center">
            <button
              onClick={onPrevWeek}
              className="shrink-0 rounded-md p-1 hover:bg-t-hover transition-colors"
              aria-label="이전 주"
            >
              <ChevronLeft className="h-4 w-4 text-t-text" />
            </button>

            <div className="flex-1 overflow-x-auto scrollbar-hidden">
              <div className="flex gap-1 min-w-max px-1">
                {weekDays.map((day) => {
                  const dateKey = format(day, "yyyy-MM-dd");
                  const dayEvents = eventsByDate.get(dateKey) || [];
                  const today = isToday(day);
                  const selected = selectedDate ? isSameDay(day, selectedDate) : false;
                  const dayOfWeek = getDay(day);
                  const hasEvents = dayEvents.length > 0;

                  return (
                    <button
                      key={dateKey}
                      onClick={() => onSelectDate(day)}
                      aria-label={`${format(day, "M월 d일", { locale: ko })}${hasEvents ? `, 이벤트 ${dayEvents.length}건` : ""}`}
                      aria-selected={selected}
                      className={`
                        flex flex-col items-center py-1.5 px-3 rounded-lg transition-colors min-w-[48px]
                        ${selected ? "bg-sky-darkblue text-white" : "hover:bg-t-hover"}
                      `}
                    >
                      <span
                        className={`text-[10px] font-medium ${
                          selected
                            ? "text-white/80"
                            : dayOfWeek === 0
                            ? "text-sky-red"
                            : dayOfWeek === 6
                            ? "text-sky-blue"
                            : "text-t-muted"
                        }`}
                      >
                        {DAY_NAMES[dayOfWeek]}
                      </span>
                      <span
                        className={`
                          text-base font-semibold leading-tight mt-0.5
                          ${selected ? "text-white" : today ? "text-sky-darkblue" : "text-t-text"}
                        `}
                      >
                        {format(day, "d")}
                      </span>
                      {/* Event dots below the date */}
                      <div className="flex gap-0.5 mt-1 h-2 items-center">
                        {hasEvents ? (
                          dayEvents.slice(0, 3).map((evt, idx) => (
                            <span
                              key={idx}
                              className={`w-1.5 h-1.5 rounded-full ${
                                selected
                                  ? "bg-white/80"
                                  : EVENT_TYPE_COLORS[evt.eventType] || "bg-gray-400"
                              }`}
                            />
                          ))
                        ) : (
                          <span className="w-1.5 h-1.5" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={onNextWeek}
              className="shrink-0 rounded-md p-1 hover:bg-t-hover transition-colors"
              aria-label="다음 주"
            >
              <ChevronRight className="h-4 w-4 text-t-text" />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Prompt to select a date if none selected */}
      {!selectedDate && (
        <p className="mt-3 text-center text-xs text-t-muted">
          날짜를 선택하면 해당 일의 이벤트를 확인할 수 있습니다.
        </p>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   Legend Item
   ────────────────────────────────────────────── */

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-[10px] text-t-muted">{label}</span>
    </div>
  );
}
