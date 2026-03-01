"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ImagePlus, X, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface CourseOption {
  id: string;
  name: string;
  distanceKm: number;
  region: string | null;
}

interface ExistingPhoto {
  id: string;
  imageKey: string;
  caption: string | null;
  sortOrder: number;
}

export default function EditJournalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session, status } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [rideDate, setRideDate] = useState("");
  const [distance, setDistance] = useState("");
  const [courseId, setCourseId] = useState("");
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<ExistingPhoto[]>([]);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Redirect if not logged in
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  // Fetch journal data
  useEffect(() => {
    Promise.all([
      fetch(`/api/journals/${id}`).then((r) => r.json()),
      fetch("/api/courses?limit=200&archived=false").then((r) => r.json()),
    ])
      .then(([journal, coursesData]) => {
        setTitle(journal.title);
        setContent(journal.content);
        setRideDate(
          journal.rideDate
            ? new Date(journal.rideDate).toISOString().split("T")[0]
            : ""
        );
        setDistance(journal.distance ? String(journal.distance) : "");
        setCourseId(journal.courseId ?? "");
        setExistingPhotos(journal.photos ?? []);

        const list = Array.isArray(coursesData)
          ? coursesData
          : coursesData.courses ?? [];
        setCourses(list);
      })
      .catch(() => setError("일지를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, [id]);

  const totalPhotos = existingPhotos.length + newPhotos.length;

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const remaining = 5 - totalPhotos;
    const added = files.slice(0, remaining);

    const previews = added.map((f) => URL.createObjectURL(f));
    setNewPhotos((prev) => [...prev, ...added]);
    setNewPreviews((prev) => [...prev, ...previews]);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeNewPhoto = (index: number) => {
    URL.revokeObjectURL(newPreviews[index]);
    setNewPhotos((prev) => prev.filter((_, i) => i !== index));
    setNewPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError("제목과 내용은 필수입니다.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const formData = new FormData();
      formData.set("title", title.trim());
      formData.set("content", content.trim());
      if (rideDate) formData.set("rideDate", rideDate);
      if (distance) formData.set("distance", distance);
      if (courseId) formData.set("courseId", courseId);
      newPhotos.forEach((photo) => formData.append("photos", photo));

      const res = await fetch(`/api/journals/${id}`, {
        method: "PUT",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "수정에 실패했습니다.");
      }

      router.push(`/community/journals/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-t-muted" />
      </div>
    );
  }

  if (!session?.user) return null;

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/community/journals/${id}`}
          className="inline-flex items-center gap-1 text-sm text-t-muted hover:text-t-text transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          돌아가기
        </Link>
      </div>

      <Card>
        <CardContent className="py-5 px-4 sm:px-6">
          <h2 className="mb-4 text-lg font-semibold">일지 수정</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <label className="mb-1 block text-xs font-medium text-t-text">
                제목 <span className="text-sky-red">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="라이드 제목을 입력하세요"
                className="w-full rounded border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue/50 focus:outline-none transition-colors"
                maxLength={100}
                required
              />
            </div>

            {/* Content */}
            <div>
              <label className="mb-1 block text-xs font-medium text-t-text">
                내용 <span className="text-sky-red">*</span>
              </label>
              <RichTextEditor
                value={content}
                onChange={setContent}
                placeholder="라이드 경험을 자유롭게 작성하세요..."
                minHeight={120}
              />
            </div>

            {/* Date + Distance row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-t-text">
                  라이드 날짜
                </label>
                <input
                  type="date"
                  value={rideDate}
                  onChange={(e) => setRideDate(e.target.value)}
                  className="w-full rounded border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text focus:border-sky-blue/50 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-t-text">
                  거리 (km)
                </label>
                <input
                  type="number"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.1"
                  className="w-full rounded border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue/50 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Course selector */}
            <div>
              <label className="mb-1 block text-xs font-medium text-t-text">
                코스 연결 (선택)
              </label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full rounded border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text focus:border-sky-blue/50 focus:outline-none transition-colors"
              >
                <option value="">코스를 선택하세요</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                    {course.region ? ` (${course.region})` : ""}
                    {" - "}
                    {course.distanceKm}km
                  </option>
                ))}
              </select>
            </div>

            {/* Photo management */}
            <div>
              <label className="mb-1 block text-xs font-medium text-t-text">
                사진 (최대 5장)
              </label>

              {/* Existing photos */}
              {existingPhotos.length > 0 && (
                <div className="mb-2 grid grid-cols-5 gap-2">
                  {existingPhotos.map((photo) => (
                    <div key={photo.id} className="relative aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/images/${encodeURIComponent(photo.imageKey)}`}
                        alt={photo.caption ?? "기존 사진"}
                        className="h-full w-full rounded object-cover border border-t-border"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* New photo previews */}
              {newPreviews.length > 0 && (
                <div className="mb-2 grid grid-cols-5 gap-2">
                  {newPreviews.map((preview, index) => (
                    <div key={index} className="relative aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview}
                        alt={`새 사진 ${index + 1}`}
                        className="h-full w-full rounded object-cover border border-sky-blue/30"
                      />
                      <button
                        type="button"
                        onClick={() => removeNewPhoto(index)}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-sky-red text-white text-xs hover:bg-sky-red/80"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {totalPhotos < 5 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-1.5 rounded border-2 border-dashed border-t-border py-4 text-sm text-t-muted hover:border-sky-blue/40 hover:text-sky-blue transition-colors"
                >
                  <ImagePlus className="h-4 w-4" />
                  사진 추가 ({totalPhotos}/5)
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </div>

            {/* Error */}
            {error && <p className="text-xs text-sky-red">{error}</p>}

            {/* Submit */}
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-md bg-sky-darkblue px-4 py-2 text-sm font-medium text-white hover:bg-sky-darkblue/90 transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  "수정 완료"
                )}
              </button>
              <Link
                href={`/community/journals/${id}`}
                className="inline-flex items-center rounded-md border border-t-border px-4 py-2 text-sm text-t-text hover:bg-t-hover transition-colors"
              >
                취소
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
