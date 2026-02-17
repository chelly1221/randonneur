"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
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
  const [hoverPoint, setHoverPoint] = useState<{ distance: number; elevation: number } | null>(null);
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const gradientWindow = 3;

  const xTicks = useMemo(() => {
    if (sampled.length === 0) return [];
    const maxDistance = sampled[sampled.length - 1].distance;
    const stepKm = Math.max(20, Math.ceil(maxDistance / 10 / 20) * 20);
    const ticks: number[] = [];
    for (let t = 0; t <= maxDistance; t += stepKm) {
      ticks.push(t);
    }
    if (ticks[ticks.length - 1] < maxDistance) {
      ticks.push(Math.ceil(maxDistance));
    }
    return ticks;
  }, [sampled]);

  const getSmoothedGradient = useCallback(
    (idx: number): number | null => {
      if (idx < 0 || idx >= sampled.length) return null;
      const start = Math.max(0, idx - gradientWindow);
      const end = Math.min(sampled.length - 1, idx + gradientWindow);
      if (end <= start) return null;

      const from = sampled[start];
      const to = sampled[end];
      const distDiffKm = to.distance - from.distance;
      if (distDiffKm <= 0) return null;

      return ((to.elevation - from.elevation) / (distDiffKm * 1000)) * 100;
    },
    [sampled]
  );

  const handleMouseMove = useCallback(
    (state: {
      activePayload?: Array<{ payload: { distance: number; elevation: number } }>;
      activeCoordinate?: { x: number; y: number };
    }) => {
      if (state?.activePayload?.[0]) {
        const point = state.activePayload[0].payload;
        setHoverPoint({ distance: point.distance, elevation: point.elevation });
        if (
          typeof state.activeCoordinate?.x === "number" &&
          typeof state.activeCoordinate?.y === "number"
        ) {
          setHoverCoord({ x: state.activeCoordinate.x, y: state.activeCoordinate.y });
        }
        const dist = point.distance;
        onHover?.(dist);
      }
    },
    [onHover]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverPoint(null);
    setHoverCoord(null);
    onHover?.(null);
  }, [onHover]);

  const getElevationAtDistance = useCallback(
    (distanceKm: number): number | null => {
      if (sampled.length === 0) return null;
      if (distanceKm <= sampled[0].distance) return sampled[0].elevation;

      for (let i = 1; i < sampled.length; i++) {
        const prev = sampled[i - 1];
        const curr = sampled[i];
        if (distanceKm <= curr.distance) {
          const span = curr.distance - prev.distance;
          if (span <= 0) return curr.elevation;
          const t = (distanceKm - prev.distance) / span;
          return prev.elevation + (curr.elevation - prev.elevation) * t;
        }
      }

      return sampled[sampled.length - 1].elevation;
    },
    [sampled]
  );

  return (
    <div
      ref={chartRef}
      className={`${compact ? "h-36" : "h-48"} relative w-full`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={sampled}
          margin={{ top: 4, right: 4, bottom: 0, left: 2 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff9800" stopOpacity={0.58} />
              <stop offset="70%" stopColor="#ff9800" stopOpacity={0.34} />
              <stop offset="100%" stopColor="#ff9800" stopOpacity={0.12} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="distance"
            type="number"
            domain={[0, "dataMax"]}
            ticks={xTicks}
            tickFormatter={(v) => `${Math.round(v)}`}
            allowDecimals={false}
            fontSize={compact ? 10 : 11}
            tickLine={false}
            axisLine={false}
            height={compact ? 16 : 20}
          />
          <YAxis
            tickFormatter={(v) => `${v}`}
            fontSize={compact ? 10 : 11}
            tickLine={false}
            axisLine={false}
            domain={[0, "auto"]}
            width={compact ? 38 : 48}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const point = payload[0].payload as { distance: number; elevation: number };
              const idx = sampled.findIndex((p) => p.distance === point.distance);
              const gradient = getSmoothedGradient(idx);
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
            activeDot={(props: { cx?: number; cy?: number }) => {
              if (typeof props.cx !== "number" || typeof props.cy !== "number") return null;
              return (
                <g>
                  <line
                    x1={0}
                    x2={10000}
                    y1={props.cy}
                    y2={props.cy}
                    stroke="#e53935"
                    strokeWidth={1.2}
                    strokeDasharray="3 3"
                    opacity={0.9}
                  />
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={3.5}
                    fill="#e53935"
                    stroke="#ffffff"
                    strokeWidth={1.2}
                  />
                </g>
              );
            }}
          />

          {/* Checkpoint badges */}
          {checkpoints?.map((cp, i) => {
            const elevation = getElevationAtDistance(cp.distanceKm);
            if (elevation == null) return null;
            return (
              <ReferenceDot
                key={cp.id}
                x={cp.distanceKm}
                y={elevation}
                r={8}
                fill="#facc15"
                stroke="#111111"
                strokeWidth={1.5}
                isFront
                label={{
                  value: String(i + 1),
                  position: "center",
                  fill: "#111111",
                  fontSize: 9,
                  fontWeight: 700,
                }}
              />
            );
          })}

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
      {hoverCoord && (
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute bottom-0 top-0 border-l border-dashed border-[#e53935]"
            style={{ left: `${hoverCoord.x}px` }}
          />
        </div>
      )}
    </div>
  );
}
