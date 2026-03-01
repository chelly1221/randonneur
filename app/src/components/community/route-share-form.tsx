"use client";

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { REGIONS } from "@/types";
import { Upload, X, FileText, Route, TrendingUp, ChevronDown } from "lucide-react";

interface RouteShareFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function RouteShareForm({ onSuccess, onCancel }: RouteShareFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState("");
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [gpxInfo, setGpxInfo] = useState<{
    distance: number | null;
    elevation: number | null;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".gpx")) {
      setError("GPX 파일만 업로드 가능합니다");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("GPX 파일은 10MB 이하만 가능합니다");
      return;
    }

    setGpxFile(file);
    setError(null);

    // Try to extract distance/elevation client-side
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;

      try {
        // Simple client-side distance extraction from trackpoints
        const points: { lat: number; lon: number; ele: number }[] = [];
        const trkptRegex = /<trkpt[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/trkpt>/gi;
        let match;
        while ((match = trkptRegex.exec(text)) !== null) {
          const lat = parseFloat(match[1]);
          const lon = parseFloat(match[2]);
          const eleMatch = match[3].match(/<ele>([^<]+)<\/ele>/);
          const ele = eleMatch ? parseFloat(eleMatch[1]) : 0;
          if (!isNaN(lat) && !isNaN(lon)) {
            points.push({ lat, lon, ele: isNaN(ele) ? 0 : ele });
          }
        }

        if (points.length > 1) {
          let dist = 0;
          let gain = 0;
          for (let i = 1; i < points.length; i++) {
            const p = points[i - 1];
            const c = points[i];
            const R = 6371;
            const dLat = ((c.lat - p.lat) * Math.PI) / 180;
            const dLon = ((c.lon - p.lon) * Math.PI) / 180;
            const a =
              Math.sin(dLat / 2) ** 2 +
              Math.cos((p.lat * Math.PI) / 180) *
                Math.cos((c.lat * Math.PI) / 180) *
                Math.sin(dLon / 2) ** 2;
            dist += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const diff = c.ele - p.ele;
            if (diff > 0) gain += diff;
          }
          setGpxInfo({
            distance: Math.round(dist * 10) / 10,
            elevation: Math.round(gain),
          });
        }
      } catch {
        // Client-side parsing is best-effort; server will parse authoritatively
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("제목을 입력해주세요");
      return;
    }
    if (!gpxFile) {
      setError("GPX 파일을 첨부해주세요");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      if (description.trim()) formData.append("description", description.trim());
      if (region) formData.append("region", region);
      formData.append("gpxFile", gpxFile);

      const res = await fetch("/api/shared-routes", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "업로드에 실패했습니다");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드에 실패했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="py-4 px-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-t-text">
              제목 <span className="text-sky-red">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="루트 이름을 입력하세요"
              maxLength={100}
              className="w-full rounded-lg border border-t-border bg-t-surface px-3 py-1.5 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-t-text">
              설명
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="루트에 대한 설명을 입력하세요 (선택사항)"
              rows={2}
              maxLength={500}
              className="w-full resize-none rounded-lg border border-t-border bg-t-surface px-3 py-1.5 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none"
            />
          </div>

          {/* Region */}
          <div>
            <label className="mb-1 block text-xs font-medium text-t-text">
              지역
            </label>
            <div className="relative">
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full appearance-none rounded-lg border border-t-border bg-t-surface py-1.5 pl-3 pr-8 text-sm text-t-text focus:border-sky-blue focus:outline-none"
              >
                <option value="">선택하세요</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-t-muted" />
            </div>
          </div>

          {/* GPX File */}
          <div>
            <label className="mb-1 block text-xs font-medium text-t-text">
              GPX 파일 <span className="text-sky-red">*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".gpx"
              onChange={handleFileChange}
              className="hidden"
            />
            {gpxFile ? (
              <div className="flex items-center gap-2 rounded-lg border border-t-border bg-t-faint px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-sky-blue shrink-0" />
                <span className="flex-1 truncate text-t-text">
                  {gpxFile.name}
                </span>
                {gpxInfo && (
                  <div className="flex items-center gap-2 text-[11px] text-t-muted shrink-0">
                    {gpxInfo.distance != null && gpxInfo.distance > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Route className="h-3 w-3" />
                        {gpxInfo.distance} km
                      </span>
                    )}
                    {gpxInfo.elevation != null && gpxInfo.elevation > 0 && (
                      <span className="flex items-center gap-0.5">
                        <TrendingUp className="h-3 w-3" />
                        {gpxInfo.elevation} m
                      </span>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setGpxFile(null);
                    setGpxInfo(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-t-muted hover:text-sky-red"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-t-border py-4 text-sm text-t-muted transition-colors hover:border-sky-blue hover:text-sky-blue"
              >
                <Upload className="h-4 w-4" />
                GPX 파일을 선택하세요
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-sky-red">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="rounded-lg border border-t-border px-3 py-1.5 text-sm text-t-muted transition-colors hover:bg-t-hover hover:text-t-text disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !gpxFile}
              className="rounded-lg bg-sky-darkblue px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-darkblue/90 disabled:opacity-50"
            >
              {submitting ? "업로드 중..." : "공유하기"}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
