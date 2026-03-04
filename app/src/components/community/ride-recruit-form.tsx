"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { X, Search, Loader2 } from "lucide-react";

interface CourseOption {
  id: string;
  name: string;
  distanceKm: number;
  region: string | null;
}

interface RideRecruitFormProps {
  onCreated: () => void;
  onCancel: () => void;
  initialData?: {
    id: string;
    title: string;
    description: string | null;
    rideDate: string;
    meetingPoint: string | null;
    maxMembers: number;
    courseId: string | null;
    course: CourseOption | null;
  };
}

export function RideRecruitForm({ onCreated, onCancel, initialData }: RideRecruitFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [rideDate, setRideDate] = useState(
    initialData?.rideDate
      ? initialData.rideDate.slice(0, 16)
      : ""
  );
  const [meetingPoint, setMeetingPoint] = useState(initialData?.meetingPoint ?? "");
  const [maxMembers, setMaxMembers] = useState(initialData?.maxMembers ?? 10);
  const [selectedCourse, setSelectedCourse] = useState<CourseOption | null>(
    initialData?.course ?? null
  );
  const [courseQuery, setCourseQuery] = useState("");
  const [courseResults, setCourseResults] = useState<CourseOption[]>([]);
  const [searchingCourse, setSearchingCourse] = useState(false);
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const courseDropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isEditing = !!initialData?.id;

  // Course search with debounce
  useEffect(() => {
    if (courseQuery.length < 2) {
      setCourseResults([]);
      setShowCourseDropdown(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearchingCourse(true);
      try {
        const res = await fetch(
          `/api/courses?q=${encodeURIComponent(courseQuery)}&limit=10`
        );
        if (res.ok) {
          const data = await res.json();
          const courses = (data.courses || data || []).map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (c: any) => ({
              id: c.id,
              name: c.name,
              distanceKm: c.distanceKm,
              region: c.region,
            })
          );
          setCourseResults(courses);
          setShowCourseDropdown(courses.length > 0);
        }
      } catch {
        // ignore
      } finally {
        setSearchingCourse(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [courseQuery]);

  // Close course dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        courseDropdownRef.current &&
        !courseDropdownRef.current.contains(e.target as Node)
      ) {
        setShowCourseDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const url = isEditing
        ? `/api/ride-recruits/${initialData!.id}`
        : "/api/ride-recruits";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          rideDate: new Date(rideDate).toISOString(),
          courseId: selectedCourse?.id || null,
          meetingPoint: meetingPoint.trim() || null,
          maxMembers,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "오류가 발생했습니다.");
        return;
      }

      onCreated();
    } catch {
      setError("오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="py-4 px-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-t-text">
              {isEditing ? "모집글 수정" : "동행 모집하기"}
            </h3>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md p-1 hover:bg-t-hover transition-colors text-t-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <div className="rounded-md bg-sky-red/10 px-3 py-2 text-xs text-sky-red">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label htmlFor="recruit-title" className="block text-xs font-medium text-t-muted mb-1">
              제목 <span className="text-sky-red">*</span>
            </label>
            <input
              id="recruit-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 주말 한강 200km 함께 달리실 분"
              maxLength={100}
              required
              className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none focus:ring-1 focus:ring-sky-blue"
            />
          </div>

          {/* Ride date */}
          <div>
            <label htmlFor="recruit-date" className="block text-xs font-medium text-t-muted mb-1">
              라이딩 날짜 <span className="text-sky-red">*</span>
            </label>
            <input
              id="recruit-date"
              type="datetime-local"
              value={rideDate}
              onChange={(e) => setRideDate(e.target.value)}
              required
              className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text focus:border-sky-blue focus:outline-none focus:ring-1 focus:ring-sky-blue"
            />
          </div>

          {/* Course selector */}
          <div ref={courseDropdownRef} className="relative">
            <label className="block text-xs font-medium text-t-muted mb-1">
              연결 코스 (선택)
            </label>
            {selectedCourse ? (
              <div className="flex items-center justify-between rounded-md border border-t-border bg-t-subtle px-3 py-2">
                <span className="text-sm text-t-text truncate">
                  {selectedCourse.name}
                  <span className="ml-1 text-t-muted">
                    ({selectedCourse.distanceKm}km{selectedCourse.region ? `, ${selectedCourse.region}` : ""})
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedCourse(null)}
                  className="ml-2 shrink-0 rounded p-0.5 hover:bg-t-hover transition-colors text-t-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-t-muted" />
                <input
                  type="text"
                  value={courseQuery}
                  onChange={(e) => setCourseQuery(e.target.value)}
                  placeholder="코스 이름으로 검색..."
                  className="w-full rounded-md border border-t-border bg-t-surface pl-8 pr-3 py-2 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none focus:ring-1 focus:ring-sky-blue"
                />
                {searchingCourse && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-t-muted animate-spin" />
                )}
              </div>
            )}

            {showCourseDropdown && courseResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-t-border bg-t-surface shadow-lg max-h-48 overflow-auto">
                {courseResults.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => {
                      setSelectedCourse(course);
                      setCourseQuery("");
                      setShowCourseDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-t-hover transition-colors"
                  >
                    <span className="text-t-text">{course.name}</span>
                    <span className="ml-1 text-t-muted text-xs">
                      ({course.distanceKm}km{course.region ? `, ${course.region}` : ""})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Meeting point */}
          <div>
            <label htmlFor="recruit-meeting" className="block text-xs font-medium text-t-muted mb-1">
              만남 장소 (선택)
            </label>
            <input
              id="recruit-meeting"
              type="text"
              value={meetingPoint}
              onChange={(e) => setMeetingPoint(e.target.value)}
              placeholder="예: 여의도 공원 자전거 대여소 앞"
              maxLength={200}
              className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none focus:ring-1 focus:ring-sky-blue"
            />
          </div>

          {/* Max members */}
          <div>
            <label htmlFor="recruit-max" className="block text-xs font-medium text-t-muted mb-1">
              모집 인원
            </label>
            <input
              id="recruit-max"
              type="number"
              min={2}
              max={100}
              value={maxMembers}
              onChange={(e) => setMaxMembers(parseInt(e.target.value) || 10)}
              className="w-24 rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text focus:border-sky-blue focus:outline-none focus:ring-1 focus:ring-sky-blue"
            />
            <span className="ml-2 text-xs text-t-muted">명</span>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="recruit-desc" className="block text-xs font-medium text-t-muted mb-1">
              상세 내용 (선택)
            </label>
            <textarea
              id="recruit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="라이딩 계획, 페이스, 준비물 등 자유롭게 작성하세요"
              rows={3}
              maxLength={2000}
              className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none focus:ring-1 focus:ring-sky-blue resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-4 py-2 text-sm font-medium text-t-muted hover:bg-t-hover transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !rideDate}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-darkblue px-4 py-2 text-sm font-medium text-white hover:bg-sky-darkblue/90 transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {isEditing ? "수정" : "모집 등록"}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
