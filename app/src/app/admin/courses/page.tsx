"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Plus, Pencil, Search, Loader2 } from "lucide-react";
import Link from "next/link";
import { DeleteCourseButton } from "@/components/admin/delete-course-button";
import { ArchiveToggleButton } from "@/components/admin/archive-toggle-button";

interface CourseItem {
  id: string;
  courseNumber: string | null;
  name: string;
  distanceKm: number;
  elevationM: number;
  region: string | null;
  country: string | null;
  gpxFileKey: string | null;
  archived: boolean;
  sourceType: string | null;
  createdAt: string;
}

const COUNTRY_LABELS: Record<string, string> = {
  KR: "한국",
  AU: "호주",
  BE: "벨기에",
  CA: "캐나다",
  DE: "독일",
  DK: "덴마크",
  ES: "스페인",
  FR: "프랑스",
  GB: "영국",
  IE: "아일랜드",
  IT: "이탈리아",
  JP: "일본",
  NO: "노르웨이",
  NZ: "뉴질랜드",
  US: "미국",
  ZA: "남아공",
};

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [country, setCountry] = useState("");
  const [archived, setArchived] = useState(""); // "", "true", "false"

  const observerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const fetchCourses = useCallback(
    async (cursor?: string | null) => {
      const isInitial = !cursor;
      if (isInitial) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const params = new URLSearchParams();
      params.set("limit", "20");
      if (search) params.set("search", search);
      if (country) params.set("country", country);
      if (archived) params.set("archived", archived);
      if (cursor) params.set("cursor", cursor);

      try {
        const res = await fetch(`/api/admin/courses?${params}`);
        const data = await res.json();

        if (isInitial) {
          setCourses(data.courses);
        } else {
          setCourses((prev) => [...prev, ...data.courses]);
        }
        setTotal(data.total);
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      } finally {
        if (isInitial) {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
        loadingRef.current = false;
      }
    },
    [search, country, archived]
  );

  // Initial load and filter changes
  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = observerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
          loadingRef.current = true;
          fetchCourses(nextCursor);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, fetchCourses]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">코스 관리</h1>
          <span className="text-sm text-t-muted">
            {total.toLocaleString()}개
          </span>
        </div>
        <Link href="/admin/courses/new">
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            새 코스
          </Button>
        </Link>
      </div>

      {/* Search and filters */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-t-muted">
                검색
              </label>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="코스명, 번호, 출발지..."
                className="w-64 rounded border border-t-border bg-t-surface px-3 py-1.5 text-sm placeholder:text-t-faint"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" size="sm">
                <Search className="h-3.5 w-3.5" />
              </Button>
            </div>
          </form>
          <div>
            <label className="mb-1 block text-xs font-medium text-t-muted">
              국가
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="rounded border border-t-border bg-t-surface px-3 py-1.5 text-sm"
            >
              <option value="">전체</option>
              {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label} ({code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-t-muted">
              상태
            </label>
            <select
              value={archived}
              onChange={(e) => setArchived(e.target.value)}
              className="rounded border border-t-border bg-t-surface px-3 py-1.5 text-sm"
            >
              <option value="">전체</option>
              <option value="false">공개</option>
              <option value="true">보관</option>
            </select>
          </div>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-t-border bg-t-subtle">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  코스번호
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  이름
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  거리
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  고도
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  국가
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  지역
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  GPX
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  상태
                </th>
                <th className="px-4 py-3 text-right font-medium text-t-muted">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-t-divider">
              {loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-t-faint"
                  >
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : courses.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-t-faint"
                  >
                    {search || country || archived
                      ? "검색 결과가 없습니다."
                      : "등록된 코스가 없습니다."}
                  </td>
                </tr>
              ) : (
                courses.map((course) => (
                  <tr key={course.id} className="hover:bg-t-hover">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-t-muted">
                      {course.courseNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/courses/${course.id}`}
                        className="font-medium hover:text-t-link"
                      >
                        {course.name}
                      </Link>
                      {course.sourceType && (
                        <span className="ml-1 text-[10px] text-t-faint">
                          [{course.sourceType}]
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{course.distanceKm} km</td>
                    <td className="px-4 py-3">{course.elevationM} m</td>
                    <td className="px-4 py-3">
                      {course.country ? (
                        <Badge variant="default">{course.country}</Badge>
                      ) : (
                        <span className="text-t-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {course.region ? (
                        <Badge variant="primary">{course.region}</Badge>
                      ) : (
                        <span className="text-t-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {course.gpxFileKey ? (
                        <Badge variant="success">있음</Badge>
                      ) : (
                        <Badge variant="default">없음</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {course.archived ? (
                        <Badge variant="default">보관</Badge>
                      ) : (
                        <Badge variant="success">공개</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <ArchiveToggleButton
                          courseId={course.id}
                          archived={course.archived}
                          onSuccess={() => fetchCourses()}
                        />
                        <Link href={`/admin/courses/${course.id}/edit`}>
                          <Button variant="ghost" size="sm">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <DeleteCourseButton
                          courseId={course.id}
                          onSuccess={() => fetchCourses()}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Infinite scroll sentinel + loading indicator */}
        <div ref={observerRef} className="h-1" />
        {loadingMore && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-t-muted" />
          </div>
        )}
        {!loading && courses.length > 0 && !hasMore && (
          <div className="py-3 text-center text-xs text-t-faint">
            전체 {total.toLocaleString()}개 코스 표시 완료
          </div>
        )}
      </Card>
    </div>
  );
}
