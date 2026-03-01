"use client";

import { useState, useEffect } from "react";
import { PhotoLightbox } from "@/components/community/photo-lightbox";

interface ReviewPhotoData {
  id: string;
  reviewId: string;
  imageKey: string;
  imageUrl: string;
  caption: string | null;
  sortOrder: number;
  user: { id: string; displayName: string; avatarKey: string | null };
}

interface ReviewPhotosDisplayProps {
  reviewId: string;
}

export function ReviewPhotosDisplay({ reviewId }: ReviewPhotosDisplayProps) {
  const [photos, setPhotos] = useState<ReviewPhotoData[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/reviews/${reviewId}/photos`)
      .then((r) => r.json())
      .then((data: ReviewPhotoData[]) => {
        if (Array.isArray(data)) setPhotos(data);
      })
      .catch(() => {});
  }, [reviewId]);

  if (photos.length === 0) return null;

  const activePhoto = lightboxIndex !== null ? photos[lightboxIndex] : null;

  return (
    <>
      <div className="mt-1.5 flex gap-1.5 overflow-x-auto scrollbar-none">
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setLightboxIndex(index)}
            className="shrink-0 overflow-hidden rounded border border-t-border hover:border-sky-blue transition-colors focus:outline-none focus:ring-1 focus:ring-sky-blue"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                photo.imageUrl ||
                `/api/images/${encodeURIComponent(photo.imageKey)}`
              }
              alt={photo.caption ?? "후기 사진"}
              className="h-14 w-14 object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {activePhoto && (
        <PhotoLightbox
          imageUrl={activePhoto.imageUrl}
          imageKey={activePhoto.imageKey}
          user={activePhoto.user}
          caption={activePhoto.caption}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
