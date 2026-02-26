"use client";

import { useState, useEffect } from "react";
import { Activity, TrendingUp, TrendingDown, Clock, Zap, Mountain } from "lucide-react";

interface GpxStats {
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  maxElevationM: number;
  minElevationM: number;
  durationMs: number | null;
  avgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  elevationProfile: number[];
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseGpx(text: string): GpxStats | null {
  try {
    const doc = new DOMParser().parseFromString(text, "text/xml");
    const pts = Array.from(doc.querySelectorAll("trkpt,rtept,wpt"));
    if (pts.length < 2) return null;

    let distanceM = 0;
    let gainM = 0;
    let lossM = 0;
    let maxElev = -Infinity;
    let minElev = Infinity;
    const elevations: number[] = [];
    const speeds: number[] = [];
    let prevLat: number | null = null;
    let prevLon: number | null = null;
    let prevElev: number | null = null;
    let prevTime: Date | null = null;
    let firstTime: Date | null = null;
    let lastTime: Date | null = null;

    for (const pt of pts) {
      const lat = parseFloat(pt.getAttribute("lat") ?? "");
      const lon = parseFloat(pt.getAttribute("lon") ?? "");
      if (isNaN(lat) || isNaN(lon)) continue;

      const elevEl = pt.querySelector("ele");
      const timeEl = pt.querySelector("time");
      const elev = elevEl ? parseFloat(elevEl.textContent ?? "") : NaN;
      const time = timeEl ? new Date(timeEl.textContent ?? "") : null;

      if (!isNaN(elev)) {
        if (elev > maxElev) maxElev = elev;
        if (elev < minElev) minElev = elev;
        elevations.push(elev);
        if (prevElev !== null) {
          const diff = elev - prevElev;
          if (diff > 0) gainM += diff;
          else lossM += Math.abs(diff);
        }
        prevElev = elev;
      }

      if (prevLat !== null && prevLon !== null) {
        const segDist = haversineM(prevLat, prevLon, lat, lon);
        distanceM += segDist;
        if (time && prevTime && !isNaN(time.getTime())) {
          const segSec = (time.getTime() - prevTime.getTime()) / 1000;
          if (segSec > 0 && segDist > 0) {
            const spd = (segDist / segSec) * 3.6;
            if (spd < 120) speeds.push(spd);
          }
        }
      }

      if (time && !isNaN(time.getTime())) {
        if (!firstTime) firstTime = time;
        lastTime = time;
        prevTime = time;
      }
      prevLat = lat;
      prevLon = lon;
    }

    const durationMs =
      firstTime && lastTime ? lastTime.getTime() - firstTime.getTime() : null;
    const distanceKm = distanceM / 1000;
    const avgSpeedKmh =
      durationMs && durationMs > 0
        ? Math.round((distanceKm / (durationMs / 3600000)) * 10) / 10
        : null;
    const maxSpeedKmh =
      speeds.length > 0 ? Math.round(Math.max(...speeds) * 10) / 10 : null;

    const step = Math.max(1, Math.ceil(elevations.length / 80));
    const sample = elevations.filter((_, i) => i % step === 0);

    return {
      distanceKm,
      elevationGainM: Math.round(gainM),
      elevationLossM: Math.round(lossM),
      maxElevationM: maxElev === -Infinity ? 0 : Math.round(maxElev),
      minElevationM: minElev === Infinity ? 0 : Math.round(minElev),
      durationMs,
      avgSpeedKmh,
      maxSpeedKmh,
      elevationProfile: sample,
    };
  } catch {
    return null;
  }
}

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function ElevationSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 300;
  const H = 36;

  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const fillPts = `0,${H} ${pts} ${W},${H}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: 36 }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="elev-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4fc3f7" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#4fc3f7" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill="url(#elev-fill)" />
      <polyline
        points={pts}
        fill="none"
        stroke="#4fc3f7"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface GpxStatsPreviewProps {
  file: File | null;
}

export function GpxStatsPreview({ file }: GpxStatsPreviewProps) {
  const [stats, setStats] = useState<GpxStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!file) {
      setStats(null);
      setFailed(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseGpx(e.target?.result as string);
      setStats(result);
      setFailed(!result);
      setLoading(false);
    };
    reader.readAsText(file);
  }, [file]);

  if (!file) return null;

  if (loading) {
    return (
      <div className="rounded-lg border border-t-border bg-t-surface/50 px-3 py-3 text-[11px] text-t-muted animate-pulse">
        GPX 분석 중...
      </div>
    );
  }

  if (failed || !stats) {
    return (
      <div className="rounded-lg border border-sky-red/30 bg-sky-red/5 px-3 py-2 text-[11px] text-sky-red">
        GPX 파싱에 실패했습니다.
      </div>
    );
  }

  const primaryStats = [
    {
      icon: <Activity className="h-4 w-4" />,
      label: "거리",
      value: stats.distanceKm.toFixed(1),
      unit: "km",
      color: "text-sky-blue",
      bg: "bg-sky-blue/10",
    },
    {
      icon: <TrendingUp className="h-4 w-4" />,
      label: "획득고도",
      value: stats.elevationGainM.toLocaleString(),
      unit: "m",
      color: "text-sky-orange",
      bg: "bg-sky-orange/10",
    },
    ...(stats.durationMs
      ? [
          {
            icon: <Clock className="h-4 w-4" />,
            label: "소요시간",
            value: formatDuration(stats.durationMs),
            unit: "",
            color: "text-sky-yellow",
            bg: "bg-sky-yellow/10",
          },
        ]
      : []),
    ...(stats.avgSpeedKmh
      ? [
          {
            icon: <Zap className="h-4 w-4" />,
            label: "평균속도",
            value: String(stats.avgSpeedKmh),
            unit: "km/h",
            color: "text-t-success",
            bg: "bg-sky-blue/10",
          },
        ]
      : []),
  ];

  const cols = primaryStats.length >= 4 ? "grid-cols-4" : primaryStats.length === 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <div className="rounded-lg border border-t-border overflow-hidden bg-gradient-to-br from-sky-darkblue/8 to-transparent">
      {/* File name header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-t-border/60 bg-t-surface/40">
        <span className="text-[10px] font-semibold tracking-wide text-t-muted uppercase">GPX 분석</span>
        <span className="text-[10px] text-sky-blue/80 truncate max-w-[180px]">{file.name}</span>
      </div>

      {/* Primary stats */}
      <div className={`grid ${cols} divide-x divide-t-border/30`}>
        {primaryStats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-0.5 py-3 px-1">
            <div className={`rounded-full p-1.5 mb-0.5 ${s.bg} ${s.color}`}>
              {s.icon}
            </div>
            <div className={`text-lg font-bold tabular-nums leading-none ${s.color}`}>
              {s.value}
            </div>
            <div className="text-[9px] text-t-muted leading-tight text-center">
              {s.unit && <span className="font-medium">{s.unit} </span>}
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Elevation sparkline */}
      {stats.elevationProfile.length > 1 && (
        <div className="px-3 pt-1 pb-0 border-t border-t-border/30">
          <div className="text-[9px] text-t-muted mb-0.5">고도 프로필</div>
          <ElevationSparkline data={stats.elevationProfile} />
        </div>
      )}

      {/* Secondary stats */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 px-3 py-2 border-t border-t-border/30">
        <span className="flex items-center gap-1 text-[10px] text-t-muted">
          <Mountain className="h-3 w-3" />
          최고 {stats.maxElevationM.toLocaleString()}m
        </span>
        <span className="text-[10px] text-t-muted">
          최저 {stats.minElevationM.toLocaleString()}m
        </span>
        <span className="flex items-center gap-1 text-[10px] text-t-muted">
          <TrendingDown className="h-3 w-3" />
          손실 {stats.elevationLossM.toLocaleString()}m
        </span>
        {stats.maxSpeedKmh && (
          <span className="text-[10px] text-t-muted">
            최고속도 {stats.maxSpeedKmh}km/h
          </span>
        )}
      </div>
    </div>
  );
}
