"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Sparkles } from "lucide-react";

interface CourseRec {
  id: string;
  slug: string;
  name: string;
  distanceKm: number;
  elevationM: number;
  startLocation: string;
  region: string | null;
}

export function CourseRecommendations({ country }: { country?: string } = {}) {
  const { data: session } = useSession();
  const [courses, setCourses] = useState<CourseRec[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/courses/recommendations?limit=6${country ? `&country=${country}` : ""}`)
      .then((r) => r.json())
      .then((data) => setCourses(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session]);

  if (!loading && courses.length === 0) return null;

  if (loading) {
    return (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-sky-yellow" />
          <h3 className="text-sm font-medium text-t-muted">추천 코스</h3>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 w-64 shrink-0 animate-pulse rounded-lg bg-t-subtle"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-sky-yellow" />
        <h3 className="text-sm font-medium text-t-muted">추천 코스</h3>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        {courses.map((course) => (
          <Link
            key={course.id}
            href={`/courses/${course.slug}`}
            className="shrink-0"
          >
            <Card className="w-64 hover:border-t-accent transition-colors">
              <CardContent className="py-3">
                <h3 className="text-sm font-medium truncate">{course.name}</h3>
                <p className="mt-1 text-xs text-t-muted">
                  {course.distanceKm} km · {course.elevationM} m
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  {course.region && (
                    <Badge variant="primary" className="text-[9px]">
                      {course.region}
                    </Badge>
                  )}
                  <span className="text-[9px] text-t-faint">
                    {course.startLocation}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
