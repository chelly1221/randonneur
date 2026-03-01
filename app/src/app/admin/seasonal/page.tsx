"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Trash2, Plus, Search, Loader2 } from "lucide-react";

interface SeasonalPickData {
  id: string;
  courseId: string;
  season: string;
  year: number;
  description: string | null;
  sortOrder: number;
  course: {
    id: string;
    name: string;
    distanceKm: number;
    elevationM: number;
    region: string | null;
  };
}

interface CourseOption {
  id: string;
  name: string;
  distanceKm: number;
  region: string | null;
}

const seasons = [
  { value: "spring", label: "봄" },
  { value: "summer", label: "여름" },
  { value: "autumn", label: "가을" },
  { value: "winter", label: "겨울" },
] as const;

const seasonLabels: Record<string, string> = {
  spring: "봄",
  summer: "여름",
  autumn: "가을",
  winter: "겨울",
};

const seasonColors: Record<string, string> = {
  spring: "success",
  summer: "warning",
  autumn: "danger",
  winter: "primary",
};

export default function AdminSeasonalPage() {
  const [picks, setPicks] = useState<SeasonalPickData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );

  // Form state
  const [courseQuery, setCourseQuery] = useState("");
  const [courseResults, setCourseResults] = useState<CourseOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseOption | null>(
    null
  );
  const [formSeason, setFormSeason] = useState("spring");
  const [formYear, setFormYear] = useState(new Date().getFullYear());
  const [formDescription, setFormDescription] = useState("");
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchPicks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/seasonal");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setPicks(data);
    } catch {
      setPicks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPicks();
  }, [fetchPicks]);

  // Course search
  useEffect(() => {
    if (courseQuery.length < 1) {
      setCourseResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/courses?q=${encodeURIComponent(courseQuery)}&limit=10`
        );
        if (res.ok) {
          const data = await res.json();
          const courses = (data.courses ?? data) as CourseOption[];
          setCourseResults(
            courses.map((c: CourseOption) => ({
              id: c.id,
              name: c.name,
              distanceKm: c.distanceKm,
              region: c.region,
            }))
          );
        }
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [courseQuery]);

  async function handleAdd() {
    if (!selectedCourse) {
      setError("코스를 선택하세요.");
      return;
    }
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/seasonal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: selectedCourse.id,
          season: formSeason,
          year: formYear,
          description: formDescription || null,
          sortOrder: formSortOrder,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "추가에 실패했습니다.");
        return;
      }

      // Reset form
      setSelectedCourse(null);
      setCourseQuery("");
      setFormDescription("");
      setFormSortOrder(0);
      fetchPicks();
    } catch {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      const res = await fetch("/api/admin/seasonal", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        fetchPicks();
      }
    } catch {
      // ignore
    }
  }

  const filteredPicks = picks.filter((p) => {
    if (selectedSeason !== "all" && p.season !== selectedSeason) return false;
    if (p.year !== selectedYear) return false;
    return true;
  });

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">시즌 추천 관리</h1>

      {/* Add form */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4" />
            시즌 추천 추가
          </h2>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Course search */}
          <div>
            <label className="mb-1 block text-sm font-medium text-t-text">
              코스 검색
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t-muted" />
              <input
                type="text"
                value={courseQuery}
                onChange={(e) => {
                  setCourseQuery(e.target.value);
                  setSelectedCourse(null);
                }}
                placeholder="코스 이름으로 검색..."
                className="w-full rounded-md border border-t-border bg-t-surface py-2 pl-9 pr-3 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-t-muted" />
              )}
            </div>
            {selectedCourse && (
              <div className="mt-1 text-sm text-sky-blue">
                선택됨: {selectedCourse.name} ({selectedCourse.distanceKm} km)
              </div>
            )}
            {!selectedCourse && courseResults.length > 0 && (
              <div className="mt-1 rounded-md border border-t-border bg-t-surface shadow-lg max-h-48 overflow-y-auto">
                {courseResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCourse(c);
                      setCourseQuery(c.name);
                      setCourseResults([]);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-t-hover flex items-center justify-between"
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-t-muted">
                      {c.distanceKm} km
                      {c.region ? ` · ${c.region}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Season + Year row */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-t-text">
                시즌
              </label>
              <select
                value={formSeason}
                onChange={(e) => setFormSeason(e.target.value)}
                className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text focus:border-sky-blue focus:outline-none"
              >
                {seasons.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-t-text">
                연도
              </label>
              <input
                type="number"
                value={formYear}
                onChange={(e) => setFormYear(parseInt(e.target.value) || currentYear)}
                min={2020}
                max={2030}
                className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text focus:border-sky-blue focus:outline-none"
              />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-sm font-medium text-t-text">
                정렬순서
              </label>
              <input
                type="number"
                value={formSortOrder}
                onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
                min={0}
                className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text focus:border-sky-blue focus:outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-t-text">
              추천 설명 (선택)
            </label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={2}
              placeholder="이 코스를 추천하는 이유..."
              className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-sky-red">{error}</p>
          )}

          <button
            onClick={handleAdd}
            disabled={submitting || !selectedCourse}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium text-white transition-colors",
              submitting || !selectedCourse
                ? "bg-sky-darkblue/50 cursor-not-allowed"
                : "bg-sky-darkblue hover:bg-sky-darkblue/80"
            )}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                추가 중...
              </span>
            ) : (
              "추가"
            )}
          </button>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          <button
            onClick={() => setSelectedSeason("all")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              selectedSeason === "all"
                ? "bg-sky-darkblue text-white"
                : "bg-t-subtle text-t-muted hover:text-t-text"
            )}
          >
            전체
          </button>
          {seasons.map((s) => (
            <button
              key={s.value}
              onClick={() => setSelectedSeason(s.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                selectedSeason === s.value
                  ? "bg-sky-darkblue text-white"
                  : "bg-t-subtle text-t-muted hover:text-t-text"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          className="rounded-md border border-t-border bg-t-surface px-2 py-1 text-xs text-t-text focus:outline-none"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
      </div>

      {/* Picks list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-t-subtle"
            />
          ))}
        </div>
      ) : filteredPicks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-t-muted">
            등록된 시즌 추천이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredPicks.map((pick) => (
            <Card key={pick.id}>
              <CardContent className="flex items-center gap-3 py-3 px-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {pick.course.name}
                    </span>
                    <Badge
                      variant={
                        seasonColors[pick.season] as
                          | "success"
                          | "warning"
                          | "danger"
                          | "primary"
                      }
                      className="text-[9px]"
                    >
                      {seasonLabels[pick.season]}
                    </Badge>
                    <span className="text-[10px] text-t-muted">
                      {pick.year}년
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-t-muted">
                    <span>{pick.course.distanceKm} km</span>
                    <span>·</span>
                    <span>{pick.course.elevationM} m</span>
                    {pick.course.region && (
                      <>
                        <span>·</span>
                        <span>{pick.course.region}</span>
                      </>
                    )}
                    {pick.description && (
                      <>
                        <span>·</span>
                        <span className="truncate">{pick.description}</span>
                      </>
                    )}
                    <span className="text-t-faint">
                      순서: {pick.sortOrder}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(pick.id)}
                  className="shrink-0 rounded-md p-1.5 text-t-muted hover:bg-sky-red/10 hover:text-sky-red transition-colors"
                  title="삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
