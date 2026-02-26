"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { MessageSquarePlus } from "lucide-react";

interface ImprovementRequest {
  id: string;
  category: string | null;
  content: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ImprovementRequestFormProps {
  courseId: string;
}

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
                onClick={() => { setOpen(false); setContent(""); setCategory(null); }}
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
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={handleEdit}
                disabled={submitting || !editContent.trim()}
                className="rounded bg-sky-darkblue px-3 py-1 text-[11px] text-white hover:bg-sky-darkblue/80 disabled:opacity-50"
              >
                {submitting ? "저장 중..." : "요청 수정"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
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
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setEditContent(request!.content);
                setEditCategory((request!.category as CategoryValue) ?? null);
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
                onClick={() => { setOpen(false); setContent(""); setCategory(null); }}
                className="rounded border border-t-border px-3 py-1 text-[11px] text-t-muted hover:bg-t-hover"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setOpen(true); setContent(""); setCategory(null); }}
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
