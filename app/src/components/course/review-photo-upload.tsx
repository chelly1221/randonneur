"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, ImagePlus, Loader2 } from "lucide-react";

interface ReviewPhotoUploadProps {
  reviewId: string;
  onUploadComplete?: () => void;
}

interface PreviewFile {
  file: File;
  previewUrl: string;
}

const MAX_PHOTOS = 5;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function ReviewPhotoUpload({
  reviewId,
  onUploadComplete,
}: ReviewPhotoUploadProps) {
  const [previews, setPreviews] = useState<PreviewFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    setError(null);
    const fileArray = Array.from(files);

    // Validate types
    const invalidFile = fileArray.find((f) => !ALLOWED_TYPES.includes(f.type));
    if (invalidFile) {
      setError("JPG, PNG, WebP 형식만 업로드할 수 있습니다.");
      return;
    }

    // Validate size (10MB per file)
    const tooBig = fileArray.find((f) => f.size > 10 * 1024 * 1024);
    if (tooBig) {
      setError("파일 크기는 10MB 이하여야 합니다.");
      return;
    }

    setPreviews((prev) => {
      const total = prev.length + fileArray.length;
      if (total > MAX_PHOTOS) {
        setError(`최대 ${MAX_PHOTOS}장까지 업로드할 수 있습니다.`);
        return prev;
      }
      const newPreviews = fileArray.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      return [...prev, ...newPreviews];
    });
  }, []);

  function removePreview(index: number) {
    setPreviews((prev) => {
      const removed = prev[index];
      URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
    setError(null);
  }

  async function handleUpload() {
    if (previews.length === 0) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      for (const preview of previews) {
        formData.append("photos", preview.file);
      }

      const res = await fetch(`/api/reviews/${reviewId}/photos`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "업로드에 실패했습니다.");
      }

      // Clean up preview URLs
      for (const preview of previews) {
        URL.revokeObjectURL(preview.previewUrl);
      }
      setPreviews([]);
      onUploadComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  return (
    <div className="space-y-2">
      {/* Drop zone / file selector */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-4 transition-colors cursor-pointer ${
          dragOver
            ? "border-sky-blue bg-sky-blue/10"
            : "border-t-border bg-t-faint hover:border-t-muted"
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <ImagePlus className="mb-1.5 h-6 w-6 text-t-muted" />
        <p className="text-xs text-t-muted">
          사진을 끌어다 놓거나 클릭하여 선택
        </p>
        <p className="text-[10px] text-t-muted mt-0.5">
          JPG, PNG, WebP / 최대 {MAX_PHOTOS}장 / 10MB 이하
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              addFiles(e.target.files);
            }
            e.target.value = "";
          }}
        />
      </div>

      {/* Previews */}
      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((preview, index) => (
            <div key={index} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.previewUrl}
                alt={`미리보기 ${index + 1}`}
                className="h-16 w-16 rounded-lg object-cover border border-t-border"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removePreview(index);
                }}
                className="absolute -top-1 -right-1 rounded-full bg-sky-red p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="삭제"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-sky-red">{error}</p>
      )}

      {/* Upload button */}
      {previews.length > 0 && (
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          className="flex items-center gap-1.5 rounded bg-sky-darkblue px-3 py-1.5 text-xs text-white hover:bg-sky-darkblue/80 disabled:opacity-50 transition-colors"
        >
          {uploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              업로드 중...
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" />
              {previews.length}장 업로드
            </>
          )}
        </button>
      )}
    </div>
  );
}
