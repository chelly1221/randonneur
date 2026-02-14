"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle, Loader2 } from "lucide-react";

interface CompletionFormProps {
  courseId: string;
}

export function CompletionForm({ courseId }: CompletionFormProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!session) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    form.set("courseId", courseId);

    try {
      const res = await fetch("/api/completions", { method: "POST", body: form });
      if (res.ok) {
        setSuccess(true);
        setOpen(false);
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex items-center gap-2 text-t-success">
        <CheckCircle className="h-5 w-5" />
        <span className="text-sm font-medium">완주 기록 완료!</span>
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <CheckCircle className="mr-1 h-4 w-4" />
        완주 기록
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-t-border bg-t-surface p-4 space-y-3">
      <div>
        <label className="block text-sm font-medium text-t-text mb-1">
          완주 날짜
        </label>
        <Input
          type="date"
          name="completedAt"
          required
          defaultValue={new Date().toISOString().split("T")[0]}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-t-text mb-1">
          메모 (선택)
        </label>
        <Input type="text" name="notes" placeholder="메모를 입력하세요" />
      </div>
      <div>
        <label className="block text-sm font-medium text-t-text mb-1">
          GPX 파일 (선택)
        </label>
        <Input type="file" name="gpx" accept=".gpx" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading}>
          {loading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          저장
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          취소
        </Button>
      </div>
    </form>
  );
}
