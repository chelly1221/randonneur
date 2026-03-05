"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bike } from "lucide-react";

interface BeginnerCourse {
  id: string;
  slug: string;
  name: string;
  distanceKm: number | null;
  elevationM: number | null;
  region: string | null;
  country: string | null;
}

export default function BeginnerCourses({ country }: { country?: string } = {}) {
  const [courses, setCourses] = useState<BeginnerCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/home/beginner-courses${country ? `?country=${country}` : ""}`)
      .then((res) => res.json())
      .then((json) => {
        if (Array.isArray(json)) setCourses(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [country]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="h-5 w-36 animate-pulse bg-t-subtle rounded" />
          <div className="h-3 w-52 animate-pulse bg-t-subtle rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse bg-t-subtle rounded-lg"
            />
          ))}
        </div>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="rounded-lg border border-t-border bg-t-surface p-4 text-t-muted text-sm">
        추천 코스가 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-t-text flex items-center gap-2">
          <Bike className="w-4 h-4 text-sky-blue" />
          초보자 추천 코스
        </h3>
        <p className="text-xs text-t-muted mt-0.5">
          200~250km · 낮은 고도 · 입문용
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {courses.map((course) => (
          <Link
            key={course.id}
            href={`/courses/${course.slug}`}
            className="rounded-lg border border-t-border p-3 hover:bg-t-hover transition-colors block"
          >
            <p className="font-medium text-sm text-t-text truncate">
              {course.name}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              {course.distanceKm != null && (
                <span className="bg-sky-blue/10 text-sky-blue rounded px-2 py-0.5 text-xs font-medium">
                  {course.distanceKm}km
                </span>
              )}
              {course.elevationM != null && (
                <span className="text-xs text-t-muted">
                  {course.elevationM}m
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              {course.country && (
                <img
                  src={`https://flagcdn.com/w20/${course.country.toLowerCase()}.png`}
                  alt={course.country}
                  className="w-3.5 h-auto rounded-sm"
                />
              )}
              {course.region && (
                <span className="text-xs text-t-muted">{course.region}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
