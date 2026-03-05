"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import {
  ArrowLeft,
  Bold,
  Italic,
  List,
  ListOrdered,
  Minus,
  ImagePlus,
  Loader2,
  MapPin,
  Mountain,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ReviewPhotoUpload } from "@/components/course/review-photo-upload";

interface Course {
  id: string;
  slug: string;
  name: string;
  distanceKm: number;
  elevationM: number;
  region: string | null;
  startLocation: string;
  endLocation: string;
}

const STATUS_OPTIONS = [
  { value: "success", label: "성공", variant: "success" as const },
  { value: "dnf", label: "DNF", variant: "warning" as const },
  { value: "dnq", label: "DNQ", variant: "default" as const },
  { value: "dns", label: "DNS", variant: "danger" as const },
];

export function ReviewWriteClient({ course }: { course: Course }) {
  const router = useRouter();
  const [status, setStatus] = useState("success");
  const [difficulty, setDifficulty] = useState("");
  const [diffHover, setDiffHover] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdReviewId, setCreatedReviewId] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
      }),
      Placeholder.configure({ placeholder: "코스에 대한 후기를 작성하세요. 경험, 풍경, 난이도, 팁 등을 공유해주세요..." }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: "rounded-lg max-w-full h-auto my-2",
        },
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "rte-editor outline-none",
        style: "min-height:200px",
      },
    },
  });

  const insertImage = useCallback(async (file: File) => {
    if (!editor) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("JPG, PNG, WebP 형식만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("파일 크기는 10MB 이하여야 합니다.");
      return;
    }

    setImageUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/reviews/upload-image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "이미지 업로드 실패");
      }

      const { url } = await res.json();
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 업로드 실패");
    } finally {
      setImageUploading(false);
    }
  }, [editor]);

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      insertImage(file);
    }
    e.target.value = "";
  };

  async function handleSubmit() {
    if (!editor) return;
    const content = editor.isEmpty ? "" : editor.getHTML();
    if (!content.trim()) {
      setError("후기 내용을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/courses/${course.id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completionStatus: status,
          difficulty: difficulty || null,
          content,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "후기 작성에 실패했습니다.");
      }

      const review = await res.json();
      setCreatedReviewId(review.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "후기 작성에 실패했습니다.");
      setSubmitting(false);
    }
  }

  // After review created, show photo upload step
  if (createdReviewId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-t-text">후기가 등록되었습니다</h2>
            <p className="text-sm text-t-muted">사진을 추가로 업로드할 수 있습니다.</p>
          </div>
        </div>

        <div className="rounded-lg border border-t-border bg-t-surface p-4">
          <p className="text-sm font-medium text-t-text mb-3">사진 첨부 (선택)</p>
          <ReviewPhotoUpload
            reviewId={createdReviewId}
            onUploadComplete={() => {}}
          />
        </div>

        <div className="flex gap-2">
          <Link
            href={`/courses/${course.slug}`}
            className="rounded-lg bg-sky-darkblue px-4 py-2 text-sm text-white hover:bg-sky-darkblue/80 transition-colors"
          >
            코스로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const filled = diffHover || Number(difficulty);

  function btn(active: boolean) {
    return `rounded p-1.5 transition-colors ${
      active
        ? "bg-sky-blue/20 text-sky-blue"
        : "text-t-muted hover:bg-t-hover hover:text-t-text"
    }`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/courses/${course.slug}`}
          className="inline-flex items-center gap-1 text-sm text-t-muted hover:text-t-text mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          코스로 돌아가기
        </Link>
        <h1 className="text-xl font-bold text-t-text">후기 작성</h1>
      </div>

      {/* Course info */}
      <div className="rounded-lg border border-t-border bg-t-surface p-4">
        <h2 className="font-semibold text-t-text">{course.name}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-t-muted">
          <span className="flex items-center gap-1">
            <ArrowRight className="h-3 w-3" />
            {course.distanceKm}km
          </span>
          <span className="flex items-center gap-1">
            <Mountain className="h-3 w-3" />
            {course.elevationM}m
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {course.startLocation} → {course.endLocation}
          </span>
          {course.region && <Badge variant="primary" className="text-[10px]">{course.region}</Badge>}
        </div>
      </div>

      {/* Completion status */}
      <div>
        <label className="text-sm font-medium text-t-text block mb-2">완주 상태</label>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatus(opt.value)}
              className={`transition-opacity ${status === opt.value ? "opacity-100 ring-2 ring-offset-1 ring-sky-blue rounded" : "opacity-50 hover:opacity-80"}`}
            >
              <Badge variant={opt.variant} className="text-xs px-3 py-1 cursor-pointer">
                {opt.label}
              </Badge>
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div>
        <label className="text-sm font-medium text-t-text block mb-2">체감 난이도 (선택)</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onMouseEnter={() => setDiffHover(star)}
              onMouseLeave={() => setDiffHover(0)}
              onClick={() => setDifficulty(difficulty === String(star) ? "" : String(star))}
              className={`text-2xl leading-none transition-colors ${
                star <= filled ? "text-sky-yellow" : "text-t-muted"
              }`}
            >
              ★
            </button>
          ))}
          {difficulty && (
            <span className="ml-2 text-sm text-t-muted">{difficulty}/5</span>
          )}
        </div>
      </div>

      {/* Rich text editor */}
      <div>
        <label className="text-sm font-medium text-t-text block mb-2">후기 내용</label>
        <div className="rounded-lg border border-t-border bg-t-surface overflow-hidden focus-within:border-sky-blue/50 transition-colors">
          {/* Toolbar */}
          <div className="flex items-center gap-0.5 border-b border-t-border px-3 py-1.5 bg-t-bg/50">
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }}
              className={btn(editor?.isActive("bold") ?? false)}
              title="굵게 (Ctrl+B)"
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleItalic().run(); }}
              className={btn(editor?.isActive("italic") ?? false)}
              title="기울임 (Ctrl+I)"
            >
              <Italic className="h-4 w-4" />
            </button>
            <div className="mx-1.5 h-4 w-px bg-t-border" />
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run(); }}
              className={btn(editor?.isActive("bulletList") ?? false)}
              title="글머리 기호"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleOrderedList().run(); }}
              className={btn(editor?.isActive("orderedList") ?? false)}
              title="번호 목록"
            >
              <ListOrdered className="h-4 w-4" />
            </button>
            <div className="mx-1.5 h-4 w-px bg-t-border" />
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setHorizontalRule().run(); }}
              className={btn(false)}
              title="구분선"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="mx-1.5 h-4 w-px bg-t-border" />
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleImageClick();
              }}
              disabled={imageUploading}
              className={`${btn(false)} ${imageUploading ? "opacity-50" : ""}`}
              title="이미지 삽입"
            >
              {imageUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Editor area */}
          <EditorContent
            editor={editor}
            className="rte-content px-4 py-3 text-sm text-t-text min-h-[200px] max-h-[500px] overflow-y-auto"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-sky-red">{error}</p>
      )}

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg bg-sky-darkblue px-6 py-2.5 text-sm font-medium text-white hover:bg-sky-darkblue/80 disabled:opacity-50 transition-colors"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              등록 중...
            </span>
          ) : (
            "후기 등록"
          )}
        </button>
        <Link
          href={`/courses/${course.slug}`}
          className="rounded-lg border border-t-border px-6 py-2.5 text-sm text-t-muted hover:bg-t-hover transition-colors"
        >
          취소
        </Link>
      </div>
    </div>
  );
}
