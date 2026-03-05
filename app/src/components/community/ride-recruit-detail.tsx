"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user/user-avatar";
import { RideRecruitForm } from "./ride-recruit-form";
import {
  Calendar,
  MapPin,
  Users,
  ExternalLink,
  Trash2,
  Pencil,
  UserPlus,
  UserMinus,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "primary" | "success" | "warning" | "danger" }
> = {
  open: { label: "모집중", variant: "success" },
  closed: { label: "마감", variant: "default" },
  completed: { label: "완료", variant: "primary" },
  cancelled: { label: "취소", variant: "danger" },
};

interface Participant {
  id: string;
  message: string | null;
  createdAt: string;
  user: { id: string; displayName: string; avatarKey: string | null };
}

interface RecruitData {
  id: string;
  title: string;
  description: string | null;
  rideDate: string;
  meetingPoint: string | null;
  maxMembers: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  participantCount: number;
  user: { id: string; displayName: string; avatarKey: string | null };
  course: { id: string; slug: string; name: string; distanceKm: number; region: string | null } | null;
  participants: Participant[];
}

interface RideRecruitDetailProps {
  recruit: RecruitData;
  currentUserId: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  isLoggedIn: boolean;
  currentUserJoined: boolean;
}

export function RideRecruitDetail({
  recruit,
  currentUserId,
  isOwner,
  isAdmin,
  isLoggedIn,
  currentUserJoined,
}: RideRecruitDetailProps) {
  const router = useRouter();
  const [joined, setJoined] = useState(currentUserJoined);
  const [participantCount, setParticipantCount] = useState(recruit.participantCount);
  const [participants, setParticipants] = useState(recruit.participants);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const rideDate = new Date(recruit.rideDate);
  const statusConfig = STATUS_CONFIG[recruit.status] || STATUS_CONFIG.open;
  const isFull = participantCount >= recruit.maxMembers;
  const remainingSpots = recruit.maxMembers - participantCount;

  const handleJoinToggle = async () => {
    if (submitting) return;
    setSubmitting(true);

    // Optimistic update
    const prevJoined = joined;
    const prevCount = participantCount;
    const prevParticipants = participants;

    if (joined) {
      setJoined(false);
      setParticipantCount((c) => c - 1);
      setParticipants((prev) =>
        prev.filter((p) => p.user.id !== currentUserId)
      );
    } else {
      setJoined(true);
      setParticipantCount((c) => c + 1);
    }

    try {
      const res = await fetch(`/api/ride-recruits/${recruit.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        // Revert
        setJoined(prevJoined);
        setParticipantCount(prevCount);
        setParticipants(prevParticipants);
        const data = await res.json();
        alert(data.error || "오류가 발생했습니다.");
      } else {
        router.refresh();
      }
    } catch {
      setJoined(prevJoined);
      setParticipantCount(prevCount);
      setParticipants(prevParticipants);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("이 모집글을 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/ride-recruits/${recruit.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/community/rides");
      } else {
        alert("삭제에 실패했습니다.");
      }
    } catch {
      alert("오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (statusUpdating) return;
    setStatusUpdating(true);
    try {
      const res = await fetch(`/api/ride-recruits/${recruit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        alert("상태 변경에 실패했습니다.");
      }
    } catch {
      alert("오류가 발생했습니다.");
    } finally {
      setStatusUpdating(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setEditing(false)}
          className="inline-flex items-center gap-1 text-sm text-t-muted hover:text-t-text transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          돌아가기
        </button>
        <RideRecruitForm
          initialData={{
            id: recruit.id,
            title: recruit.title,
            description: recruit.description,
            rideDate: recruit.rideDate,
            meetingPoint: recruit.meetingPoint,
            maxMembers: recruit.maxMembers,
            courseId: recruit.course?.id ?? null,
            course: recruit.course,
          }}
          onCreated={() => {
            setEditing(false);
            router.refresh();
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href="/community/rides"
        className="inline-flex items-center gap-1 text-sm text-t-muted hover:text-t-text transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        목록으로
      </Link>

      {/* Main info card */}
      <Card>
        <CardContent className="py-4 px-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={statusConfig.variant}>
                  {statusConfig.label}
                </Badge>
                {isFull && recruit.status === "open" && (
                  <Badge variant="danger">인원 마감</Badge>
                )}
              </div>
              <h2 className="text-xl font-bold text-t-text">{recruit.title}</h2>
            </div>

            {(isOwner || isAdmin) && (
              <div className="flex items-center gap-1 shrink-0">
                {isOwner && (
                  <button
                    onClick={() => setEditing(true)}
                    className="rounded-md p-1.5 hover:bg-t-hover transition-colors text-t-muted"
                    title="수정"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-md p-1.5 hover:bg-sky-red/10 transition-colors text-t-muted hover:text-sky-red disabled:opacity-50"
                  title="삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Meta info */}
          <div className="mt-3 space-y-2 text-sm text-t-muted">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>
                {format(rideDate, "yyyy년 M월 d일 (EEE) HH:mm", { locale: ko })}
              </span>
            </div>

            {recruit.meetingPoint && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" />
                <span>{recruit.meetingPoint}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 shrink-0" />
              <span>
                참여 {participantCount}명 / 모집 {recruit.maxMembers}명
              </span>
              {remainingSpots > 0 && recruit.status === "open" && (
                <span className="text-xs text-sky-orange">
                  (잔여 {remainingSpots}자리)
                </span>
              )}
            </div>
          </div>

          {/* Linked course */}
          {recruit.course && (
            <div className="mt-3">
              <Link
                href={`/courses/${recruit.course.slug}`}
                className="inline-flex items-center gap-1 text-sm text-sky-blue hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {recruit.course.name}
                {recruit.course.region && (
                  <span className="text-t-muted">({recruit.course.region})</span>
                )}
                <span className="text-t-muted">
                  - {recruit.course.distanceKm}km
                </span>
              </Link>
            </div>
          )}

          {/* Description */}
          {recruit.description && (
            <div className="mt-4 whitespace-pre-wrap text-sm text-t-text">
              {recruit.description}
            </div>
          )}

          {/* Organizer */}
          <div className="mt-4 flex items-center gap-2 border-t border-t-border pt-3">
            <span className="text-xs text-t-muted">모집자:</span>
            <Link
              href={`/users/${recruit.user.id}`}
              className="flex items-center gap-1 hover:underline"
            >
              <UserAvatar
                displayName={recruit.user.displayName}
                avatarKey={recruit.user.avatarKey}
                size="sm"
              />
              <span className="text-xs font-medium text-t-text">
                {recruit.user.displayName}
              </span>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Join button */}
      {isLoggedIn && !isOwner && recruit.status === "open" && (
        <Card>
          <CardContent className="py-3 px-4">
            <button
              onClick={handleJoinToggle}
              disabled={submitting || (!joined && isFull)}
              className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                joined
                  ? "bg-sky-red/10 text-sky-red border border-sky-red/30 hover:bg-sky-red/20"
                  : "bg-sky-blue text-white hover:bg-sky-blue/90"
              }`}
            >
              {joined ? (
                <>
                  <UserMinus className="h-4 w-4" />
                  참여 취소
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  {isFull ? "인원 마감" : "참여하기"}
                </>
              )}
            </button>
          </CardContent>
        </Card>
      )}

      {/* Status change for owner */}
      {isOwner && recruit.status === "open" && (
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-t-muted">상태 변경:</span>
              <button
                onClick={() => handleStatusChange("closed")}
                disabled={statusUpdating}
                className="rounded-md px-3 py-1.5 text-xs font-medium border border-t-border text-t-muted hover:bg-t-hover transition-colors disabled:opacity-50"
              >
                모집 마감
              </button>
              <button
                onClick={() => handleStatusChange("completed")}
                disabled={statusUpdating}
                className="rounded-md px-3 py-1.5 text-xs font-medium border border-sky-blue/30 text-sky-blue hover:bg-sky-blue/10 transition-colors disabled:opacity-50"
              >
                라이딩 완료
              </button>
              <button
                onClick={() => handleStatusChange("cancelled")}
                disabled={statusUpdating}
                className="rounded-md px-3 py-1.5 text-xs font-medium border border-sky-red/30 text-sky-red hover:bg-sky-red/10 transition-colors disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Participant list */}
      {participants.length > 0 && (
        <Card>
          <CardContent className="py-3 px-4">
            <h3 className="mb-2 text-sm font-semibold text-t-text">
              참여자 ({participants.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {participants.map((p) => (
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
