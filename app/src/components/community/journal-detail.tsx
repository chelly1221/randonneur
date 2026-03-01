"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user/user-avatar";
import { ReviewContent } from "@/components/ui/rich-text-editor";
import {
  ArrowLeft,
  Calendar,
  Bike,
  MapPin,
  Pencil,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface JournalPhoto {
  id: string;
  imageKey: string;
  caption: string | null;
  sortOrder: number;
}

interface JournalData {
  id: string;
  title: string;
  content: string;
  rideDate: string | null;
  distance: number | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; displayName: string; avatarKey: string | null };
  course: { id: string; name: string; distanceKm: number; region: string | null } | null;
  photos: JournalPhoto[];
}

interface JournalDetailProps {
  journal: JournalData;
  isOwner: boolean;
  isAdmin: boolean;
}

export function JournalDetail({ journal, isOwner, isAdmin }: JournalDetailProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleDelete = async () => {
    if (!confirm("정말 이 일지를 삭제하시겠습니까?")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/journals/${journal.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/community/journals");
        router.refresh();
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  const prevPhoto = () =>
    setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  const nextPhoto = () =>
    setLightboxIndex((i) =>
      i !== null && i < journal.photos.length - 1 ? i + 1 : i
    );

  return (
    <div>
      {/* Back link */}
      <div className="mb-4">
        <Link
          href="/community/journals"
          className="inline-flex items-center gap-1 text-sm text-t-muted hover:text-t-text transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          목록으로
        </Link>
      </div>

      <Card>
        <CardContent className="py-5 px-4 sm:px-6">
          {/* Header */}
          <div className="mb-4">
            <h1 className="text-xl font-bold text-t-text mb-2">{journal.title}</h1>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link
                  href={`/users/${journal.user.id}`}
                  className="flex items-center gap-1.5 hover:underline"
                >
                  <UserAvatar
                    displayName={journal.user.displayName}
                    avatarKey={journal.user.avatarKey}
                    size="sm"
                  />
                  <span className="text-sm font-medium text-t-text">
                    {journal.user.displayName}
                  </span>
                </Link>
                <span className="text-xs text-t-muted">
                  {format(new Date(journal.createdAt), "yyyy.M.d HH:mm", {
                    locale: ko,
                  })}
                </span>
              </div>

              {/* Owner/admin actions */}
              {(isOwner || isAdmin) && (
                <div className="flex items-center gap-1">
                  {isOwner && (
                    <Link
                      href={`/community/journals/${journal.id}/edit`}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-t-muted hover:bg-t-hover hover:text-t-text transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                      수정
                    </Link>
                  )}
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-t-muted hover:bg-sky-red/10 hover:text-sky-red transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                    삭제
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Meta info badges */}
          <div className="mb-4 flex flex-wrap gap-2">
            {journal.rideDate && (
              <Badge variant="default" className="text-[11px]">
                <Calendar className="mr-1 h-3 w-3" />
                {format(new Date(journal.rideDate), "yyyy년 M월 d일", {
                  locale: ko,
                })}
              </Badge>
            )}
            {journal.distance && (
              <Badge variant="default" className="text-[11px]">
                <Bike className="mr-1 h-3 w-3" />
                {journal.distance}km
              </Badge>
            )}
            {journal.course && (
              <Link href={`/courses/${journal.course.id}`}>
                <Badge variant="primary" className="text-[11px] cursor-pointer hover:opacity-80">
                  <MapPin className="mr-1 h-3 w-3" />
                  {journal.course.name}
                  {journal.course.region && ` (${journal.course.region})`}
                </Badge>
              </Link>
            )}
          </div>

          {/* Photo gallery */}
          {journal.photos.length > 0 && (
            <div className="mb-4">
              <div className={`grid gap-2 ${
                journal.photos.length === 1
                  ? "grid-cols-1"
                  : journal.photos.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-2 sm:grid-cols-3"
              }`}>
                {journal.photos.map((photo, index) => (
                  <button
                    key={photo.id}
                    onClick={() => openLightbox(index)}
                    className="relative aspect-[4/3] overflow-hidden rounded border border-t-border hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/images/${encodeURIComponent(photo.imageKey)}`}
                      alt={photo.caption ?? `사진 ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="prose-sm">
            <ReviewContent html={journal.content} />
          </div>
        </CardContent>
      </Card>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={closeLightbox}
        >
          {/* Close button */}
          <button
            onClick={closeLightbox}
            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Navigation */}
          {journal.photos.length > 1 && (
            <>
              {lightboxIndex > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    prevPhoto();
                  }}
                  className="absolute left-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}
              {lightboxIndex < journal.photos.length - 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    nextPhoto();
                  }}
                  className="absolute right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
            </>
          )}

          {/* Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/images/${encodeURIComponent(journal.photos[lightboxIndex].imageKey)}`}
            alt={journal.photos[lightboxIndex].caption ?? "사진"}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
            {lightboxIndex + 1} / {journal.photos.length}
          </div>
        </div>
      )}
    </div>
  );
}
