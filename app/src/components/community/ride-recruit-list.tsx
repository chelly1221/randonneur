"use client";

import { useState, useEffect, useCallback } from "react";
import { RideRecruitCard } from "./ride-recruit-card";
import { RideRecruitForm } from "./ride-recruit-form";
import { Users } from "lucide-react";

interface RideRecruitListProps {
  isLoggedIn: boolean;
}

interface RecruitItem {
  id: string;
  title: string;
  description: string | null;
  rideDate: string;
  meetingPoint: string | null;
  maxMembers: number;
  status: string;
  createdAt: string;
  participantCount: number;
  user: { id: string; displayName: string; avatarKey: string | null };
  course: { id: string; name: string; distanceKm: number; region: string | null } | null;
}

export function RideRecruitList({ isLoggedIn }: RideRecruitListProps) {
  const [recruits, setRecruits] = useState<RecruitItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [showForm, setShowForm] = useState(false);

  const fetchRecruits = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      params.set("limit", "20");

      const res = await fetch(`/api/ride-recruits?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecruits(data.items);
        setTotal(data.total);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchRecruits();
  }, [fetchRecruits]);

  const handleCreated = () => {
    setShowForm(false);
    setStatusFilter("open");
    fetchRecruits();
  };

  return (
    <div className="space-y-4">
      {/* Filter bar + create button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {[
            { value: "open", label: "모집중" },
            { value: "closed", label: "마감" },
            { value: "all", label: "전체" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? "bg-sky-darkblue text-white"
                  : "bg-t-subtle text-t-muted hover:bg-t-hover"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {isLoggedIn && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-darkblue px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-darkblue/90 transition-colors"
          >
            <Users className="h-3.5 w-3.5" />
            동행 모집하기
          </button>
        )}
      </div>

      {/* Creation form */}
      {showForm && (
        <RideRecruitForm
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Results info */}
      {!loading && (
        <p className="text-xs text-t-muted">
          {total}개의 모집글
        </p>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-lg border border-t-border bg-t-subtle"
            />
          ))}
        </div>
      ) : recruits.length === 0 ? (
        <div className="py-12 text-center text-sm text-t-muted">
          {statusFilter === "open"
            ? "현재 모집중인 동행이 없습니다."
            : "모집글이 없습니다."}
        </div>
      ) : (
        <div className="space-y-3">
          {recruits.map((recruit) => (
            <RideRecruitCard key={recruit.id} recruit={recruit} />
          ))}
        </div>
      )}
    </div>
  );
}
