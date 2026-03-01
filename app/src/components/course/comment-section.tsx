"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { LikeButton } from "./like-button";
import { ReportButton } from "./report-button";
import { MessageSquare, ChevronDown, ChevronUp, Pencil, Trash2, Reply } from "lucide-react";

interface CommentUser {
  id: string;
  displayName: string;
}

interface CommentData {
  id: string;
  reviewId: string;
  userId: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  user: CommentUser;
  _count: { likes: number };
  children?: CommentData[];
}

interface CommentSectionProps {
  reviewId: string;
  commentCount: number;
  likedCommentIds: string[];
}

export function CommentSection({ reviewId, commentCount, likedCommentIds }: CommentSectionProps) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [count, setCount] = useState(commentCount);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
        let total = data.length;
        for (const c of data) {
          total += (c.children?.length ?? 0);
        }
        setCount(total);
      }
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    if (expanded) fetchComments();
  }, [expanded, fetchComments]);

  async function handleSubmit(parentId?: string) {
    const content = parentId ? replyContent : newContent;
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), parentId }),
      });
      if (res.ok) {
        if (parentId) {
          setReplyContent("");
          setReplyTo(null);
        } else {
          setNewContent("");
        }
        fetchComments();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(commentId: string) {
    if (!editContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (res.ok) {
        setEditingId(null);
        setEditContent("");
        fetchComments();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId: string) {
    if (!confirm("댓글을 삭제하시겠습니까?")) return;
    await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
    fetchComments();
  }

  function isOwner(comment: CommentData): boolean {
    return session?.user?.name === comment.user.displayName;
  }

  function renderComment(comment: CommentData, isReply = false) {
    return (
      <div key={comment.id} className={`${isReply ? "ml-4 border-l border-t-border pl-3" : ""}`}>
        <div className="py-1.5">
          {editingId === comment.id ? (
            <div className="space-y-1">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full rounded border border-t-border bg-t-surface p-2 text-[11px] text-t-text resize-none"
                rows={2}
              />
              <div className="flex gap-1">
                <button
                  onClick={() => handleEdit(comment.id)}
                  disabled={submitting || !editContent.trim()}
                  className="rounded bg-sky-darkblue px-2 py-0.5 text-[10px] text-white hover:bg-sky-darkblue/80 disabled:opacity-50"
                >
                  수정
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded border border-t-border px-2 py-0.5 text-[10px] text-t-muted hover:bg-t-hover"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-t-text">
                    {comment.user.displayName}
                  </span>
                  <span className="text-[9px] text-t-muted">
                    {new Date(comment.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <LikeButton
                    commentId={comment.id}
                    initialCount={comment._count.likes}
                    initialLiked={likedCommentIds.includes(comment.id)}
                  />
                  {!isReply && session && (
                    <button
                      onClick={() => {
                        setReplyTo(replyTo === comment.id ? null : comment.id);
                        setReplyContent("");
                      }}
                      className="text-[10px] text-t-muted hover:text-t-text"
                      title="답글"
                    >
                      <Reply className="h-3 w-3" />
                    </button>
                  )}
                  {isOwner(comment) ? (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(comment.id);
                          setEditContent(comment.content);
                        }}
                        className="rounded p-0.5 text-t-muted hover:text-t-text"
                        title="수정"
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(comment.id)}
                        className="rounded p-0.5 text-t-muted hover:text-sky-red"
                        title="삭제"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </>
                  ) : session && (
                    <ReportButton commentId={comment.id} />
                  )}
                </div>
              </div>
              <p className="text-[11px] text-t-text mt-0.5 whitespace-pre-wrap">{comment.content}</p>
            </>
          )}
        </div>

        {/* Reply form */}
        {replyTo === comment.id && (
          <div className="ml-4 mb-1 flex gap-1">
            <input
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="답글을 입력하세요..."
              className="flex-1 rounded border border-t-border bg-t-surface px-2 py-1 text-[11px] text-t-text"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(comment.id);
                }
              }}
            />
            <button
              onClick={() => handleSubmit(comment.id)}
              disabled={submitting || !replyContent.trim()}
              className="rounded bg-sky-darkblue px-2 py-1 text-[10px] text-white hover:bg-sky-darkblue/80 disabled:opacity-50"
            >
              답글
            </button>
          </div>
        )}

        {/* Children */}
        {comment.children?.map((child) => renderComment(child, true))}
      </div>
    );
  }

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-t-muted hover:text-t-text"
      >
        <MessageSquare className="h-3 w-3" />
        댓글 {count > 0 && count}
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="mt-1 rounded border border-t-border bg-t-bg/30 p-2">
          {loading ? (
            <div className="h-6 animate-pulse rounded bg-t-hover" />
          ) : comments.length === 0 ? (
            <p className="text-[10px] text-t-muted">아직 댓글이 없습니다.</p>
          ) : (
            <div className="space-y-0.5 divide-y divide-t-divider">
              {comments.map((c) => renderComment(c))}
            </div>
          )}

          {session && (
            <div className="mt-2 flex gap-1">
              <input
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="댓글을 입력하세요..."
                className="flex-1 rounded border border-t-border bg-t-surface px-2 py-1 text-[11px] text-t-text"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <button
                onClick={() => handleSubmit()}
                disabled={submitting || !newContent.trim()}
                className="rounded bg-sky-darkblue px-2 py-1 text-[10px] text-white hover:bg-sky-darkblue/80 disabled:opacity-50"
              >
                작성
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
