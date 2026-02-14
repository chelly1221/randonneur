"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { REGIONS, CATEGORIES } from "@/types";
import { Loader2 } from "lucide-react";

interface CourseFormData {
  id?: string;
  name: string;
  distanceKm: number;
  elevationM: number;
  estimatedTime: string;
  startLocation: string;
  endLocation: string;
  region: string;
  category: string[];
  tags: string[];
  description: string;
  designer: string;
  gpxFileKey?: string | null;
  archived?: boolean;
}

interface CourseFormProps {
  initialData?: CourseFormData;
  mode: "create" | "edit";
}

export function CourseForm({ initialData, mode }: CourseFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [gpxParsed, setGpxParsed] = useState<{
    distance: number;
    elevation: number;
    geojson: unknown;
  } | null>(null);

  const [form, setForm] = useState<CourseFormData>(
    initialData ?? {
      name: "",
      distanceKm: 0,
      elevationM: 0,
      estimatedTime: "",
      startLocation: "",
      endLocation: "",
      region: "",
      category: [],
      tags: [],
      description: "",
      designer: "",
      archived: false,
    }
  );

  function setField<K extends keyof CourseFormData>(
    key: K,
    value: CourseFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleGpxUpload(file: File) {
    setGpxFile(file);
    try {
      setGpxParsed(null);
    } catch {
      // Parse error
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      let gpxFileKey = form.gpxFileKey;
      let geojsonData = null;

      if (gpxFile) {
        const uploadForm = new FormData();
        uploadForm.set("file", gpxFile);
        uploadForm.set("courseId", form.id ?? "temp");

        const uploadRes = await fetch("/api/admin/upload-gpx", {
          method: "POST",
          body: uploadForm,
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          gpxFileKey = uploadData.key;
          if (uploadData.distance) setField("distanceKm", uploadData.distance);
          if (uploadData.elevation)
            setField("elevationM", uploadData.elevation);
          if (uploadData.geojson) geojsonData = uploadData.geojson;
        }
      }

      const body = {
        ...form,
        gpxFileKey,
        ...(geojsonData ? { geojson: geojsonData } : {}),
      };

      const url =
        mode === "create" ? "/api/courses" : `/api/courses/${form.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.push("/admin/courses");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-t-text mb-1">
          코스 이름 *
        </label>
        <Input
          value={form.name}
          onChange={(e) => setField("name", e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-t-text mb-1">
            거리 (km) *
          </label>
          <Input
            type="number"
            step="0.1"
            value={form.distanceKm || ""}
            onChange={(e) => setField("distanceKm", parseFloat(e.target.value) || 0)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-t-text mb-1">
            획득 고도 (m) *
          </label>
          <Input
            type="number"
            value={form.elevationM || ""}
            onChange={(e) => setField("elevationM", parseInt(e.target.value) || 0)}
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-t-text mb-1">
          예상 시간
        </label>
        <Input
          value={form.estimatedTime}
          onChange={(e) => setField("estimatedTime", e.target.value)}
          placeholder="예: 12시간"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-t-text mb-1">
            출발지 *
          </label>
          <Input
            value={form.startLocation}
            onChange={(e) => setField("startLocation", e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-t-text mb-1">
            도착지 *
          </label>
          <Input
            value={form.endLocation}
            onChange={(e) => setField("endLocation", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-t-text mb-1">
            지역 *
          </label>
          <Select
            value={form.region}
            onChange={(e) => setField("region", e.target.value)}
            required
          >
            <option value="">선택</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium text-t-text mb-1">
            시리즈
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <label key={c.value} className="flex items-center gap-1.5 text-sm text-t-text">
                <input
                  type="checkbox"
                  checked={form.category.includes(c.value)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setField("category", [...form.category, c.value]);
                    } else {
                      setField("category", form.category.filter((v) => v !== c.value));
                    }
                  }}
                  className="rounded accent-t-primary"
                />
                {c.emoji} {c.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-t-text mb-1">
          태그 (쉼표로 구분)
        </label>
        <Input
          value={form.tags.join(", ")}
          onChange={(e) =>
            setField(
              "tags",
              e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            )
          }
          placeholder="예: 벚꽃, 강변, 야간"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-t-text mb-1">
          설명
        </label>
        <textarea
          className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text focus:border-t-focus focus:outline-none focus:ring-1 focus:ring-t-focus"
          rows={3}
          value={form.description}
          onChange={(e) => setField("description", e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-t-text mb-1">
          설계자
        </label>
        <Input
          value={form.designer}
          onChange={(e) => setField("designer", e.target.value)}
          placeholder="코스 설계자"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="archived"
          checked={form.archived ?? false}
          onChange={(e) => setField("archived", e.target.checked)}
          className="rounded accent-t-primary"
        />
        <label htmlFor="archived" className="text-sm font-medium text-t-text">
          보관 (비공개)
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-t-text mb-1">
          GPX 파일
        </label>
        <Input
          type="file"
          accept=".gpx"
          onChange={(e) => {
            if (e.target.files?.[0]) handleGpxUpload(e.target.files[0]);
          }}
        />
        {form.gpxFileKey && !gpxFile && (
          <p className="mt-1 text-xs text-t-muted">
            기존 파일: {form.gpxFileKey}
          </p>
        )}
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {mode === "create" ? "코스 등록" : "코스 수정"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          취소
        </Button>
      </div>
    </form>
  );
}
