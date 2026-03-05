"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { MessageSquarePlus, ImagePlus, X, Loader2 } from "lucide-react";

interface ImprovementRequest {
  id: string;
  category: string | null;
  content: string;
  images: string[];
  imageUrls: string[];
  status: string;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ImprovementRequestFormProps {
  courseId: string;
}

interface PreviewFile {
  file: File;
  previewUrl: string;
}

const MAX_IMAGES = 3;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const CATEGORIES = [
  { value: "gpx",        label: "GPX 최신화" },
  { value: "checkpoint", label: "체크포인트 수정" },
  { value: "route",      label: "경로 변경" },
  { value: "info",       label: "코스 정보 오류" },
  { value: "other",      label: "기타" },
] as const;

type CategoryValue = typeof CATEGORIES[number]["value"];

function categoryLabel(value: string | null) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? null;
}

function CategoryPicker({
  value,
  onChange,
}: {
  value: CategoryValue | null;
  onChange: (v: CategoryValue) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {CATEGORIES.map((cat) => (
        <button
          key={cat.value}
          type="button"
          onClick={() => onChange(cat.value)}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors border ${
            value === cat.value
              ? "bg-sky-darkblue text-white border-sky-darkblue"
              : "border-t-border text-t-muted hover:border-sky-blue hover:text-sky-blue"
          }`}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}

function ImageUploadArea({
  existingImages,
  existingUrls,
  newPreviews,
  onAddFiles,
  onRemoveNew,
  onRemoveExisting,
  disabled,
}: {
  existingImages: string[];
  existingUrls: string[];
  newPreviews: PreviewFile[];
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveNew: (index: number) => void;
  onRemoveExisting: (key: string) => void;
  disabled: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const totalCount = existingImages.length + newPreviews.length;
  const canAdd = totalCount < MAX_IMAGES && !disabled;

  return (
    <div className="space-y-1.5">
      {/* Existing + new image previews */}
      {(existingImages.length > 0 || newPreviews.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {existingImages.map((key, i) => (
            <div key={key} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={existingUrls[i] || ""}
                alt={`첨부 ${i + 1}`}
                className="h-14 w-14 rounded object-cover border border-t-border"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onRemoveExisting(key)}
                  className="absolute -top-1 -right-1 rounded-full bg-sky-red p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="삭제"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
          {newPreviews.map((preview, i) => (
            <div key={i} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.previewUrl}
                alt={`새 이미지 ${i + 1}`}
                className="h-14 w-14 rounded object-cover border border-t-border"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onRemoveNew(i)}
                  className="absolute -top-1 -right-1 rounded-full bg-sky-red p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="삭제"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add image button / drop zone */}
      {canAdd && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length > 0) onAddFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex items-center gap-1.5 rounded border border-dashed px-2 py-1.5 cursor-pointer transition-colors ${
            dragOver
              ? "border-sky-blue bg-sky-blue/10"
              : "border-t-border hover:border-t-muted"
          }`}
        >
          <ImagePlus className="h-3.5 w-3.5 text-t-muted" />
          <span className="text-[10px] text-t-muted">
            사진 첨부 (최대 {MAX_IMAGES}장, JPG/PNG/WebP, 10MB)
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) onAddFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ImprovementRequestForm({ courseId }: ImprovementRequestFormProps) {
  const { data: session } = useSession();
  const [request, setRequest] = useState<ImprovementRequest | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CategoryValue | null>(null);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryValue | null>(null);
  const [editContent, setEditContent] = useState("");
  const [newFiles, setNewFiles] = useState<PreviewFile[]>([]);
  const [editFiles, setEditFiles] = useState<PreviewFile[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [deletingImage, setDeletingImage] = useState(false);

  const fetchRequest = useCallback(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    fetch(`/api/courses/${courseId}/improvement-request`)
      .then((r) => r.json())
      .then((data: ImprovementRequest | null) => {
        setRequest(data);
        setLoading(false);
      })
      .catch(() => {
        setRequest(null);
        setLoading(false);
      });
  }, [courseId, session]);

  useEffect(() => {
    fetchRequest();
  }, [fetchRequest]);

  function addFiles(
    files: FileList | File[],
    target: "new" | "edit"
  ) {
    setImageError(null);
    const arr = Array.from(files);

    const invalid = arr.find((f) => !ALLOWED_TYPES.includes(f.type));
    if (invalid) {
      setImageError("JPG, PNG, WebP 형식만 업로드할 수 있습니다.");
      return;
    }
    const tooBig = arr.find((f) => f.size > 10 * 1024 * 1024);
    if (tooBig) {
      setImageError("파일 크기는 10MB 이하여야 합니다.");
      return;
    }

    const setter = target === "new" ? setNewFiles : setEditFiles;
    const existingCount = request?.images?.length ?? 0;

    setter((prev) => {
      const currentNew = prev.length;
      const total = (target === "edit" ? existingCount : 0) + currentNew + arr.length;
      if (total > MAX_IMAGES) {
        setImageError(`최대 ${MAX_IMAGES}장까지 업로드할 수 있습니다.`);
        return prev;
      }
      return [...prev, ...arr.map((f) => ({ file: f, previewUrl: URL.createObjectURL(f) }))];
    });
  }

  function removeNewFile(index: number, target: "new" | "edit") {
    const setter = target === "new" ? setNewFiles : setEditFiles;
    setter((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
    setImageError(null);
  }

  async function uploadImages(files: PreviewFile[]) {
    if (files.length === 0) return;
    const formData = new FormData();
    for (const f of files) {
      formData.append("images", f.file);
    }
    await fetch(`/api/courses/${courseId}/improvement-request/images`, {
      method: "POST",
      body: formData,
    });
    for (const f of files) URL.revokeObjectURL(f.previewUrl);
  }

  async function deleteExistingImage(imageKey: string) {
    setDeletingImage(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/improvement-request/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageKey }),
      });
      if (res.ok) fetchRequest();
    } finally {
      setDeletingImage(false);
    }
  }

  if (!session) return null;

  async function handleSubmit() {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/improvement-request`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, content: content.trim() }),
      });
      if (res.ok) {
        if (newFiles.length > 0) await uploadImages(newFiles);
        setNewFiles([]);
        setContent("");
        setCategory(null);
        setOpen(false);
        setLoading(true);
        fetchRequest();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit() {
    if (!editContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/improvement-request`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: editCategory, content: editContent.trim() }),
      });
      if (res.ok) {
        if (editFiles.length > 0) await uploadImages(editFiles);
        setEditFiles([]);
        setEditing(false);
        setLoading(true);
        fetchRequest();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;

  // No existing request
  if (!request) {
    return (
      <div className="rounded-lg border border-t-border bg-t-surface px-2.5 py-2">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-medium text-t-muted flex items-center gap-1">
            <MessageSquarePlus className="h-3 w-3" />
            코스 수정 요청
          </p>
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-[10px] text-sky-blue hover:underline"
            >
              요청 작성
            </button>
          )}
        </div>
        {open && (
          <div className="space-y-1.5">
            <div>
              <p className="text-[10px] text-t-muted mb-1">분류</p>
              <CategoryPicker value={category} onChange={setCategory} />
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="코스 경로, 체크포인트, 설명 등 개선이 필요한 내용을 입력하세요..."
              rows={3}
              className="w-full rounded border border-t-border bg-t-surface px-2 py-1.5 text-[11px] text-t-text placeholder:text-t-muted resize-none"
            />
            <ImageUploadArea
              existingImages={[]}
              existingUrls={[]}
              newPreviews={newFiles}
              onAddFiles={(f) => addFiles(f, "new")}
              onRemoveNew={(i) => removeNewFile(i, "new")}
              onRemoveExisting={() => {}}
              disabled={submitting}
            />
            {imageError && <p className="text-[10px] text-sky-red">{imageError}</p>}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !content.trim()}
                className="rounded bg-sky-darkblue px-3 py-1 text-[11px] text-white hover:bg-sky-darkblue/80 disabled:opacity-50"
              >
                {submitting ? "제출 중..." : "수정 요청 제출"}
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); setContent(""); setCategory(null); setNewFiles([]); setImageError(null); }}
                className="rounded border border-t-border px-3 py-1 text-[11px] text-t-muted hover:bg-t-hover"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const existingImages = request.images ?? [];
  const existingUrls = request.imageUrls ?? [];

  // Pending request
  if (request.status === "pending") {
    return (
      <div className="rounded-lg border border-t-border bg-t-surface px-2.5 py-2">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-medium text-t-muted flex items-center gap-1">
            <MessageSquarePlus className="h-3 w-3" />
            코스 수정 요청
          </p>
          <div className="flex items-center gap-1.5">
            {request.category && (
              <Badge className="text-[9px] px-1.5 py-0">{categoryLabel(request.category)}</Badge>
            )}
            <Badge variant="warning" className="text-[9px] px-1.5 py-0">검토 중</Badge>
          </div>
        </div>
        {editing ? (
          <div className="space-y-1.5">
            <div>
              <p className="text-[10px] text-t-muted mb-1">분류</p>
              <CategoryPicker value={editCategory} onChange={setEditCategory} />
            </div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              className="w-full rounded border border-t-border bg-t-surface px-2 py-1.5 text-[11px] text-t-text resize-none"
            />
            <ImageUploadArea
              existingImages={existingImages}
              existingUrls={existingUrls}
              newPreviews={editFiles}
              onAddFiles={(f) => addFiles(f, "edit")}
              onRemoveNew={(i) => removeNewFile(i, "edit")}
              onRemoveExisting={deleteExistingImage}
              disabled={submitting || deletingImage}
            />
            {imageError && <p className="text-[10px] text-sky-red">{imageError}</p>}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={handleEdit}
                disabled={submitting || !editContent.trim()}
                className="rounded bg-sky-darkblue px-3 py-1 text-[11px] text-white hover:bg-sky-darkblue/80 disabled:opacity-50"
              >
                {submitting ? (
                  <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />저장 중...</span>
                ) : "요청 수정"}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setEditFiles([]); setImageError(null); }}
                className="rounded border border-t-border px-3 py-1 text-[11px] text-t-muted hover:bg-t-hover"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-t-sub whitespace-pre-wrap break-words mb-1.5">
              {request.content}
            </p>
            {existingImages.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {existingImages.map((key, i) => (
                  <a key={key} href={existingUrls[i] || "#"} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={existingUrls[i] || ""}
                      alt={`첨부 ${i + 1}`}
                      className="h-14 w-14 rounded object-cover border border-t-border hover:opacity-80 transition-opacity"
                    />
                  </a>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setEditContent(request!.content);
                setEditCategory((request!.category as CategoryValue) ?? null);
                setEditFiles([]);
                setImageError(null);
              }}
              className="text-[10px] text-sky-blue hover:underline"
            >
              수정
            </button>
          </>
        )}
      </div>
    );
  }

  // Resolved request
  if (request.status === "resolved") {
    return (
      <div className="rounded-lg border border-t-border bg-t-surface px-2.5 py-2">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-medium text-t-muted flex items-center gap-1">
            <MessageSquarePlus className="h-3 w-3" />
            코스 수정 요청
          </p>
          <div className="flex items-center gap-1.5">
            {request.category && (
              <Badge className="text-[9px] px-1.5 py-0">{categoryLabel(request.category)}</Badge>
            )}
            <Badge variant="success" className="text-[9px] px-1.5 py-0">처리 완료</Badge>
          </div>
        </div>
        <p className="text-[11px] text-t-sub whitespace-pre-wrap break-words mb-1">
          {request.content}
        </p>
        {existingImages.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1">
            {existingImages.map((key, i) => (
              <a key={key} href={existingUrls[i] || "#"} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={existingUrls[i] || ""}
                  alt={`첨부 ${i + 1}`}
                  className="h-14 w-14 rounded object-cover border border-t-border hover:opacity-80 transition-opacity"
                />
              </a>
            ))}
          </div>
        )}
        {request.adminNote && (
          <div className="rounded border border-t-border bg-t-bg/60 px-2 py-1 mb-1.5">
            <p className="text-[10px] text-t-muted mb-0.5">관리자 메모</p>
            <p className="text-[11px] text-t-sub whitespace-pre-wrap break-words">
              {request.adminNote}
            </p>
          </div>
        )}
        {open ? (
          <div className="space-y-1.5 mt-1.5">
            <div>
              <p className="text-[10px] text-t-muted mb-1">분류</p>
              <CategoryPicker value={category} onChange={setCategory} />
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="새 수정 요청 내용을 입력하세요..."
              rows={3}
              className="w-full rounded border border-t-border bg-t-surface px-2 py-1.5 text-[11px] text-t-text placeholder:text-t-muted resize-none"
            />
            <ImageUploadArea
              existingImages={[]}
              existingUrls={[]}
              newPreviews={newFiles}
              onAddFiles={(f) => addFiles(f, "new")}
              onRemoveNew={(i) => removeNewFile(i, "new")}
              onRemoveExisting={() => {}}
              disabled={submitting}
            />
            {imageError && <p className="text-[10px] text-sky-red">{imageError}</p>}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !content.trim()}
                className="rounded bg-sky-darkblue px-3 py-1 text-[11px] text-white hover:bg-sky-darkblue/80 disabled:opacity-50"
              >
                {submitting ? "제출 중..." : "새 요청 제출"}
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); setContent(""); setCategory(null); setNewFiles([]); setImageError(null); }}
                className="rounded border border-t-border px-3 py-1 text-[11px] text-t-muted hover:bg-t-hover"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setOpen(true); setContent(""); setCategory(null); setNewFiles([]); setImageError(null); }}
            className="text-[10px] text-sky-blue hover:underline"
          >
            새 요청 제출
          </button>
        )}
      </div>
    );
  }

  return null;
}
