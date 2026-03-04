"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe, MapPin, Mountain, Route } from "lucide-react";

const COUNTRY_NAMES: Record<string, string> = {
  AU: "호주",
  KR: "한국",
  CA: "캐나다",
  US: "미국",
  GB: "영국",
  BE: "벨기에",
  IE: "아일랜드",
  IT: "이탈리아",
  JP: "일본",
  DE: "독일",
  NO: "노르웨이",
  NZ: "뉴질랜드",
  ES: "스페인",
  DK: "덴마크",
  FR: "프랑스",
  ZA: "남아공",
};

interface SampleCourse {
  id: string;
  name: string;
  distanceKm: number | null;
  elevationM: number | null;
  region: string | null;
}

interface SpotlightData {
  country: string;
  courseCount: number;
  totalDistance: number;
  avgElevation: number;
  sampleCourses: SampleCourse[];
}

export default function CountrySpotlight() {
  const [data, setData] = useState<SpotlightData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/home/country-spotlight")
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-t-border bg-t-surface p-4">
        <div className="h-40 animate-pulse bg-t-subtle rounded" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-t-border bg-t-surface p-4 text-t-muted text-sm">
        데이터가 없습니다
      </div>
    );
  }

  const countryName = COUNTRY_NAMES[data.country] ?? data.country;

  return (
    <div className="rounded-lg border border-t-border bg-t-surface border-l-4 border-l-sky-blue overflow-hidden">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <img
            src={`https://flagcdn.com/w80/${data.country.toLowerCase()}.png`}
            alt={countryName}
            className="w-10 h-7 rounded object-cover shadow-sm"
          />
          <div>
            <h3 className="font-semibold text-t-text text-lg">{countryName}</h3>
            <p className="text-xs text-t-muted flex items-center gap-1">
              <Globe className="w-3 h-3" />
              이번 주의 국가
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-t-subtle rounded-full px-3 py-1">
            <Route className="w-3.5 h-3.5 text-sky-blue" />
            <span className="text-sm font-medium text-t-text">
              {data.courseCount.toLocaleString()}
            </span>
            <span className="text-xs text-t-muted">코스</span>
          </div>
          <div className="flex items-center gap-1.5 bg-t-subtle rounded-full px-3 py-1">
            <MapPin className="w-3.5 h-3.5 text-sky-blue" />
            <span className="text-sm font-medium text-t-text">
              {data.totalDistance.toLocaleString()}
            </span>
            <span className="text-xs text-t-muted">km</span>
          </div>
          <div className="flex items-center gap-1.5 bg-t-subtle rounded-full px-3 py-1">
            <Mountain className="w-3.5 h-3.5 text-sky-blue" />
            <span className="text-sm font-medium text-t-text">
              {data.avgElevation.toLocaleString()}
            </span>
            <span className="text-xs text-t-muted">m 평균고도</span>
          </div>
        </div>

        {/* Sample Courses */}
        {data.sampleCourses.length > 0 && (
          <ul className="space-y-2">
            {data.sampleCourses.map((course) => (
              <li key={course.id}>
                <Link
                  href={`/courses/${course.id}`}
                  className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-t-hover transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-t-text truncate group-hover:text-sky-blue transition-colors">
                      {course.name}
                    </p>
                    {course.region && (
                      <p className="text-xs text-t-muted">{course.region}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {course.distanceKm != null && (
                      <span className="text-xs text-t-muted">
                        {course.distanceKm}km
                      </span>
                    )}
                    {course.elevationM != null && (
                      <span className="text-xs text-t-muted">
                        {course.elevationM}m
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* More Link */}
        <div className="pt-1">
          <Link
            href={`/courses/world?country=${data.country}`}
            className="text-sm text-sky-blue hover:text-sky-blue/80 font-medium transition-colors"
          >
            더 보기 →
          </Link>
        </div>
      </div>
    </div>
  );
}
