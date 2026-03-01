"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface PopularCourse {
  id: string;
  name: string;
  distanceKm: number;
  elevationM: number;
  startLocation: string;
  region: string | null;
  score: number;
}

export function PopularCourses({ compact = false, limit = 6 }: { compact?: boolean; limit?: number }) {
  const [courses, setCourses] = useState<PopularCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/courses/popular?limit=${limit}`)
      .then((r) => r.json())
      .then(setCourses)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    if (compact) {
      return (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-t-subtle" />
          ))}
        </div>
      );
    }
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 w-64 shrink-0 animate-pulse rounded-lg bg-t-subtle" />
        ))}
      </div>
    );
  }

  if (courses.length === 0) return null;

  if (compact) {
    return (
      <div className="divide-y divide-t-border rounded-lg border border-t-border overflow-hidden">
        {courses.map((course, i) => (
          <Link
            key={course.id}
            href={`/courses/${course.id}`}
            className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-t-hover transition-colors"
          >
            <span className="text-xs font-bold text-t-muted/40 w-4 text-center shrink-0">
              {i + 1}
            </span>
            <span className="text-[11px] font-medium truncate min-w-0 flex-1">{course.name}</span>
            <span className="text-[9px] text-t-faint shrink-0">{course.distanceKm}km</span>
            {course.region && (
              <Badge variant="primary" className="text-[8px] px-1 py-0 shrink-0">
                {course.region}
              </Badge>
            )}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
      {courses.map((course) => (
        <Link key={course.id} href={`/courses/${course.id}`} className="shrink-0">
          <Card className="w-64 hover:border-t-accent transition-colors">
            <CardContent className="py-3">
              <h3 className="text-sm font-medium truncate">{course.name}</h3>
              <p className="mt-1 text-xs text-t-muted">
                {course.distanceKm} km · {course.elevationM} m
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                {course.region && (
                  <Badge variant="primary" className="text-[9px]">{course.region}</Badge>
                )}
                <span className="text-[9px] text-t-faint">{course.startLocation}</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
