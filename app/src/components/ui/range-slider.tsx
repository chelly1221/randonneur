"use client";

import { useCallback, useRef, useState, useEffect } from "react";

interface RangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  step?: number;
  formatLabel?: (value: number) => string;
  className?: string;
}

export function RangeSlider({
  min,
  max,
  value,
  onChange,
  step = 1,
  formatLabel = (v) => String(v),
  className,
}: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"min" | "max" | null>(null);

  const getPercent = useCallback(
    (v: number) => ((v - min) / (max - min)) * 100,
    [min, max]
  );

  const getValueFromX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return min;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + pct * (max - min);
      return Math.round(raw / step) * step;
    },
    [min, max, step]
  );

  const handlePointerDown = useCallback(
    (thumb: "min" | "max") => (e: React.PointerEvent) => {
      e.preventDefault();
      setDragging(thumb);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const v = getValueFromX(e.clientX);
      if (dragging === "min") {
        onChange([Math.min(v, value[1] - step), value[1]]);
      } else {
        onChange([value[0], Math.max(v, value[0] + step)]);
      }
    },
    [dragging, getValueFromX, onChange, value, step]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Touch support
  useEffect(() => {
    if (!dragging) return;
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        const v = getValueFromX(e.touches[0].clientX);
        if (dragging === "min") {
          onChange([Math.min(v, value[1] - step), value[1]]);
        } else {
          onChange([value[0], Math.max(v, value[0] + step)]);
        }
      }
    };
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => document.removeEventListener("touchmove", handleTouchMove);
  }, [dragging, getValueFromX, onChange, value, step]);

  const leftPct = getPercent(value[0]);
  const rightPct = getPercent(value[1]);

  return (
    <div className={className}>
      <div className="flex items-center justify-between text-xs text-t-muted mb-1">
        <span>{formatLabel(value[0])}</span>
        <span>{formatLabel(value[1])}</span>
      </div>
      <div
        ref={trackRef}
        className="relative h-5 w-full touch-none select-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Track background */}
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-t-border" />

        {/* Active range */}
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-sky-orange"
          style={{
            left: `${leftPct}%`,
            width: `${rightPct - leftPct}%`,
          }}
        />

        {/* Min thumb */}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-sky-orange bg-white shadow-sm active:cursor-grabbing"
          style={{ left: `${leftPct}%` }}
          onPointerDown={handlePointerDown("min")}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value[0]}
          tabIndex={0}
        />

        {/* Max thumb */}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-sky-orange bg-white shadow-sm active:cursor-grabbing"
          style={{ left: `${rightPct}%` }}
          onPointerDown={handlePointerDown("max")}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value[1]}
          tabIndex={0}
        />
      </div>
    </div>
  );
}
