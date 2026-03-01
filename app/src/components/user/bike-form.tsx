"use client";

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Bike, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BikeData } from "./bike-card";

const BIKE_TYPES = [
  { value: "road", label: "로드" },
  { value: "gravel", label: "그래블" },
  { value: "touring", label: "투어링" },
  { value: "mtb", label: "MTB" },
  { value: "minivelo", label: "미니벨로" },
  { value: "other", label: "기타" },
];

interface BikeFormProps {
  bike?: BikeData;
  onSave: () => void;
  onCancel: () => void;
}

export function BikeForm({ bike, onSave, onCancel }: BikeFormProps) {
  const [name, setName] = useState(bike?.name ?? "");
  const [brand, setBrand] = useState(bike?.brand ?? "");
  const [model, setModel] = useState(bike?.model ?? "");
  const [year, setYear] = useState(bike?.year?.toString() ?? "");
  const [type, setType] = useState(bike?.type ?? "");
  const [isDefault, setIsDefault] = useState(bike?.isDefault ?? false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    bike?.imageKey ? `/api/images/${encodeURIComponent(bike.imageKey)}` : null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("사진은 최대 5MB까지 가능합니다.");
      return;
    }

    setPhoto(file);
    setError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotoPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    setPhoto(null);
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setError("자전거 이름을 입력해주세요.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      if (brand.trim()) formData.append("brand", brand.trim());
      if (model.trim()) formData.append("model", model.trim());
      if (year.trim()) formData.append("year", year.trim());
      if (type) formData.append("type", type);
      formData.append("isDefault", String(isDefault));
      if (photo) formData.append("photo", photo);

      const url = bike ? `/api/bikes/${bike.id}` : "/api/bikes";
      const method = bike ? "PUT" : "POST";

      const res = await fetch(url, { method, body: formData });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "저장에 실패했습니다.");
        return;
      }

      onSave();
    } catch {
      setError("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <h2 className="mb-4 text-sm font-semibold text-t-muted uppercase tracking-wide">
          {bike ? "자전거 수정" : "자전거 추가"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Photo */}
          <div>
            <label className="mb-1.5 block text-xs text-t-faint">사진</label>
            <div className="flex items-center gap-3">
              <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-t-subtle">
                {photoPreview ? (
                  <>
                    <img
                      src={photoPreview}
                      alt="미리보기"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={removePhoto}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-sky-red text-white hover:bg-sky-red/80 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-t-faint">
                    <Bike className="h-8 w-8" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-md border border-t-border px-3 py-2 text-xs text-t-muted hover:bg-t-hover transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                사진 선택
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs text-t-faint">
              이름 <span className="text-sky-red">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 나의 로드바이크"
              maxLength={100}
              className="w-full rounded-md border border-t-border bg-t-surface p-2.5 text-sm text-t-text focus:outline-none focus:ring-2 focus:ring-sky-blue/50 focus:border-sky-blue"
            />
          </div>

          {/* Brand & Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-t-faint">브랜드</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="예: Giant"
                maxLength={100}
                className="w-full rounded-md border border-t-border bg-t-surface p-2.5 text-sm text-t-text focus:outline-none focus:ring-2 focus:ring-sky-blue/50 focus:border-sky-blue"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-t-faint">모델</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="예: Defy Advanced"
                maxLength={100}
                className="w-full rounded-md border border-t-border bg-t-surface p-2.5 text-sm text-t-text focus:outline-none focus:ring-2 focus:ring-sky-blue/50 focus:border-sky-blue"
              />
            </div>
          </div>

          {/* Year & Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-t-faint">연식</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="예: 2024"
                min={1900}
                max={new Date().getFullYear() + 1}
                className="w-full rounded-md border border-t-border bg-t-surface p-2.5 text-sm text-t-text focus:outline-none focus:ring-2 focus:ring-sky-blue/50 focus:border-sky-blue"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-t-faint">종류</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-md border border-t-border bg-t-surface p-2.5 text-sm text-t-text focus:outline-none focus:ring-2 focus:ring-sky-blue/50 focus:border-sky-blue"
              >
                <option value="">선택</option>
                {BIKE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Default checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-t-border text-sky-blue focus:ring-sky-blue/50"
            />
            <span className="text-sm text-t-text">기본 자전거로 설정</span>
          </label>

          {/* Error */}
          {error && (
            <p className="text-sm text-sky-red">{error}</p>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded-md border border-t-border px-4 py-2 text-sm text-t-muted hover:bg-t-hover transition-colors disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className={cn(
                "rounded-md px-4 py-2 text-sm text-white transition-colors disabled:opacity-50",
                "bg-sky-darkblue hover:bg-sky-darkblue/80"
              )}
            >
              {saving ? "저장 중..." : bike ? "수정" : "추가"}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
