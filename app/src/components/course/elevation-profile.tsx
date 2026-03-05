"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useTheme } from "@/components/theme-provider";

interface Checkpoint {
  id: string;
  name: string;
  distanceKm: number;
  imageKey?: string | null;
}

interface ElevationProfileProps {
  data: { distance: number; elevation: number }[];
  checkpoints?: Checkpoint[];
  compact?: boolean;
  onHover?: (distanceKm: number | null) => void;
  onCheckpointClick?: (checkpoint: Checkpoint, index: number) => void;
  currentDistanceKm?: number | null;
}

export function ElevationProfile({
  data,
  checkpoints,
  compact,
  onHover,
  onCheckpointClick,
  currentDistanceKm,
}: ElevationProfileProps) {
  const { theme } = useTheme();
  const [themeColor, setThemeColor] = useState("#1a237e");

  useEffect(() => {
    const color = getComputedStyle(document.documentElement).getPropertyValue("--t-primary").trim();
    if (color) setThemeColor(color);
  }, [theme]);

  const maxPoints = 1500;
  const step = Math.max(1, Math.floor(data.length / maxPoints));
  const sampled = data.filter((_, i) => i % step === 0);
  const [, setHoverPoint] = useState<{ distance: number; elevation: number } | null>(null);
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [chartHeight, setChartHeight] = useState(0);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setChartWidth(width);
      setChartHeight(height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gradientWindow = 3;
  const maxElevation = useMemo(
    () => (sampled.length > 0 ? Math.ceil(Math.max(...sampled.map((p) => p.elevation))) : 0),
    [sampled]
  );
  const checkpointHeadroom = useMemo(
    () => (checkpoints && checkpoints.length > 0 ? maxElevation * 0.25 : 0),
    [checkpoints, maxElevation]
  );
  const checkpointBadgeY = maxElevation + checkpointHeadroom * 0.6;

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
            <linearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={themeColor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={themeColor} stopOpacity={0.08} />
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
            domain={[0, maxElevation > 0 ? maxElevation + checkpointHeadroom : "auto"]}
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
              type="linear"
              dataKey="elevation"
              stroke={themeColor}
              fill="url(#elevFill)"
              fillOpacity={1}
              strokeWidth={1.5}
              isAnimationActive={false}
              activeDot={(props: { cx?: number; cy?: number }) => {
                if (typeof props.cx !== "number" || typeof props.cy !== "number") return <g />;
                return (
                  <g>
                    <line
                      x1={0}
                      x2={10000}
                      y1={props.cy}
                      y2={props.cy}
                      stroke={themeColor}
                      strokeWidth={1.2}
                      strokeDasharray="3 3"
                      opacity={0.9}
                    />
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={3.5}
                      fill={themeColor}
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
              return [
                <ReferenceLine
                  key={`${cp.id}-link`}
                  segment={[
                    { x: cp.distanceKm, y: checkpointBadgeY },
                    { x: cp.distanceKm, y: elevation },
                  ]}
                  stroke="#f59e0b"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  strokeOpacity={0.9}
                />,
                <ReferenceDot
                  key={`${cp.id}-point`}
                  x={cp.distanceKm}
                  y={elevation}
                  r={3}
                  fill="#facc15"
                  stroke="#111111"
                  strokeWidth={1}
                  isFront
                />,
                <ReferenceDot
                  key={`${cp.id}-badge`}
                  x={cp.distanceKm}
                  y={checkpointBadgeY}
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
                />,
              ];
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
                className="absolute bottom-0 top-0 border-l border-dashed"
                style={{ borderColor: themeColor, left: `${hoverCoord.x}px` }}
              />
            </div>
          )}
          {/* Clickable CP overlay buttons (HTML, above Recharts mouse-tracking layer) */}
          {onCheckpointClick && checkpoints && checkpoints.length > 0 && chartWidth > 0 && (() => {
            const yAxisW = compact ? 38 : 48;
            const xAxisH = compact ? 16 : 20;
            const mTop = 4, mRight = 4, mLeft = 2;
            const plotLeft = mLeft + yAxisW;
            const plotWidth = chartWidth - plotLeft - mRight;
            const plotHeight = chartHeight - mTop - xAxisH;
            const maxDist = sampled.length > 0 ? sampled[sampled.length - 1].distance : 1;
            const yDomainMax = maxElevation + checkpointHeadroom;
            if (plotWidth <= 0 || plotHeight <= 0) return null;
            return (
              <div className="pointer-events-none absolute inset-0">
                {checkpoints.map((cp, i) => {
                  const px = plotLeft + (cp.distanceKm / maxDist) * plotWidth;
                  const py = mTop + (1 - checkpointBadgeY / yDomainMax) * plotHeight;
                  return (
                    <button
                      key={cp.id}
                      type="button"
                      className="pointer-events-auto absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full"
                      style={{ left: px, top: py }}
                      onClick={(e) => { e.stopPropagation(); onCheckpointClick(cp, i); }}
                      title={cp.name}
                    />
                  );
                })}
              </div>
            );
          })()}
    </div>
  );
}
