"use client";

import { useEffect, useRef, useState, useLayoutEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/course/favorite-button";
import { CompletionForm } from "@/components/course/completion-form";
import { interpolatePointOnLine } from "@/lib/geo-utils";
import { CATEGORIES } from "@/types";
import {
  ArrowRight,
  Mountain,
  Clock,
  MapPin,
  User,
  Download,
  ChevronUp,
} from "lucide-react";

interface CheckpointData {
  id: string;
  name: string;
  description: string | null;
  distanceKm: number;
  imageKey?: string | null;
}

interface CourseBasic {
  id: string;
  name: string;
  distanceKm: number;
  elevationM: number;
  region: string;
  category: string[];
  courseNumber: string | null;
}

export interface DetailData {
  elevations: { distance: number; elevation: number }[];
  geojson: GeoJSON.FeatureCollection | null;
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  checkpoints: CheckpointData[];
}

interface CourseInlineDetailProps {
  courseId: string;
  courseBasic: CourseBasic;
  onClose: () => void;
  onDataLoaded: (data: DetailData) => void;
  onHeaderHeightChange?: (height: number) => void;
}

export function CourseInlineDetail({
  courseId,
  courseBasic,
  onClose,
  onDataLoaded,
  onHeaderHeightChange,
}: CourseInlineDetailProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    course: {
      id: string;
      name: string;
      courseNumber: string | null;
      distanceKm: number;
      elevationM: number;
      estimatedTime: string | null;
      startLocation: string;
      endLocation: string;
      region: string;
      category: string[];
      tags: string[];
      description: string | null;
      designer: string | null;
      gpxFileKey: string | null;
      archived: boolean;
    };
    checkpoints: CheckpointData[];
    geojson: GeoJSON.FeatureCollection | null;
  } | null>(null);
  const [activeCheckpointId, setActiveCheckpointId] = useState<string | null>(null);
  const [checkpointViewMode, setCheckpointViewMode] = useState<"street" | "map">("street");

  const abortRef = useRef<AbortController | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setActiveCheckpointId(null);
    setCheckpointViewMode("street");

    fetch(`/api/courses/${courseId}/detail`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setDetail({
          course: data.course,
          checkpoints: data.checkpoints,
          geojson: data.geojson,
        });
        onDataLoaded({
          elevations: data.elevations,
          geojson: data.geojson,
          bounds: data.bounds,
          checkpoints: data.checkpoints,
        });
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError("코스 정보를 불러올 수 없습니다.");
        setLoading(false);
      });

    return () => controller.abort();
    // onDataLoaded is stable via useCallback in parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const course = detail?.course;
  const checkpoints = detail?.checkpoints ?? [];
  const categories = CATEGORIES.filter((c) =>
    (course?.category ?? courseBasic.category).includes(c.value)
  );

  useLayoutEffect(() => {
    if (!onHeaderHeightChange || !headerRef.current) return;

    const el = headerRef.current;
    const update = () => onHeaderHeightChange(el.offsetHeight);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => observer.disconnect();
  }, [onHeaderHeightChange, courseId, course?.name, course?.courseNumber]);

  return (
    <div className="flex min-h-0 flex-col lg:h-full">
      {/* Header — tap to close */}
      <div
        ref={headerRef}
        className="shrink-0 border-b border-t-border px-3 py-2 cursor-pointer hover:bg-t-hover transition-colors"
        onClick={onClose}
      >
        <h2 className="text-sm font-bold leading-tight flex items-center gap-1">
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-t-muted" />
          {categories.map((cat) => (
            <span key={cat.value} className="mr-1">{cat.emoji}</span>
          ))}
          {(course?.courseNumber ?? courseBasic.courseNumber) && (
            <span className="mr-1 text-t-muted font-normal text-xs">
              {course?.courseNumber ?? courseBasic.courseNumber}
            </span>
          )}
          {course?.name ?? courseBasic.name}
        </h2>
        <div className="flex flex-wrap items-center gap-1 mt-1">
          <Badge variant="primary" className="text-[10px]">
            {course?.region ?? courseBasic.region}
          </Badge>
          {categories.map((cat) => (
            <Badge key={cat.value} className="text-[10px]">{cat.label}</Badge>
          ))}
          {course?.tags?.map((tag) => (
            <Badge key={tag} className="text-[10px]">{tag}</Badge>
          ))}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="px-3 py-2 space-y-2">
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-12 rounded-lg bg-t-hover animate-pulse"
              />
            ))}
          </div>
        )}

        {error && (
          <div className="text-sm text-sky-red p-2 text-center">{error}</div>
        )}

        {!loading && !error && course && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-lg border border-t-border bg-t-surface px-2.5 py-1.5">
                <div className="flex items-center gap-1.5 text-[10px] text-t-muted">
                  <ArrowRight className="h-3 w-3" />
                  거리
                </div>
                <p className="text-sm font-semibold text-t-text">{course.distanceKm} km</p>
              </div>
              <div className="rounded-lg border border-t-border bg-t-surface px-2.5 py-1.5">
                <div className="flex items-center gap-1.5 text-[10px] text-t-muted">
                  <Mountain className="h-3 w-3" />
                  획득 고도
                </div>
                <p className="text-sm font-semibold text-t-text">{course.elevationM} m</p>
              </div>
              {course.estimatedTime && (
                <div className="rounded-lg border border-t-border bg-t-surface px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-t-muted">
                    <Clock className="h-3 w-3" />
                    예상 시간
                  </div>
                  <p className="text-sm font-semibold text-t-text">{course.estimatedTime}</p>
                </div>
              )}
              <div className="rounded-lg border border-t-border bg-t-surface px-2.5 py-1.5">
                <div className="flex items-center gap-1.5 text-[10px] text-t-muted">
                  <MapPin className="h-3 w-3" />
                  구간
                </div>
                <p className="text-xs font-semibold text-t-text leading-tight">
                  {course.startLocation} → {course.endLocation}
                </p>
              </div>
            </div>

            {/* Description + designer */}
            {(course.description || course.designer) && (
              <div className="text-xs text-t-sub space-y-1">
                {course.description && <p>{course.description}</p>}
                {course.designer && (
                  <span className="flex items-center gap-1 text-t-muted">
                    <User className="h-3 w-3" />
                    {course.designer}
                  </span>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <FavoriteButton courseId={courseId} />
              <CompletionForm courseId={courseId} />
              {course.gpxFileKey && (
                <a href={`/api/courses/${course.id}/gpx`}>
                  <Button variant="outline" size="sm">
                    <Download className="mr-1 h-3.5 w-3.5" />
                    GPX
                  </Button>
                </a>
              )}
            </div>

            {/* Checkpoints */}
            {checkpoints.length > 0 && (
              <div className="rounded-lg border border-t-border bg-t-surface px-2.5 py-2">
                <p className="text-[10px] font-medium text-t-muted mb-1.5">
                  체크포인트
                </p>
                <div className="space-y-1.5">
                  {checkpoints.map((cp, i) => (
                    <div key={cp.id} className="text-xs">
                      <div
                        role="button"
                        tabIndex={0}
                        className="flex w-full items-start gap-2 rounded px-1 py-1 text-left transition-colors hover:bg-t-hover cursor-pointer"
                        onClick={() => {
                          setActiveCheckpointId((prev) => {
                            const next = prev === cp.id ? null : cp.id;
                            if (next) setCheckpointViewMode("street");
                            return next;
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setActiveCheckpointId((prev) => {
                              const next = prev === cp.id ? null : cp.id;
                              if (next) setCheckpointViewMode("street");
                              return next;
                            });
                          }
                        }}
                      >
                        <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-sky-orange/20 text-[9px] font-bold text-sky-orange">
                          {i + 1}
                        </span>
                        {cp.imageKey && (
                          <a
                            href={`/api/images/${cp.imageKey}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/images/${cp.imageKey}`}
                              alt={cp.name}
                              className="h-8 w-8 rounded object-cover border border-t-border"
                              loading="lazy"
                            />
                          </a>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-t-text">{cp.name}</span>
                          <span className="text-t-muted">{cp.distanceKm} km</span>
                        </div>
                      </div>
                      {activeCheckpointId === cp.id && detail?.geojson && (
                        <div className="mt-1.5 overflow-hidden rounded border border-t-border">
                          {(() => {
                            const point = interpolatePointOnLine(detail.geojson, cp.distanceKm);
                            if (!point) {
                              return (
                                <div className="px-2 py-2 text-[11px] text-t-muted">
                                  좌표를 계산할 수 없습니다.
                                </div>
                              );
                            }
                            const [lng, lat] = point;
                            const streetSrc = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lng}&cbp=11,0,0,0,0&z=17&output=svembed`;
                            const mapSrc = `https://www.google.com/maps?q=${lat},${lng}&z=17&output=embed`;
                            const streetOpenUrl = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lng}&cbp=11,0,0,0,0&z=17`;
                            return (
                              <>
                                <div className="flex items-center gap-1 border-b border-t-border bg-t-bg px-2 py-1">
                                  <button
                                    type="button"
                                    className={`rounded px-2 py-0.5 text-[11px] ${
                                      checkpointViewMode === "street"
                                        ? "bg-sky-darkblue text-white"
                                        : "text-t-muted hover:bg-t-hover"
                                    }`}
                                    onClick={() => setCheckpointViewMode("street")}
                                  >
                                    스트리트뷰
                                  </button>
                                  <button
                                    type="button"
                                    className={`rounded px-2 py-0.5 text-[11px] ${
                                      checkpointViewMode === "map"
                                        ? "bg-sky-darkblue text-white"
                                        : "text-t-muted hover:bg-t-hover"
                                    }`}
                                    onClick={() => setCheckpointViewMode("map")}
                                  >
                                    지도
                                  </button>
                                  <a
                                    href={streetOpenUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-auto rounded px-2 py-0.5 text-[11px] text-t-muted hover:bg-t-hover"
                                  >
                                    새 탭
                                  </a>
                                </div>
                                <iframe
                                  title={`${cp.name} around view`}
                                  src={checkpointViewMode === "street" ? streetSrc : mapSrc}
                                  className="h-48 w-full"
                                  loading="lazy"
                                  referrerPolicy="no-referrer-when-downgrade"
                                  allowFullScreen
                                />
                              </>
                            );
                          })()}
                        </div>
                      )}
                      {activeCheckpointId === cp.id && !detail?.geojson && (
                        <div className="mt-1.5 rounded border border-t-border px-2 py-2 text-[11px] text-t-muted">
                          지도 데이터가 없습니다.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
