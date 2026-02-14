"use client";

import { useCallback, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface Checkpoint {
  id: string;
  name: string;
  distanceKm: number;
}

interface ElevationProfileProps {
  data: { distance: number; elevation: number }[];
  checkpoints?: Checkpoint[];
  compact?: boolean;
  onHover?: (distanceKm: number | null) => void;
  currentDistanceKm?: number | null;
}

export function ElevationProfile({
  data,
  checkpoints,
  compact,
  onHover,
  currentDistanceKm,
}: ElevationProfileProps) {
  const maxPoints = 500;
  const step = Math.max(1, Math.floor(data.length / maxPoints));
  const sampled = data.filter((_, i) => i % step === 0);
  const [hoverDistance, setHoverDistance] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (state: { activePayload?: Array<{ payload: { distance: number } }> }) => {
      if (state?.activePayload?.[0]) {
        const dist = state.activePayload[0].payload.distance;
        setHoverDistance(dist);
        onHover?.(dist);
      }
    },
    [onHover]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverDistance(null);
    onHover?.(null);
  }, [onHover]);

  return (
    <div ref={chartRef} className={compact ? "h-36 w-full" : "h-48 w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={sampled}
          margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ff9800" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ff9800" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="distance"
            tickFormatter={(v) => `${Math.round(v)}`}
            fontSize={compact ? 10 : 11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${v}`}
            fontSize={compact ? 10 : 11}
            tickLine={false}
            axisLine={false}
            width={compact ? 35 : 50}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const point = payload[0].payload as { distance: number; elevation: number };
              const idx = sampled.findIndex((p) => p.distance === point.distance);
              let gradient: number | null = null;
              if (idx > 0) {
                const prev = sampled[idx - 1];
                const distDiff = point.distance - prev.distance;
                if (distDiff > 0) {
                  gradient = ((point.elevation - prev.elevation) / (distDiff * 1000)) * 100;
                }
              }
              return (
                <div className="rounded bg-t-surface px-2.5 py-1.5 text-xs shadow-lg border border-t-border">
                  <div className="font-medium">{point.distance.toFixed(1)} km</div>
                  <div className="text-t-sub">고도: {Math.round(point.elevation)} m</div>
                  {gradient !== null && (
                    <div className="text-t-sub">
                      경사도: {gradient >= 0 ? "+" : ""}{gradient.toFixed(1)}%
                    </div>
                  )}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="elevation"
            stroke="#e53935"
            fill="url(#elevGrad)"
            strokeWidth={1.5}
          />

          {/* Hover crosshair */}
          {hoverDistance !== null && (
            <ReferenceLine
              x={hoverDistance}
              stroke="#e53935"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          )}

          {/* Checkpoint lines */}
          {checkpoints?.map((cp, i) => (
            <ReferenceLine
              key={cp.id}
              x={cp.distanceKm}
              stroke="#4fc3f7"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: String(i + 1),
                position: "top",
                fontSize: 9,
                fill: "#4fc3f7",
              }}
            />
          ))}

          {/* Geolocation position */}
          {currentDistanceKm != null && (
            <ReferenceLine
              x={currentDistanceKm}
              stroke="#22c55e"
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
