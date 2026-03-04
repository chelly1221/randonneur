"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

/** ACP country name → ISO 3166-1 alpha-2 code for flag emoji */
const COUNTRY_TO_ISO: Record<string, string> = {
  "Allemagne": "DE", "Argentina": "AR", "Armenia": "AM", "Australia": "AU",
  "Austria": "AT", "Belgium": "BE", "Bosnia and Hercegovina": "BA",
  "Brasil": "BR", "Bulgaria": "BG", "Cambodia": "KH", "Canada": "CA",
  "Chile": "CL", "China": "CN", "Croatia": "HR", "Czech Republic": "CZ",
  "Denmark": "DK", "Finland": "FI", "France": "FR", "Georgia": "GE",
  "Greece": "GR", "Hong Kong": "HK", "Hungary": "HU", "India": "IN",
  "Indonesia": "ID", "Ireland": "IE", "Israel": "IL", "Italy": "IT",
  "Japan": "JP", "Korea": "KR", "Kyrgyzstan": "KG", "Latvia": "LV",
  "Lithuania": "LT", "Macao": "MO", "Macedonia": "MK", "Malaysia": "MY",
  "Mexico": "MX", "Moldova": "MD", "New Zealand": "NZ", "Norway": "NO",
  "Philippines": "PH", "Poland": "PL", "Portugal": "PT", "Romania": "RO",
  "Serbia": "RS", "Singapore": "SG", "Slovenia": "SI", "South Africa": "ZA",
  "Spain": "ES", "Sweden": "SE", "Switzerland": "CH", "Taiwan": "TW",
  "The Netherlands": "NL", "Ukraine": "UA", "United Kingdom": "GB",
  "Uruguay": "UY", "USA": "US", "Uzbekistan": "UZ", "Vietnam": "VN",
};

function CountryFlag({ country, size = 16 }: { country: string | null | undefined; size?: number }) {
  const iso = country ? COUNTRY_TO_ISO[country] : null;
  if (!iso) {
    return <span className="inline-flex items-center justify-center rounded-full bg-t-subtle text-[10px]" style={{ width: size, height: size }}>?</span>;
  }
  const code = iso.toLowerCase();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      alt={country || ""}
      width={size}
      height={size}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

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
  sourceType?: string | null;
  sourceUrl?: string | null;
  country?: string | null;
  user: { id: string; displayName: string; avatarKey: string | null };
  course: { id: string; name: string; distanceKm: number; region: string | null } | null;
}

/** Full card with date block — used in calendar date-select panel */
export function EventCard({ event }: { event: EventCardData }) {
  const startDate = new Date(event.startDate);
  const day = format(startDate, "d");
  const month = format(startDate, "MMM", { locale: ko });
  const weekday = format(startDate, "EEE", { locale: ko });

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
              <div className="flex items-center gap-1.5 mb-1">
                <Badge
                  variant={EVENT_TYPE_VARIANT[event.eventType] ?? "default"}
                  className="text-[9px] px-1.5 py-0"
                >
                  {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                </Badge>
                {event.country && event.country !== "Korea" && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-orange/10 text-sky-orange font-medium">
                    {event.country}
                  </span>
                )}
                {event.sourceType && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-blue/10 text-sky-blue font-medium">
                    {event.sourceType === "acp" ? "ACP" : event.sourceType.toUpperCase()}
                  </span>
                )}
              </div>

              <h3 className="text-sm font-semibold text-t-text truncate">{event.title}</h3>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-t-muted">
                {event.location && (
                  <span className="flex items-center gap-0.5 truncate">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {event.location}
                  </span>
                )}
                {event.goingCount > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Users className="h-3 w-3" />
                    {event.goingCount}명 참가
                  </span>
                )}
              </div>
            </div>

            {/* iCal download */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(`/api/events/${event.id}/ical`);
              }}
              className="self-center shrink-0 rounded-md p-1.5 hover:bg-sky-blue/10 transition-colors text-t-muted hover:text-sky-blue"
              title="캘린더에 추가"
            >
              <CalendarPlus className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Compact single-line row — used in timeline list view */
export function EventRow({ event }: { event: EventCardData }) {
  const startDate = new Date(event.startDate);
  const time = format(startDate, "HH:mm");

  return (
    <Link
      href={`/community/events/${event.id}`}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 hover:bg-t-hover transition-colors group"
    >
      {/* Time */}
      <span className="text-xs font-mono text-t-muted w-10 shrink-0">{time}</span>

      {/* Flag */}
      <CountryFlag country={event.country} size={18} />

      {/* Title */}
      <span className="text-sm text-t-text truncate flex-1 group-hover:text-sky-blue transition-colors">
        {event.title}
      </span>

      {event.location && (
        <span className="hidden sm:flex items-center gap-0.5 text-[11px] text-t-muted shrink-0 max-w-[160px] truncate">
          <MapPin className="h-3 w-3 shrink-0" />
          {event.location}
        </span>
      )}
    </Link>
  );
}
