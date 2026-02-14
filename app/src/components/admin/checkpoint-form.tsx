"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, GripVertical } from "lucide-react";

interface Checkpoint {
  id?: string;
  name: string;
  description: string;
  distanceKm: number;
  imageKey: string | null;
  sortOrder: number;
}

interface CheckpointFormProps {
  courseId: string;
}

export function CheckpointForm({ courseId }: CheckpointFormProps) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/courses/${courseId}/checkpoints`)
      .then((r) => r.json())
      .then((data) => {
        setCheckpoints(
          data.map((cp: Checkpoint & { id: string }) => ({
            id: cp.id,
            name: cp.name,
            description: cp.description ?? "",
            distanceKm: cp.distanceKm,
            imageKey: cp.imageKey,
            sortOrder: cp.sortOrder,
          }))
        );
      })
      .finally(() => setLoading(false));
  }, [courseId]);

  function addCheckpoint() {
    setCheckpoints((prev) => [
      ...prev,
      {
        name: "",
        description: "",
        distanceKm: 0,
        imageKey: null,
        sortOrder: prev.length,
      },
    ]);
  }

  function updateField(
    index: number,
    field: keyof Checkpoint,
    value: string | number
  ) {
    setCheckpoints((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  async function saveCheckpoint(index: number) {
    const cp = checkpoints[index];
    setSaving(cp.id ?? `new-${index}`);

    try {
      if (cp.id) {
        const res = await fetch(`/api/courses/${courseId}/checkpoints`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...cp, sortOrder: index }),
        });
        if (res.ok) {
          const updated = await res.json();
          setCheckpoints((prev) => {
            const next = [...prev];
            next[index] = {
              ...next[index],
              id: updated.id,
              sortOrder: index,
            };
            return next;
          });
        }
      } else {
        const res = await fetch(`/api/courses/${courseId}/checkpoints`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...cp, sortOrder: index }),
        });
        if (res.ok) {
          const created = await res.json();
          setCheckpoints((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], id: created.id, sortOrder: index };
            return next;
          });
        }
      }
    } finally {
      setSaving(null);
    }
  }

  async function deleteCheckpoint(index: number) {
    const cp = checkpoints[index];
    if (cp.id) {
      await fetch(
        `/api/courses/${courseId}/checkpoints?cpId=${cp.id}`,
        { method: "DELETE" }
      );
    }
    setCheckpoints((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleImageUpload(index: number, file: File) {
    const cp = checkpoints[index];
    const cpId = cp.id ?? `temp-${index}`;
    const key = `checkpoints/${courseId}/${cpId}.jpg`;

    const formData = new FormData();
    formData.set("file", file);
    formData.set("key", key);

    const res = await fetch("/api/admin/upload-image", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      updateField(index, "imageKey", data.key);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-t-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        체크포인트 로딩중...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">체크포인트 (CP)</h3>
        <Button type="button" variant="outline" size="sm" onClick={addCheckpoint}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          CP 추가
        </Button>
      </div>

      {checkpoints.length === 0 && (
        <p className="text-sm text-t-muted">등록된 체크포인트가 없습니다.</p>
      )}

      {checkpoints.map((cp, i) => (
        <div
          key={cp.id ?? `new-${i}`}
          className="rounded-lg border border-t-border bg-t-surface p-4 space-y-3"
        >
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-t-faint shrink-0" />
            <span className="text-xs font-medium text-t-muted min-w-[24px]">
              CP{i + 1}
            </span>
            <div className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => deleteCheckpoint(i)}
              className="text-t-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-t-muted mb-1">
                이름 *
              </label>
              <Input
                value={cp.name}
                onChange={(e) => updateField(i, "name", e.target.value)}
                placeholder="체크포인트 이름"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-t-muted mb-1">
                거리 (km) *
              </label>
              <Input
                type="number"
                step="0.1"
                value={cp.distanceKm || ""}
                onChange={(e) =>
                  updateField(i, "distanceKm", parseFloat(e.target.value) || 0)
                }
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-t-muted mb-1">
              설명
            </label>
            <Input
              value={cp.description}
              onChange={(e) => updateField(i, "description", e.target.value)}
              placeholder="설명 (선택)"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-t-muted mb-1">
              이미지
            </label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => {
                if (e.target.files?.[0]) handleImageUpload(i, e.target.files[0]);
              }}
            />
            {cp.imageKey && (
              <p className="mt-1 text-xs text-t-muted">
                업로드됨: {cp.imageKey}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => saveCheckpoint(i)}
              disabled={saving !== null}
            >
              {saving === (cp.id ?? `new-${i}`) && (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              )}
              {cp.id ? "수정" : "저장"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
