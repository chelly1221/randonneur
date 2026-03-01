"use client";

import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/user/user-avatar";
import { Camera, MapPin, Bike, Route } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useEffect, useState } from "react";
import { UserPopover } from "@/components/user/user-popover";

interface JournalCardProps {
  journal: {
    id: string;
    title: string;
    content: string;
    rideDate: string | null;
    distance: number | null;
    createdAt: string;
    user: { id: string; displayName: string; avatarKey: string | null };
    course: { id: string; name: string } | null;
    _count: { photos: number };
    photos: { imageKey: string }[];
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/** Compute bounding box and SVG transform parameters for a set of coordinates. */
function computeSvgTransform(
  coords: [number, number][],
  width: number,
  height: number,
  padding: number
) {
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;

  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const lngRange = maxLng - minLng || 0.001;
  const latRange = maxLat - minLat || 0.001;

  const drawW = width - padding * 2;
  const drawH = height - padding * 2;

  // Maintain aspect ratio
  const scaleX = drawW / lngRange;
  const scaleY = drawH / latRange;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = padding + (drawW - lngRange * scale) / 2;
  const offsetY = padding + (drawH - latRange * scale) / 2;

  return { minLng, maxLat, scale, offsetX, offsetY };
}

/** Convert a single [lng, lat] point to SVG {x, y} using precomputed transform. */
function toSvgPoint(
  pt: [number, number],
  transform: ReturnType<typeof computeSvgTransform>
): { x: number; y: number } {
  return {
    x: transform.offsetX + (pt[0] - transform.minLng) * transform.scale,
    // Invert Y because SVG Y goes downward, but latitude goes upward
    y: transform.offsetY + (transform.maxLat - pt[1]) * transform.scale,
  };
}

/** Convert an array of [lng, lat] coordinates into an SVG path string,
 *  scaling them to fit within the given width x height with padding. */
function coordsToSvgPath(
  coords: [number, number][],
  transform: ReturnType<typeof computeSvgTransform>
): string {
  if (coords.length < 2) return "";

  const points = coords.map((coord) => {
    const { x, y } = toSvgPoint(coord, transform);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return `M${points.join("L")}`;
}

// In-memory cache for geometry data to avoid refetching on re-render
// and to deduplicate requests for the same course across multiple cards.
const geometryCache = new Map<
  string,
  { coords: [number, number][] | null; ts: number }
>();
const GEOMETRY_CACHE_TTL = 5 * 60_000; // 5 minutes

// Track in-flight requests to deduplicate concurrent fetches for the same course
const inflightRequests = new Map<
  string,
  Promise<[number, number][] | null>
>();

function fetchGeometry(
  courseId: string,
  signal: AbortSignal
): Promise<[number, number][] | null> {
  // Check cache first
  const cached = geometryCache.get(courseId);
  if (cached && Date.now() - cached.ts < GEOMETRY_CACHE_TTL) {
    return Promise.resolve(cached.coords);
  }

  // Deduplicate: if there's already an in-flight request for this course, reuse it
  const inflight = inflightRequests.get(courseId);
  if (inflight) return inflight;

  const promise = fetch(`/api/courses/${courseId}/geometry`, { signal })
    .then((res) => {
      if (!res.ok) throw new Error("fetch failed");
      return res.json();
    })
    .then((data) => {
      const coords: [number, number][] | null =
        data.coordinates && data.coordinates.length >= 2
          ? data.coordinates
          : null;
      geometryCache.set(courseId, { coords, ts: Date.now() });
      return coords;
    })
    .catch((e) => {
      // Don't cache abort errors — the request was cancelled, not failed
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      // Cache null for failures to avoid hammering a broken endpoint
      geometryCache.set(courseId, { coords: null, ts: Date.now() });
      return null;
    })
    .finally(() => {
      inflightRequests.delete(courseId);
    });

  inflightRequests.set(courseId, promise);
  return promise;
}

function MiniMapSkeleton() {
  return (
    <div className="w-[100px] h-[70px] sm:w-[120px] sm:h-[80px] rounded-md bg-t-subtle animate-pulse shrink-0" />
  );
}

function MiniMap({ courseId }: { courseId: string }) {
  const [coords, setCoords] = useState<[number, number][] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetchGeometry(courseId, controller.signal)
      .then((result) => {
        if (result) {
          setCoords(result);
        } else {
          setError(true);
        }
      })
      .catch((e) => {
        // AbortError means the component unmounted — do nothing
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [courseId]);

  if (loading) return <MiniMapSkeleton />;
  if (error || !coords) return null;

  const svgW = 120;
  const svgH = 80;
  const padding = 8;

  const transform = computeSvgTransform(coords, svgW, svgH, padding);
  const path = coordsToSvgPath(coords, transform);

  if (!path) return null;

  // Start and end points for markers
  const startSvg = toSvgPoint(coords[0], transform);
  const endSvg = toSvgPoint(coords[coords.length - 1], transform);

  return (
    <div className="relative w-[100px] h-[70px] sm:w-[120px] sm:h-[80px] rounded-md bg-t-faint border border-t-border/50 overflow-hidden shrink-0">
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Route path */}
        <path
          d={path}
          fill="none"
          stroke="#4fc3f7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
        {/* Start dot (green) */}
        <circle
          cx={startSvg.x}
          cy={startSvg.y}
          r="3"
          fill="#4caf50"
          stroke="white"
          strokeWidth="1"
        />
        {/* End dot (red) */}
        <circle
          cx={endSvg.x}
          cy={endSvg.y}
          r="3"
          fill="#e53935"
          stroke="white"
          strokeWidth="1"
        />
      </svg>
      {/* Route label overlay */}
      <span className="absolute bottom-0.5 right-1 flex items-center gap-0.5 text-[8px] text-t-muted opacity-70">
        <Route className="h-2 w-2" />
      </span>
    </div>
  );
}

export function JournalCard({ journal }: JournalCardProps) {
  const firstPhoto = journal.photos[0];
  const excerpt = stripHtml(journal.content);
  const hasCourse = !!journal.course;

  return (
    <Link href={`/community/journals/${journal.id}`}>
      <Card className="hover:border-sky-blue/30 transition-colors cursor-pointer overflow-hidden">
        <CardContent className="p-0">
          <div className="flex">
            {/* Thumbnail */}
            {firstPhoto && (
              <div className="relative w-24 h-24 sm:w-32 sm:h-32 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/images/${encodeURIComponent(firstPhoto.imageKey)}`}
                  alt={journal.title}
                  className="w-full h-full object-cover"
                />
                {journal._count.photos > 1 && (
                  <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">
                    <Camera className="h-2.5 w-2.5" />
                    {journal._count.photos}
                  </span>
                )}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 p-3 min-w-0">
              {/* Title */}
              <h3 className="text-sm font-semibold text-t-text truncate mb-1">
                {journal.title}
              </h3>

              {/* Author + date */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <UserPopover userId={journal.user.id} displayName={journal.user.displayName}>
                  <span className="inline-flex items-center gap-1.5">
                    <UserAvatar
                      displayName={journal.user.displayName}
                      avatarKey={journal.user.avatarKey}
                      size="sm"
                    />
                    <span className="text-[11px] text-t-muted hover:underline">
                      {journal.user.displayName}
                    </span>
                  </span>
                </UserPopover>
                <span className="text-[10px] text-t-muted">
                  {format(new Date(journal.createdAt), "M.d", { locale: ko })}
                </span>
              </div>

              {/* Mobile mini-map: shown below header, above excerpt */}
              {hasCourse && (
                <div className="mb-1.5 sm:hidden">
                  <MiniMap courseId={journal.course!.id} />
                </div>
              )}

              {/* Excerpt */}
              <p className="text-[11px] text-t-sub line-clamp-2 mb-1.5">
                {excerpt}
              </p>

              {/* Meta info */}
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-t-muted">
                {journal.course && (
                  <span className="flex items-center gap-0.5">
                    <MapPin className="h-2.5 w-2.5" />
                    {journal.course.name}
                  </span>
                )}
                {journal.distance && (
                  <span className="flex items-center gap-0.5">
                    <Bike className="h-2.5 w-2.5" />
                    {journal.distance}km
                  </span>
                )}
                {journal.rideDate && (
                  <span>
                    {format(new Date(journal.rideDate), "yyyy.M.d", { locale: ko })}
                  </span>
                )}
              </div>
            </div>

            {/* Desktop mini-map: shown on the right side */}
            {hasCourse && (
              <div className="hidden sm:flex items-center pr-3">
                <MiniMap courseId={journal.course!.id} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
