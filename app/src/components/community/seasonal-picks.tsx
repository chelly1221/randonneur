"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Leaf, Sun, CloudRain, Snowflake } from "lucide-react";

interface SeasonalCourse {
  id: string;
  name: string;
  distanceKm: number;
  elevationM: number;
  region: string | null;
  startLocation: string;
  description: string | null;
}

interface SeasonalPickItem {
  id: string;
  description: string | null;
  sortOrder: number;
  course: SeasonalCourse;
}

interface SeasonalResponse {
  season: string;
  year: number;
  picks: SeasonalPickItem[];
}

const seasonLabels: Record<string, string> = {
  spring: "봄 추천 코스",
  summer: "여름 추천 코스",
  autumn: "가을 추천 코스",
  winter: "겨울 추천 코스",
};

const seasonIcons: Record<string, React.ReactNode> = {
  spring: <Leaf className="h-4 w-4 text-green-500" />,
  summer: <Sun className="h-4 w-4 text-sky-yellow" />,
  autumn: <CloudRain className="h-4 w-4 text-sky-orange" />,
  winter: <Snowflake className="h-4 w-4 text-sky-blue" />,
};

export function SeasonalPicks() {
  const [data, setData] = useState<SeasonalResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/seasonal")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-36 w-72 shrink-0 animate-pulse rounded-lg bg-t-subtle"
          />
        ))}
      </div>
    );
  }

  if (!data || data.picks.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-t-muted">
          이번 시즌 추천 코스가 아직 없습니다
        </CardContent>
      </Card>
    );
  }

  const season = data.season;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {seasonIcons[season]}
        <span className="text-sm font-medium text-t-muted">
          {seasonLabels[season] ?? "추천 코스"} ({data.year})
        </span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        {data.picks.map((pick) => (
          <Link
            key={pick.id}
            href={`/courses/${pick.course.id}`}
            className="shrink-0"
          >
            <Card className="w-72 hover:border-t-accent transition-colors">
              <CardContent className="py-3">
                <h3 className="text-sm font-medium truncate">
                  {pick.course.name}
                </h3>
                <p className="mt-1 text-xs text-t-muted">
                  {pick.course.distanceKm} km · {pick.course.elevationM} m
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  {pick.course.region && (
                    <Badge variant="primary" className="text-[9px]">
                      {pick.course.region}
                    </Badge>
                  )}
                  <span className="text-[9px] text-t-faint">
                    {pick.course.startLocation}
                  </span>
                </div>
                {(pick.description || pick.course.description) && (
                  <p className="mt-2 text-[11px] text-t-muted line-clamp-2">
                    {pick.description || pick.course.description}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
