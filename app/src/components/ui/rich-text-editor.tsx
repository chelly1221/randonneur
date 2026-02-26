"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, List, ListOrdered, Minus } from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "내용을 입력하세요...",
  minHeight = 80,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange(editor.isEmpty ? "" : editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "rte-editor outline-none",
        style: `min-height:${minHeight}px`,
      },
    },
  });

  // Sync when value is reset externally
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value || "");
    }
    // Only run when value changes from outside
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value === ""]);

  if (!editor) return null;

  function btn(active: boolean) {
    return `rounded p-1 transition-colors ${
      active
        ? "bg-sky-blue/20 text-sky-blue"
        : "text-t-muted hover:bg-t-hover hover:text-t-text"
    }`;
  }

  return (
    <div className="rounded border border-t-border bg-t-surface overflow-hidden focus-within:border-sky-blue/50 transition-colors">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-t-border px-2 py-1 bg-t-bg/50">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleBold().run();
          }}
          className={btn(editor.isActive("bold"))}
          title="굵게 (Ctrl+B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleItalic().run();
          }}
          className={btn(editor.isActive("italic"))}
          title="기울임 (Ctrl+I)"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <div className="mx-1 h-3.5 w-px bg-t-border" />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleBulletList().run();
          }}
          className={btn(editor.isActive("bulletList"))}
          title="글머리 기호"
        >
          <List className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleOrderedList().run();
          }}
          className={btn(editor.isActive("orderedList"))}
          title="번호 목록"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
        <div className="mx-1 h-3.5 w-px bg-t-border" />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().clearNodes().unsetAllMarks().run();
          }}
          className={btn(false)}
          title="서식 지우기"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Editor area */}
      <EditorContent
        editor={editor}
        className="rte-content px-3 py-2 text-[12px] text-t-text max-h-[220px] overflow-y-auto"
      />
    </div>
  );
}

/** Render stored HTML review content safely */
export function ReviewContent({ html }: { html: string }) {
  // Detect if it's plain text (no HTML tags) and render accordingly
  const isHtml = /<[a-z][\s\S]*>/i.test(html);
  if (!isHtml) {
    return (
      <p className="text-[11px] text-t-sub whitespace-pre-wrap break-words">{html}</p>
    );
  }
  return (
    <div
      className="review-content text-[11px] text-t-sub"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
