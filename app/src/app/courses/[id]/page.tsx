import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CourseDetailClient } from "@/components/course/course-detail-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompletionForm } from "@/components/course/completion-form";
import { CATEGORIES } from "@/types";
import { normalizeElevationRenderData } from "@/lib/elevation-render";
import {
  Download,
  ArrowLeft,
  ArrowRight,
  Mountain,
  Clock,
  MapPin,
  User,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { FavoriteButton } from "@/components/course/favorite-button";
import { ShareButton } from "@/components/course/share-button";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const course = await prisma.course.findUnique({
    where: { id },
    select: { name: true, distanceKm: true, elevationM: true, region: true, startLocation: true },
  });

  if (!course) return { title: "코스를 찾을 수 없습니다" };

  const title = `${course.name} (${course.distanceKm}km)`;
  const description = `${course.startLocation} 출발, ${course.distanceKm}km, ${course.elevationM}m 획득고도${course.region ? ` — ${course.region}` : ""}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
  };
}

function buildOfficialPageUrl(courseNumber: string | null | undefined): string | null {
  if (!courseNumber) return null;
  const pt = courseNumber.match(/^PT-(\d+)(R?)$/i);
  if (pt) {
    const n = Number.parseInt(pt[1], 10);
    if (!Number.isFinite(n)) return null;
    const digits = n < 100 ? String(n).padStart(2, "0") : String(n);
    const suffix = pt[2] ? "R" : "";
    return `http://www.korearandonneurs.kr:8080/jsp/permanent/info-PT${digits}${suffix}.htm`;
  }

  const sr = courseNumber.match(/^SR-(\d+)$/i);
  if (sr) {
    const n = Number.parseInt(sr[1], 10);
    if (!Number.isFinite(n)) return null;
    const digits = n < 100 ? String(n).padStart(2, "0") : String(n);
    return `http://www.korearandonneurs.kr:8080/jsp/superrando/info-SR${digits}.htm`;
  }

  return null;
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CourseDetailPage({ params }: Props) {
  const { id } = await params;

  const [course, checkpoints, geoResult] = await Promise.all([
    prisma.course.findUnique({ where: { id } }),
    prisma.checkpoint.findMany({
      where: { courseId: id },
      orderBy: { distanceKm: "asc" },
    }),
    prisma.$queryRawUnsafe<{ geojson: string }[]>(
      `SELECT ST_AsGeoJSON(geom) as geojson FROM courses WHERE id = $1::uuid`,
      id
    ),
  ]);

  if (!course) notFound();

  let geojsonParsed: GeoJSON.FeatureCollection | null = null;
  let bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null = null;

  if (geoResult[0]?.geojson) {
    const geom = JSON.parse(geoResult[0].geojson);
    geojsonParsed = {
      type: "FeatureCollection" as const,
      features: [{ type: "Feature" as const, geometry: geom, properties: {} }],
    };
    if (geom.coordinates) {
      let minLat = Infinity,
        maxLat = -Infinity,
        minLng = Infinity,
        maxLng = -Infinity;
      for (const [lng, lat] of geom.coordinates) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
      bounds = { minLat, maxLat, minLng, maxLng };
    }
  }

  const categories = CATEGORIES.filter((c) => course.category.includes(c.value));
  const elevationData = normalizeElevationRenderData(course.elevationProfile);
  const officialPageUrl = course.officialPageUrl ?? buildOfficialPageUrl(course.courseNumber);

  const cpData = checkpoints.map((cp) => ({
    id: cp.id,
    name: cp.name,
    description: cp.description,
    distanceKm: cp.distanceKm,
    imageKey: cp.imageKey,
  }));

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col px-4 py-3 lg:py-3">
      {/* Header row */}
      <div className="mx-auto mb-2 flex w-full max-w-7xl flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link
            href="/courses"
            className="inline-flex items-center gap-1 text-sm text-t-muted hover:text-t-text"
          >
            <ArrowLeft className="h-4 w-4" />
            목록
          </Link>
          <h1 className="text-xl font-bold lg:text-2xl">
            {categories.map((cat) => <span key={cat.value} className="mr-1">{cat.emoji}</span>)}
            {course.name}
            {course.archived && <span className="ml-1 text-sm font-normal text-t-muted">(구)</span>}
          </h1>
          <Badge variant="primary">{course.region}</Badge>
          {categories.map((cat) => <Badge key={cat.value}>{cat.label}</Badge>)}
          {course.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ShareButton courseId={id} courseName={course.name} courseDistance={course.distanceKm} />
          <FavoriteButton courseId={id} />
          <CompletionForm courseId={id} />
          {course.gpxFileKey && (
            <a href={`/api/courses/${course.id}/gpx`}>
              <Button variant="outline" size="sm">
                <Download className="mr-1 h-4 w-4" />
                GPX
              </Button>
            </a>
          )}
          {officialPageUrl && !course.archived && (
            <a href={officialPageUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-1 h-4 w-4" />
                공식 페이지
              </Button>
            </a>
          )}
        </div>
      </div>

      {(course.description || course.designer) && (
        <div className="mx-auto mb-2 w-full max-w-7xl flex items-center gap-3 text-sm text-t-sub">
          {course.description && <p>{course.description}</p>}
          {course.designer && (
            <span className="flex items-center gap-1 text-xs text-t-muted">
              <User className="h-3 w-3" />
              {course.designer}
            </span>
          )}
        </div>
      )}

      {/* Map + Stats row */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-3 overflow-hidden lg:flex-row flex-col min-h-0">
        <CourseDetailClient
          geojson={geojsonParsed}
          bounds={bounds}
          elevations={elevationData.points}
          checkpoints={cpData}
          compact
        />

        {/* Stats sidebar */}
        <div className="flex w-full shrink-0 flex-col gap-2 lg:w-72">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-1">
            <div className="rounded-lg border border-t-border bg-t-surface px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-t-muted">
                <ArrowRight className="h-3.5 w-3.5" />
                거리
              </div>
              <p className="font-semibold text-t-text">{course.distanceKm} km</p>
            </div>
            <div className="rounded-lg border border-t-border bg-t-surface px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-t-muted">
                <Mountain className="h-3.5 w-3.5" />
                획득 고도
              </div>
              <p className="font-semibold text-t-text">{course.elevationM} m</p>
            </div>
            {course.estimatedTime && (
              <div className="rounded-lg border border-t-border bg-t-surface px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-t-muted">
                  <Clock className="h-3.5 w-3.5" />
                  제한 시간
                </div>
                <p className="font-semibold text-t-text">{course.estimatedTime}</p>
              </div>
            )}
            <div className="rounded-lg border border-t-border bg-t-surface px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-t-muted">
                <MapPin className="h-3.5 w-3.5" />
                구간
              </div>
              <p className="font-semibold text-t-text text-sm">{course.startLocation} → {course.endLocation}</p>
            </div>
          </div>

          {/* Checkpoint list */}
          {cpData.length > 0 && (
            <div className="rounded-lg border border-t-border bg-t-surface px-3 py-2 overflow-y-auto max-h-[40vh] lg:max-h-none lg:flex-1 lg:min-h-0">
              <p className="text-xs font-medium text-t-muted mb-2">체크포인트</p>
              <div className="space-y-1.5">
                {cpData.map((cp, i) => (
                  <div key={cp.id} className="flex items-start gap-2 text-xs">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-orange/20 text-[10px] font-bold text-sky-orange mt-0.5">
                      {i + 1}
                    </span>
                    {cp.imageKey && (
                      <a
                        href={`/api/images/${cp.imageKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/images/${cp.imageKey}`}
                          alt={cp.name}
                          className="h-10 w-10 rounded object-cover border border-t-border"
                          loading="lazy"
                        />
                      </a>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="block truncate text-t-text">{cp.name}</span>
                      <span className="text-t-muted">{cp.distanceKm.toFixed(1)} km</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
