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
import { type ElevationBand, getVisualSlopeColor, SLOPE_HALF_WINDOW } from "@/lib/elevation-render";

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
  const maxPoints = 1500;
  const step = Math.max(1, Math.floor(data.length / maxPoints));
  const sampled = data.filter((_, i) => i % step === 0);
  const [zoomScale, setZoomScale] = useState(1);
  const [hoverPoint, setHoverPoint] = useState<{ distance: number; elevation: number } | null>(null);
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ startDistance: number; startZoom: number; centerX: number } | null>(null);
  const zoomRef = useRef(1);
  const targetZoomRef = useRef(1);
  const zoomAnchorRef = useRef<{ ratio: number; viewportX: number }>({ ratio: 0, viewportX: 0 });
  const zoomAnimRef = useRef<number | null>(null);
  const gradientWindow = 3;
  const minZoom = 1;
  const maxZoom = 6;
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

  // Compute elevation bands client-side from the exact sampled points the chart renders.
  // This guarantees perfect alignment — if the line goes up on screen, it's colored.
  const clientBands = useMemo(() => {
    if (sampled.length < 2) return [];
    const totalDist = sampled[sampled.length - 1].distance - sampled[0].distance;
    if (totalDist <= 0) return [];

    let minElev = Infinity, maxElev = -Infinity;
    for (const p of sampled) {
      if (p.elevation < minElev) minElev = p.elevation;
      if (p.elevation > maxElev) maxElev = p.elevation;
    }
    const elevRange = maxElev - minElev;
    if (elevRange <= 0) return [];

    const bands: ElevationBand[] = [];
    for (let i = 0; i < sampled.length - 1; i++) {
      const lo = Math.max(0, i - SLOPE_HALF_WINDOW);
      const hi = Math.min(sampled.length - 1, i + 1 + SLOPE_HALF_WINDOW);
      const dx = sampled[hi].distance - sampled[lo].distance;
      if (dx <= 0) continue;
      const dy = sampled[hi].elevation - sampled[lo].elevation;
      const visualSlope = (dy / elevRange) / (dx / totalDist);
      const color = getVisualSlopeColor(visualSlope);

      const last = bands[bands.length - 1];
      if (last && last.color === color) {
        last.to = sampled[i + 1].distance;
      } else {
        bands.push({ from: sampled[i].distance, to: sampled[i + 1].distance, color });
      }
    }
    return bands;
  }, [sampled]);

  const slopeGradientStops = useMemo(() => {
    if (clientBands.length === 0 || sampled.length < 2) return [];
    const maxDistance = sampled[sampled.length - 1].distance;
    if (maxDistance <= 0) return [];

    const stops: Array<{ offset: string; color: string }> = [];
    stops.push({ offset: "0%", color: clientBands[0].color });

    for (let i = 0; i < clientBands.length; i++) {
      const cur = clientBands[i];
      const toPct = `${Math.max(0, Math.min(100, (cur.to / maxDistance) * 100))}%`;
      stops.push({ offset: toPct, color: cur.color });
      if (i < clientBands.length - 1) {
        stops.push({ offset: toPct, color: clientBands[i + 1].color });
      }
    }
    stops.push({ offset: "100%", color: clientBands[clientBands.length - 1].color });
    return stops;
  }, [clientBands, sampled]);

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

  const animateZoom = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const current = zoomRef.current;
    const target = targetZoomRef.current;
    const diff = target - current;
    const nextZoom = Math.abs(diff) < 0.002 ? target : current + diff * 0.22;

    zoomRef.current = nextZoom;
    setZoomScale(nextZoom);

    const targetScrollLeft =
      zoomAnchorRef.current.ratio * (scroller.clientWidth * nextZoom) - zoomAnchorRef.current.viewportX;
    scroller.scrollLeft = Math.max(0, targetScrollLeft);

    if (Math.abs(target - nextZoom) < 0.002) {
      zoomAnimRef.current = null;
      return;
    }
    zoomAnimRef.current = requestAnimationFrame(animateZoom);
  }, []);

  const setZoomTarget = useCallback(
    (anchorClientX: number, requestedZoom: number) => {
      const scroller = scrollRef.current;
      if (!scroller) return;

      const nextTarget = Math.max(minZoom, Math.min(maxZoom, requestedZoom));
      const rect = scroller.getBoundingClientRect();
      const viewportX = anchorClientX - rect.left;
      const contentX = scroller.scrollLeft + viewportX;
      const baseWidth = scroller.clientWidth * zoomRef.current;
      if (baseWidth <= 0) return;

      zoomAnchorRef.current = {
        ratio: contentX / baseWidth,
        viewportX,
      };
      targetZoomRef.current = nextTarget;

      if (zoomAnimRef.current == null) {
        zoomAnimRef.current = requestAnimationFrame(animateZoom);
      }
    },
    [animateZoom]
  );

  const applyHorizontalZoom = useCallback(
    (anchorClientX: number, factor: number) => {
      if (factor <= 0) return;
      const nextTarget = targetZoomRef.current * factor;
      setZoomTarget(anchorClientX, nextTarget);
    },
    [setZoomTarget]
  );

  const getPinchDistance = (t1: Touch, t2: Touch) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (Math.abs(e.deltaY) < 0.01) return;
      // Standard wheel/pinch direction: deltaY < 0 zooms in, deltaY > 0 zooms out.
      const factor = Math.max(0.85, Math.min(1.18, Math.exp(-e.deltaY * 0.002)));
      applyHorizontalZoom(e.clientX, factor);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const startDistance = getPinchDistance(e.touches[0], e.touches[1]);
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      pinchRef.current = { startDistance, startZoom: targetZoomRef.current, centerX };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinchRef.current || e.touches.length !== 2) return;
      e.preventDefault();

      const currentDistance = getPinchDistance(e.touches[0], e.touches[1]);
      if (currentDistance <= 0 || pinchRef.current.startDistance <= 0) return;

      const absoluteFactor = currentDistance / pinchRef.current.startDistance;
      const targetZoom = Math.max(minZoom, Math.min(maxZoom, pinchRef.current.startZoom * absoluteFactor));
      const relFactor = targetZoom / targetZoomRef.current;
      applyHorizontalZoom(pinchRef.current.centerX, relFactor);
    };

    const onTouchEnd = () => {
      pinchRef.current = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [applyHorizontalZoom]);

  useEffect(() => {
    return () => {
      if (zoomAnimRef.current != null) {
        cancelAnimationFrame(zoomAnimRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={chartRef}
      className={`${compact ? "h-36" : "h-48"} relative w-full touch-none`}
    >
      <div ref={scrollRef} className="h-full w-full overflow-x-auto overflow-y-hidden scrollbar-hidden">
        <div className="relative" style={{ width: `${zoomScale * 100}%`, height: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={sampled}
              margin={{ top: 4, right: 4, bottom: 0, left: 2 }}
              onDoubleClick={() => {
                const scroller = scrollRef.current;
                if (!scroller) return;
                const rect = scroller.getBoundingClientRect();
                setZoomTarget(rect.left + scroller.clientWidth / 2, 1);
              }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
          <defs>
            {slopeGradientStops.length > 0 && (
              <linearGradient id="elevBandsGrad" x1="0" y1="0" x2="1" y2="0">
                {slopeGradientStops.map((s, i) => (
                  <stop key={`${s.offset}-${i}`} offset={s.offset} stopColor={s.color} stopOpacity={1} />
                ))}
              </linearGradient>
            )}
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
              stroke="#e53935"
              fill={slopeGradientStops.length > 0 ? "url(#elevBandsGrad)" : "transparent"}
              fillOpacity={slopeGradientStops.length > 0 ? 1 : 0}
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
                className="absolute bottom-0 top-0 border-l border-dashed border-[#e53935]"
                style={{ left: `${hoverCoord.x}px` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
