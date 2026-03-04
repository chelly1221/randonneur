"use client";

import { X, ExternalLink } from "lucide-react";

interface CheckpointPopupProps {
  name: string;
  index: number;
  lngLat: [number, number];
  imageKey?: string | null;
  onClose: () => void;
}

export function CheckpointPopup({ name, index, lngLat, imageKey, onClose }: CheckpointPopupProps) {
  const [lng, lat] = lngLat;
  const streetViewUrl = `https://www.google.com/maps?layer=c&cbll=${lat},${lng}&cbp=12,0,,0,0&output=svembed`;
  const mapUrl = `https://maps.google.com/maps?q=${lat},${lng}&z=16&t=k&output=embed`;
  const gmapsLink = `https://www.google.com/maps/@${lat},${lng},17z/data=!3m1!1e3`;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30">
      <div className="relative flex flex-col w-[90%] max-w-lg h-[80%] max-h-[500px] rounded-xl bg-t-surface shadow-2xl border border-t-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-t-border bg-t-surface shrink-0">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-400 text-[10px] font-bold text-gray-900 border border-gray-900">
              {index + 1}
            </span>
            <span className="text-sm font-semibold truncate">{name}</span>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={gmapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded hover:bg-t-hover text-t-muted"
              title="Google Maps에서 열기"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <button onClick={onClose} className="p-1 rounded hover:bg-t-hover text-t-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Photo or Street View */}
        <div className="flex-1 min-h-0">
          {imageKey ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/api/images/${imageKey}`}
              alt={name}
              className="h-full w-full object-contain bg-black"
            />
          ) : (
            <iframe
              src={streetViewUrl}
              className="h-full w-full border-0"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          )}
        </div>

        {/* Map */}
        <div className="h-[35%] shrink-0 border-t border-t-border">
          <iframe
            src={mapUrl}
            className="h-full w-full border-0"
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </div>
  );
}
