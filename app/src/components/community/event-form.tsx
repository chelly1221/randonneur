"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const EVENT_TYPES = [
  { value: "brevet", label: "브레베" },
  { value: "group_ride", label: "그룹라이드" },
  { value: "festival", label: "자전거 축제" },
  { value: "other", label: "기타" },
];

interface EventFormProps {
  initialData?: {
    id: string;
    title: string;
    description: string | null;
    eventType: string;
    courseId: string | null;
    location: string | null;
    startDate: string;
    endDate: string | null;
    maxParticipants: number | null;
  };
}

export function EventForm({ initialData }: EventFormProps) {
  const router = useRouter();
  const isEditing = !!initialData;

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [eventType, setEventType] = useState(initialData?.eventType ?? "group_ride");
  const [location, setLocation] = useState(initialData?.location ?? "");
  const [startDate, setStartDate] = useState(
    initialData?.startDate
      ? new Date(initialData.startDate).toISOString().slice(0, 16)
      : ""
  );
  const [endDate, setEndDate] = useState(
    initialData?.endDate
      ? new Date(initialData.endDate).toISOString().slice(0, 16)
      : ""
  );
  const [maxParticipants, setMaxParticipants] = useState(
    initialData?.maxParticipants?.toString() ?? ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    if (!startDate) {
      setError("시작 일시를 선택해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        eventType,
        location: location.trim() || null,
        startDate: new Date(startDate).toISOString(),
        endDate: endDate ? new Date(endDate).toISOString() : null,
        maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
      };

      const url = isEditing
        ? `/api/events/${initialData.id}`
        : "/api/events";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "오류가 발생했습니다.");
        return;
      }

      const result = await res.json();
      router.push(`/community/events/${result.id}`);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="py-4 px-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-sky-red/10 px-3 py-2 text-sm text-sky-red">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="mb-1 block text-sm font-medium text-t-text">
              제목 <span className="text-sky-red">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="이벤트 제목"
              maxLength={100}
              className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none"
            />
          </div>

          {/* Event type */}
          <div>
            <label className="mb-1 block text-sm font-medium text-t-text">
              유형 <span className="text-sky-red">*</span>
            </label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text focus:border-sky-blue focus:outline-none"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-t-text">
              설명
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="이벤트에 대한 상세 설명"
              rows={4}
              className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none resize-y"
            />
          </div>

          {/* Location */}
          <div>
            <label className="mb-1 block text-sm font-medium text-t-text">
              장소
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="출발지 또는 모임 장소"
              className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none"
            />
          </div>

          {/* Start / End date */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-t-text">
                시작 일시 <span className="text-sky-red">*</span>
              </label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text focus:border-sky-blue focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-t-text">
                종료 일시
              </label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text focus:border-sky-blue focus:outline-none"
              />
            </div>
          </div>

          {/* Max participants */}
          <div>
            <label className="mb-1 block text-sm font-medium text-t-text">
              최대 참가 인원
            </label>
            <input
              type="number"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
              placeholder="제한 없음"
              min={1}
              className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none"
            />
            <p className="mt-1 text-xs text-t-muted">
              비워두면 인원 제한 없이 참가할 수 있습니다.
            </p>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-md border border-t-border px-4 py-2 text-sm text-t-text hover:bg-t-hover transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-darkblue px-4 py-2 text-sm font-medium text-white hover:bg-sky-darkblue/90 transition-colors disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEditing ? "수정" : "만들기"}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
