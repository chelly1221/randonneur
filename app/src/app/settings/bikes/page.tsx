"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Plus, Bike } from "lucide-react";
import Link from "next/link";
import { BikeCard, type BikeData } from "@/components/user/bike-card";
import { BikeForm } from "@/components/user/bike-form";

export default function BikesSettingsPage() {
  const { data: session } = useSession();
  const [bikes, setBikes] = useState<BikeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBike, setEditingBike] = useState<BikeData | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchBikes = useCallback(async () => {
    try {
      const res = await fetch("/api/bikes");
      if (res.ok) {
        const data = await res.json();
        setBikes(data);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBikes();
  }, [fetchBikes]);

  if (!session) return null;

  function handleAddClick() {
    setEditingBike(undefined);
    setShowForm(true);
  }

  function handleEditClick(bike: BikeData) {
    setEditingBike(bike);
    setShowForm(true);
  }

  async function handleDeleteClick(bike: BikeData) {
    if (!confirm(`"${bike.name}" 자전거를 삭제하시겠습니까?`)) return;

    setDeletingId(bike.id);
    try {
      const res = await fetch(`/api/bikes/${bike.id}`, { method: "DELETE" });
      if (res.ok) {
        setBikes((prev) => prev.filter((b) => b.id !== bike.id));
      }
    } catch {
      // Ignore
    } finally {
      setDeletingId(null);
    }
  }

  function handleFormSave() {
    setShowForm(false);
    setEditingBike(undefined);
    fetchBikes();
  }

  function handleFormCancel() {
    setShowForm(false);
    setEditingBike(undefined);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-t-subtle" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="rounded-md p-1.5 text-t-muted hover:bg-t-hover hover:text-t-text transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold">내 자전거</h1>
        </div>
        {!showForm && bikes.length < 5 && (
          <button
            onClick={handleAddClick}
            className="flex items-center gap-1.5 rounded-md bg-sky-darkblue px-4 py-2 text-sm text-white hover:bg-sky-darkblue/80 transition-colors"
          >
            <Plus className="h-4 w-4" />
            자전거 추가
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-4">
          <BikeForm
            bike={editingBike}
            onSave={handleFormSave}
            onCancel={handleFormCancel}
          />
        </div>
      )}

      {/* Bike list */}
      {bikes.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-t-border py-12 text-t-muted">
          <Bike className="mb-3 h-10 w-10 text-t-faint" />
          <p className="text-sm font-medium">등록된 자전거가 없습니다</p>
          <p className="mt-1 text-xs text-t-faint">
            자전거를 추가하여 라이딩 기록을 더 풍성하게 만들어보세요
          </p>
          <button
            onClick={handleAddClick}
            className="mt-4 flex items-center gap-1.5 rounded-md bg-sky-darkblue px-4 py-2 text-sm text-white hover:bg-sky-darkblue/80 transition-colors"
          >
            <Plus className="h-4 w-4" />
            자전거 추가
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {bikes.map((bike) => (
            <div
              key={bike.id}
              className={deletingId === bike.id ? "opacity-50 pointer-events-none" : ""}
            >
              <BikeCard
                bike={bike}
                editable
                onEdit={() => handleEditClick(bike)}
                onDelete={() => handleDeleteClick(bike)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Limit note */}
      {bikes.length > 0 && (
        <p className="mt-4 text-center text-xs text-t-faint">
          최대 5대까지 등록할 수 있습니다 ({bikes.length}/5)
        </p>
      )}
    </div>
  );
}
