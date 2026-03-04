"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera } from "lucide-react";

interface GalleryItem {
  id: string;
  imageKey: string;
  imageUrl: string;
  type: "review" | "journal" | "checkpoint";
  user: { id: string; displayName: string; avatarKey: string | null } | null;
  course: { id: string; name: string; region: string | null } | null;
  caption: string | null;
  createdAt: string;
}

export default function GalleryCarousel() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gallery?limit=12")
      .then((res) => res.json())
      .then((json) => {
        if (Array.isArray(json)) setItems(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-3">
      {/* Scrollbar-hiding styles */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-t-text flex items-center gap-2">
          <Camera className="w-4 h-4 text-sky-blue" />
          커뮤니티 갤러리
        </h3>
        <Link
          href="/community/gallery"
          className="text-sm text-sky-blue hover:text-sky-blue/80 font-medium transition-colors"
        >
          전체 보기 →
        </Link>
      </div>

      {/* Carousel */}
      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-40 h-28 animate-pulse bg-t-subtle rounded-lg shrink-0"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-t-border bg-t-surface p-4 text-t-muted text-sm">
          사진이 없습니다
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-3 snap-x snap-mandatory">
            {items.map((item) => (
              <div
                key={item.id}
                className="w-40 h-28 shrink-0 rounded-lg overflow-hidden snap-center relative group"
              >
                <img
                  src={item.imageUrl}
                  alt={item.caption ?? "갤러리 이미지"}
                  className="object-cover w-full h-full"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                  {item.user && (
                    <span className="text-white text-[10px] truncate">
                      {item.user.displayName}
                    </span>
                  )}
                  {item.course && (
                    <span className="text-white/80 text-[10px] truncate">
                      {item.course.name}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
