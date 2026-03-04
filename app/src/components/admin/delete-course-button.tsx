"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeleteCourseButton({ courseId, onSuccess }: { courseId: string; onSuccess?: () => void }) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("이 코스를 삭제하시겠습니까?")) return;

    const res = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
    if (res.ok) {
      if (onSuccess) {
        onSuccess();
      } else {
        router.refresh();
      }
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleDelete}>
      <Trash2 className="h-3.5 w-3.5 text-t-danger" />
    </Button>
  );
}
