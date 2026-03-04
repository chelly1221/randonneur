"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Calendar, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface EventData {
  id: string;
  title: string;
  eventType: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  country: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  goingCount: number;
  interestedCount: number;
  participantCount: number;
  user: { id: string; displayName: string; avatarKey: string | null } | null;
  course: { id: string; name: string; distanceKm: number; region: string | null } | null;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  brevet: "브레베",
  group_ride: "그룹라이드",
  festival: "축제",
  other: "기타",
};

const EVENT_TYPE_VARIANTS: Record<string, "primary" | "success" | "warning" | "default"> = {
  brevet: "primary",
  group_ride: "success",
  festival: "warning",
  other: "default",
};

const COUNTRY_ISO_MAP: Record<string, string> = {
  Korea: "kr",
  "South Korea": "kr",
  France: "fr",
  "United Kingdom": "gb",
  Japan: "jp",
  Australia: "au",
  USA: "us",
  "United States": "us",
  Canada: "ca",
  Belgium: "be",
  Germany: "de",
  Ireland: "ie",
  Italy: "it",
  Norway: "no",
  "New Zealand": "nz",
  Spain: "es",
  Denmark: "dk",
  "South Africa": "za",
  Netherlands: "nl",
  Switzerland: "ch",
  Austria: "at",
  Portugal: "pt",
  Brazil: "br",
  Finland: "fi",
  Sweden: "se",
  Poland: "pl",
  "Czech Republic": "cz",
  Hungary: "hu",
  Romania: "ro",
  Bulgaria: "bg",
  Croatia: "hr",
  Slovenia: "si",
  Slovakia: "sk",
  Lithuania: "lt",
  Latvia: "lv",
  Estonia: "ee",
  Greece: "gr",
  Turkey: "tr",
  Russia: "ru",
  China: "cn",
  India: "in",
  Thailand: "th",
  Malaysia: "my",
  Singapore: "sg",
  Indonesia: "id",
  Philippines: "ph",
  Taiwan: "tw",
  "Hong Kong": "hk",
  Mexico: "mx",
  Argentina: "ar",
  Chile: "cl",
  Colombia: "co",
  Peru: "pe",
  Uruguay: "uy",
};

function getCountryIso(country: string | null): string | null {
  if (!country) return null;
  if (COUNTRY_ISO_MAP[country]) return COUNTRY_ISO_MAP[country];
  // Try lowercase 2-letter code directly
  if (country.length === 2) return country.toLowerCase();
  return null;
}

function isKorea(country: string | null): boolean {
  if (!country) return false;
  const lower = country.toLowerCase();
  return lower === "korea" || lower === "south korea" || lower === "kr";
}

export default function UpcomingEvents({ country }: { country?: string } = {}) {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch(`/api/events${country ? `?country=${country}` : ""}`);
        if (!res.ok) throw new Error("Failed to fetch events");
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.events ?? [];
        setEvents(list.slice(0, 5));
      } catch {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
  }, []);

  return (
    <Card className="bg-t-surface border-t-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-t-text flex items-center gap-2">
            <Calendar className="h-4 w-4 text-t-icon" />
            다가오는 이벤트
          </h3>
          <Link
            href="/community/events"
            className="text-xs text-sky-blue hover:text-sky-orange transition-colors"
          >
            전체 보기 →
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-12 h-12 rounded-lg bg-t-faint shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-t-faint rounded w-3/4" />
                  <div className="h-3 bg-t-faint rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-t-muted text-center py-6">
            예정된 이벤트가 없습니다
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => {
              const date = new Date(event.startDate);
              const month = format(date, "MMM", { locale: ko });
              const day = format(date, "d", { locale: ko });
              const typeLabel = EVENT_TYPE_LABELS[event.eventType] ?? EVENT_TYPE_LABELS.other;
              const typeVariant = EVENT_TYPE_VARIANTS[event.eventType] ?? EVENT_TYPE_VARIANTS.other;
              const showCountry = !isKorea(event.country);
              const countryIso = getCountryIso(event.country);
              const totalParticipants = event.participantCount || (event.goingCount + event.interestedCount);

              return (
                <Link
                  key={event.id}
                  href={`/community/events/${event.id}`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-t-hover transition-colors group"
                >
                  {/* Date block */}
                  <div className="w-12 h-12 rounded-lg bg-sky-darkblue/10 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] font-medium text-sky-darkblue dark:text-sky-blue uppercase leading-none">
                      {month}
                    </span>
                    <span className="text-lg font-bold text-sky-darkblue dark:text-sky-blue leading-tight">
                      {day}
                    </span>
                  </div>

                  {/* Middle: title, badge, country */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-t-text truncate group-hover:text-sky-blue transition-colors">
                      {event.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant={typeVariant} className="text-[10px] px-1.5 py-0">
                        {typeLabel}
                      </Badge>
                      {showCountry && event.country && (
                        <span className="flex items-center gap-1 text-xs text-t-muted">
                          {countryIso && (
                            <img
                              src={`https://flagcdn.com/w40/${countryIso}.png`}
                              alt={event.country}
                              className="h-3 w-auto rounded-sm"
                            />
                          )}
                          <span className="truncate max-w-[80px]">{event.country}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: participant count */}
                  {totalParticipants > 0 && (
                    <div className="flex items-center gap-1 text-xs text-t-muted shrink-0">
                      <Users className="h-3.5 w-3.5" />
                      <span>{totalParticipants}</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
