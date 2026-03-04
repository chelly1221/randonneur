"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user/user-avatar";
import {
  Calendar,
  CalendarPlus,
  MapPin,
  Users,
  ExternalLink,
  Trash2,
  Pencil,
  Check,
  Heart,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

interface EventDetailProps {
  event: {
    id: string;
    title: string;
    description: string | null;
    eventType: string;
    location: string | null;
    startDate: string;
    endDate: string | null;
    maxParticipants: number | null;
    sourceType?: string | null;
    sourceUrl?: string | null;
    country?: string | null;
    createdAt: string;
    user: { id: string; displayName: string; avatarKey: string | null };
    course: { id: string; name: string; distanceKm: number; region: string | null } | null;
    participants: {
      id: string;
      status: string;
      user: { id: string; displayName: string; avatarKey: string | null };
    }[];
    goingCount: number;
    interestedCount: number;
  };
  currentUserId: string | null;
  currentUserStatus: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  isLoggedIn: boolean;
}

export function EventDetailClient({
  event,
  currentUserId,
  currentUserStatus,
  isOwner,
  isAdmin,
  isLoggedIn,
}: EventDetailProps) {
  const router = useRouter();
  const [participationStatus, setParticipationStatus] = useState<string | null>(
    currentUserStatus
  );
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [goingCount, setGoingCount] = useState(event.goingCount);
  const [interestedCount, setInterestedCount] = useState(event.interestedCount);
  const [participants, setParticipants] = useState(event.participants);

  const startDate = new Date(event.startDate);
  const endDate = event.endDate ? new Date(event.endDate) : null;

  const handleParticipate = async (status: "going" | "interested" | "cancelled") => {
    if (submitting) return;
    setSubmitting(true);

    // Optimistic update
    const prevStatus = participationStatus;
    const prevGoing = goingCount;
    const prevInterested = interestedCount;
    const prevParticipants = participants;

    if (status === "cancelled") {
      setParticipationStatus(null);
      if (prevStatus === "going") setGoingCount((c) => c - 1);
      if (prevStatus === "interested") setInterestedCount((c) => c - 1);
      setParticipants((prev) =>
        prev.filter((p) => p.user.id !== currentUserId)
      );
    } else {
      setParticipationStatus(status);
      if (prevStatus === "going" && status === "interested") {
        setGoingCount((c) => c - 1);
        setInterestedCount((c) => c + 1);
      } else if (prevStatus === "interested" && status === "going") {
        setInterestedCount((c) => c - 1);
        setGoingCount((c) => c + 1);
      } else if (!prevStatus) {
        if (status === "going") setGoingCount((c) => c + 1);
        if (status === "interested") setInterestedCount((c) => c + 1);
      }
    }

    try {
      const res = await fetch(`/api/events/${event.id}/participate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        // Revert on error
        setParticipationStatus(prevStatus);
        setGoingCount(prevGoing);
        setInterestedCount(prevInterested);
        setParticipants(prevParticipants);
        const data = await res.json();
        alert(data.error || "오류가 발생했습니다.");
      } else {
        router.refresh();
      }
    } catch {
      setParticipationStatus(prevStatus);
      setGoingCount(prevGoing);
      setInterestedCount(prevInterested);
      setParticipants(prevParticipants);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("이 이벤트를 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/events/${event.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/community/events");
      } else {
        alert("삭제에 실패했습니다.");
      }
    } catch {
      alert("오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const goingParticipants = participants.filter((p) => p.status === "going");
  const interestedParticipants = participants.filter((p) => p.status === "interested");

  const remainingSpots = event.maxParticipants
    ? event.maxParticipants - goingCount
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="py-4 px-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge
                  variant={EVENT_TYPE_VARIANT[event.eventType] ?? "default"}
                >
                  {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                </Badge>
                {event.sourceType && (
                  event.sourceUrl ? (
                    <a
                      href={event.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-sky-blue/10 text-sky-blue font-medium hover:bg-sky-blue/20 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {event.sourceType === "acp" ? "ACP" : event.sourceType.toUpperCase()}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-blue/10 text-sky-blue font-medium">
                      {event.sourceType === "acp" ? "ACP" : event.sourceType.toUpperCase()}
                    </span>
                  )
                )}
                {event.country && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-orange/10 text-sky-orange font-medium">
                    {event.country}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-t-text">{event.title}</h2>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => window.open(`/api/events/${event.id}/ical`)}
                className="rounded-md p-1.5 hover:bg-sky-blue/10 transition-colors text-t-muted hover:text-sky-blue"
                title="캘린더에 추가"
              >
                <CalendarPlus className="h-4 w-4" />
              </button>
              {isAdmin && (
                <>
                  <Link
                    href={`/community/events/${event.id}/edit`}
                    className="rounded-md p-1.5 hover:bg-t-hover transition-colors text-t-muted"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded-md p-1.5 hover:bg-sky-red/10 transition-colors text-t-muted hover:text-sky-red disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Meta info */}
          <div className="mt-3 space-y-2 text-sm text-t-muted">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>
                {format(startDate, "yyyy년 M월 d일 (EEE) HH:mm", { locale: ko })}
                {endDate && (
                  <>
                    {" ~ "}
                    {format(endDate, "M월 d일 HH:mm", { locale: ko })}
                  </>
                )}
              </span>
            </div>

            {event.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" />
                <span>{event.location}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 shrink-0" />
              <span>
                참가 {goingCount}명 / 관심 {interestedCount}명
                {event.maxParticipants && (
                  <span className="ml-1 text-t-muted">
                    (정원 {event.maxParticipants}명)
                  </span>
                )}
              </span>
            </div>

            {remainingSpots !== null && remainingSpots > 0 && (
              <p className="text-xs text-sky-orange">
                잔여 {remainingSpots}자리
              </p>
            )}
            {remainingSpots !== null && remainingSpots <= 0 && (
              <p className="text-xs text-sky-red">마감</p>
            )}
          </div>

          {/* Linked course */}
          {event.course && (
            <div className="mt-3">
              <Link
                href={`/courses/${event.course.id}`}
                className="inline-flex items-center gap-1 text-sm text-sky-blue hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {event.course.name}
                {event.course.region && (
                  <span className="text-t-muted">({event.course.region})</span>
                )}
                <span className="text-t-muted">
                  - {event.course.distanceKm}km
                </span>
              </Link>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="mt-4 whitespace-pre-wrap text-sm text-t-text">
              {event.description}
            </div>
          )}

          {/* Organizer */}
          <div className="mt-4 flex items-center gap-2 border-t border-t-border pt-3">
            <span className="text-xs text-t-muted">주최:</span>
            <Link
              href={`/users/${event.user.id}`}
              className="flex items-center gap-1 hover:underline"
            >
              <UserAvatar
                displayName={event.user.displayName}
                avatarKey={event.user.avatarKey}
                size="sm"
              />
              <span className="text-xs font-medium text-t-text">
                {event.user.displayName}
              </span>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Participation buttons */}
      {isLoggedIn && (
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  handleParticipate(
                    participationStatus === "going" ? "cancelled" : "going"
                  )
                }
                disabled={submitting}
                className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  participationStatus === "going"
                    ? "bg-sky-blue text-white"
                    : "border border-sky-blue text-sky-blue hover:bg-sky-blue/10"
                }`}
              >
                <Check className="h-4 w-4" />
                참가
              </button>
              <button
                onClick={() =>
                  handleParticipate(
                    participationStatus === "interested" ? "cancelled" : "interested"
                  )
                }
                disabled={submitting}
                className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  participationStatus === "interested"
                    ? "bg-sky-yellow text-sky-black"
                    : "border border-sky-yellow text-sky-yellow hover:bg-sky-yellow/10"
                }`}
              >
                <Heart className="h-4 w-4" />
                관심있음
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Participant list */}
      {(goingParticipants.length > 0 || interestedParticipants.length > 0) && (
        <Card>
          <CardContent className="py-3 px-4">
            {goingParticipants.length > 0 && (
              <div className="mb-3">
                <h3 className="mb-2 text-sm font-semibold text-t-text">
                  참가 ({goingParticipants.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {goingParticipants.map((p) => (
                    <Link
                      key={p.id}
                      href={`/users/${p.user.id}`}
                      className="flex items-center gap-1 rounded-full bg-t-subtle px-2 py-1 hover:bg-t-hover transition-colors"
                    >
                      <UserAvatar
                        displayName={p.user.displayName}
                        avatarKey={p.user.avatarKey}
                        size="sm"
                      />
                      <span className="text-xs text-t-text">
                        {p.user.displayName}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {interestedParticipants.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-t-text">
                  관심 ({interestedParticipants.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {interestedParticipants.map((p) => (
                    <Link
                      key={p.id}
                      href={`/users/${p.user.id}`}
                      className="flex items-center gap-1 rounded-full bg-t-subtle px-2 py-1 hover:bg-t-hover transition-colors"
                    >
                      <UserAvatar
                        displayName={p.user.displayName}
                        avatarKey={p.user.avatarKey}
                        size="sm"
                      />
                      <span className="text-xs text-t-text">
                        {p.user.displayName}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
