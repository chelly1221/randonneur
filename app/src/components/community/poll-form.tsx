"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, X, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";

export function PollForm() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [endsAt, setEndsAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const addOption = () => {
    if (options.length >= 6) return;
    setOptions([...options, ""]);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, value: string) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setOptions(["", ""]);
    setEndsAt("");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }

    const nonEmptyOptions = options.filter((o) => o.trim());
    if (nonEmptyOptions.length < 2) {
      setError("최소 2개의 옵션이 필요합니다.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        options: nonEmptyOptions.map((o) => o.trim()),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      };

      const res = await fetch("/api/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "오류가 발생했습니다.");
        return;
      }

      resetForm();
      setIsOpen(false);
      router.refresh();
      // Trigger refetch in poll list
      window.location.reload();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="py-3 px-4">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-between text-sm font-medium text-t-text"
        >
          <span>투표 만들기</span>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-t-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-t-muted" />
          )}
        </button>

        {isOpen && (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            {error && (
              <div className="rounded-md bg-sky-red/10 px-3 py-2 text-sm text-sky-red">
                {error}
              </div>
            )}

            {/* Title */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="투표 제목"
              maxLength={100}
              className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none"
            />

            {/* Description */}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="설명 (선택사항)"
              rows={2}
              className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none resize-y"
            />

            {/* Options */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-t-muted">옵션</label>
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => updateOption(index, e.target.value)}
                    placeholder={`옵션 ${index + 1}`}
                    maxLength={80}
                    className="flex-1 rounded-md border border-t-border bg-t-surface px-3 py-1.5 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      className="rounded-md p-1 text-t-muted hover:text-sky-red hover:bg-sky-red/10 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {options.length < 6 && (
                <button
                  type="button"
                  onClick={addOption}
                  className="inline-flex items-center gap-1 text-xs text-sky-blue hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  옵션 추가
                </button>
              )}
            </div>

            {/* End date */}
            <div>
              <label className="mb-1 block text-xs font-medium text-t-muted">
                종료 일시 (선택사항)
              </label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-md border border-t-border bg-t-surface px-3 py-1.5 text-sm text-t-text focus:border-sky-blue focus:outline-none"
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-md bg-sky-darkblue px-4 py-2 text-sm font-medium text-white hover:bg-sky-darkblue/90 transition-colors disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                투표 만들기
              </button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
