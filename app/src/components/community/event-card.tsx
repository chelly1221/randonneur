"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user/user-avatar";
import { MapPin, Users, Calendar } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

const EVENT_TYPE_LABELS: Record<string, string> = {
  brevet: "브레베",
  group_ride: "그룹라이드",
  festival: "자전거 축제",
  other: "기타",
};

const EVENT_TYPE_VARIANT: Record<string, "default" | "primary" | "success" | "warning" | "danger"> = {
  brevet: "primary",
  group_ride: "success",
  festival: "warning",
  other: "default",
};

export interface EventCardData {
  id: string;
  title: string;
  eventType: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  maxParticipants: number | null;
  goingCount: number;
  interestedCount: number;
  participantCount: number;
  user: { id: string; displayName: string; avatarKey: string | null };
  course: { id: string; name: string; distanceKm: number; region: string | null } | null;
}

export function EventCard({ event }: { event: EventCardData }) {
  const startDate = new Date(event.startDate);
  const day = format(startDate, "d");
  const month = format(startDate, "MMM", { locale: ko });
  const weekday = format(startDate, "EEE", { locale: ko });
  const time = format(startDate, "HH:mm");

  return (
    <Link href={`/community/events/${event.id}`}>
      <Card className="hover:bg-t-hover transition-colors">
        <CardContent className="py-3 px-4">
          <div className="flex gap-3">
            {/* Date display */}
            <div className="flex flex-col items-center justify-center rounded-lg bg-sky-darkblue/10 px-3 py-2 min-w-[60px]">
              <span className="text-[10px] font-medium text-sky-darkblue uppercase">{month}</span>
              <span className="text-xl font-bold text-sky-darkblue leading-tight">{day}</span>
              <span className="text-[10px] text-t-muted">{weekday}</span>
            </div>

            {/* Event info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant={EVENT_TYPE_VARIANT[event.eventType] ?? "default"}
                  className="text-[9px] px-1.5 py-0"
                >
                  {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                </Badge>
                {event.course && (
                  <span className="text-[10px] text-sky-blue truncate">
                    {event.course.name}
                  </span>
                )}
              </div>

              <h3 className="text-sm font-semibold text-t-text truncate">{event.title}</h3>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-t-muted">
                <span className="flex items-center gap-0.5">
                  <Calendar className="h-3 w-3" />
                  {time}
                </span>
                {event.location && (
                  <span className="flex items-center gap-0.5 truncate">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {event.location}
                  </span>
                )}
                <span className="flex items-center gap-0.5">
                  <Users className="h-3 w-3" />
                  {event.goingCount}명 참가
                  {event.maxParticipants && (
                    <span className="text-t-muted">/ {event.maxParticipants}</span>
                  )}
                </span>
              </div>

              <div className="mt-1 flex items-center gap-1">
                <UserAvatar
                  displayName={event.user.displayName}
                  avatarKey={event.user.avatarKey}
                  size="sm"
                />
                <span className="text-[10px] text-t-muted">{event.user.displayName}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
