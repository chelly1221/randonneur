"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EventCard, type EventCardData } from "@/components/community/event-card";
import { ChevronLeft, ChevronRight, CalendarX } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { ko } from "date-fns/locale";

const EVENT_TYPES = [
  { value: "", label: "전체" },
  { value: "brevet", label: "브레베" },
  { value: "group_ride", label: "그룹라이드" },
  { value: "festival", label: "자전거 축제" },
  { value: "other", label: "기타" },
];

export function EventList() {
  const [events, setEvents] = useState<EventCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedType, setSelectedType] = useState("");

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const monthStr = format(currentMonth, "yyyy-MM");
    const params = new URLSearchParams({ month: monthStr });
    if (selectedType) params.set("type", selectedType);

    try {
      const res = await fetch(`/api/events?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [currentMonth, selectedType]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const prevMonth = () => setCurrentMonth((m) => subMonths(m, 1));
  const nextMonth = () => setCurrentMonth((m) => addMonths(m, 1));

  return (
    <div>
      {/* Month navigation + type filter */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="rounded-md p-1 hover:bg-t-hover transition-colors"
          >
            <ChevronLeft className="h-5 w-5 text-t-text" />
          </button>
          <span className="text-sm font-semibold text-t-text min-w-[120px] text-center">
            {format(currentMonth, "yyyy년 M월", { locale: ko })}
          </span>
          <button
            onClick={nextMonth}
            className="rounded-md p-1 hover:bg-t-hover transition-colors"
          >
            <ChevronRight className="h-5 w-5 text-t-text" />
          </button>
        </div>

        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="rounded-md border border-t-border bg-t-surface px-2.5 py-1.5 text-sm text-t-text"
        >
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-t-subtle" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && events.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <CalendarX className="mx-auto mb-2 h-8 w-8 text-t-muted" />
            <p className="text-sm text-t-muted">이 달에 예정된 이벤트가 없습니다.</p>
          </CardContent>
        </Card>
      )}

      {/* Event list */}
      {!loading && events.length > 0 && (
        <div className="space-y-2">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
