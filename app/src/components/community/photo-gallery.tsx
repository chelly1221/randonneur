"use client";

import { useState, useEffect, useCallback } from "react";
import { REGIONS } from "@/types";
import { PhotoLightbox } from "./photo-lightbox";
import { Camera } from "lucide-react";

interface GalleryPhoto {
  id: string;
  imageKey: string;
  imageUrl: string;
  type: "review" | "journal" | "checkpoint";
  user: { id: string; displayName: string; avatarKey: string | null } | null;
  course: { id: string; name: string; region: string | null } | null;
  caption: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  review: "후기",
  journal: "일지",
  checkpoint: "체크포인트",
};

const PAGE_SIZE = 30;

export function GalleryGrid() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [region, setRegion] = useState("");
  const [lightboxPhoto, setLightboxPhoto] = useState<GalleryPhoto | null>(null);

  const fetchPhotos = useCallback(
    async (offset: number, append: boolean) => {
      if (offset === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (region) params.set("region", region);

        const res = await fetch(`/api/gallery?${params}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data: GalleryPhoto[] = await res.json();

        if (append) {
          setPhotos((prev) => [...prev, ...data]);
        } else {
          setPhotos(data);
        }

        setHasMore(data.length >= PAGE_SIZE);
      } catch {
        if (!append) setPhotos([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [region]
  );

  useEffect(() => {
    fetchPhotos(0, false);
  }, [fetchPhotos]);

  function handleLoadMore() {
    fetchPhotos(photos.length, true);
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 flex items-center gap-2">
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="rounded border border-t-border bg-t-surface px-3 py-1.5 text-sm text-t-text focus:outline-none focus:ring-1 focus:ring-sky-blue"
        >
          <option value="">전체 지역</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-lg bg-t-subtle"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && photos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-t-muted">
          <Camera className="mb-3 h-12 w-12 opacity-40" />
          <p className="text-sm">아직 사진이 없습니다</p>
        </div>
      )}

      {/* Photo grid */}
      {!loading && photos.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {photos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setLightboxPhoto(photo)}
                className="group relative aspect-square overflow-hidden rounded-lg bg-t-subtle focus:outline-none focus:ring-2 focus:ring-sky-blue"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    photo.imageUrl ||
                    `/api/images/${encodeURIComponent(photo.imageKey)}`
                  }
                  alt={photo.caption ?? "사진"}
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  loading="lazy"
                />

                {/* Hover overlay */}
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/60 via-transparent to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  {photo.user && (
                    <p className="text-xs font-medium text-white truncate">
                      {photo.user.displayName}
                    </p>
                  )}
                  {photo.course && (
                    <p className="text-[10px] text-white/80 truncate">
                      {photo.course.name}
                    </p>
                  )}
                  <span className="mt-0.5 inline-block self-start rounded bg-white/20 px-1 py-0.5 text-[9px] text-white">
                    {TYPE_LABELS[photo.type] ?? photo.type}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="rounded-lg border border-t-border px-6 py-2 text-sm text-t-text hover:bg-t-hover disabled:opacity-50 transition-colors"
              >
                {loadingMore ? "불러오는 중..." : "더 보기"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
        <PhotoLightbox
          imageUrl={lightboxPhoto.imageUrl}
          imageKey={lightboxPhoto.imageKey}
          user={lightboxPhoto.user}
          course={lightboxPhoto.course}
          caption={lightboxPhoto.caption}
          createdAt={lightboxPhoto.createdAt}
          onClose={() => setLightboxPhoto(null)}
        />
      )}
    </div>
  );
}
