"use client";

import { useEffect, useRef, useState, useLayoutEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/course/favorite-button";
import { CompletionForm } from "@/components/course/completion-form";
import { interpolatePointOnLine } from "@/lib/geo-utils";
import { CATEGORIES } from "@/types";
import {
  User,
  Download,
  ChevronUp,
  ExternalLink,
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
  region: string | null;
  category: string[];
  courseNumber: string | null;
}

export interface DetailData {
  elevations: { distance: number; elevation: number }[];
  elevationBands?: { from: number; to: number; color: string }[];
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

export function CourseInlineDetail({
  courseId,
  courseBasic,
  onClose,
  onDataLoaded,
  onHeaderHeightChange,
}: CourseInlineDetailProps) {
  const normalizeCheckpointName = (name: string) =>
    name.replace(/^\s*CP\s*[-_]?\s*\d+\s*[:.)-]?\s*/i, "").trim() || name;

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
      region: string | null;
      category: string[];
      tags: string[];
      description: string | null;
      designer: string | null;
      officialPageUrl: string | null;
      gpxFileKey: string | null;
      archived: boolean;
    };
    checkpoints: CheckpointData[];
    geojson: GeoJSON.FeatureCollection | null;
  } | null>(null);
  const [activeCheckpointId, setActiveCheckpointId] = useState<string | null>(null);
  const [checkpointViewMode, setCheckpointViewMode] = useState<"street" | "map">("street");
  const [previewImage, setPreviewImage] = useState<{ key: string; name: string } | null>(null);

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
    setPreviewImage(null);

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
          elevationBands: data.elevationBands ?? [],
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
  const officialPageUrl =
    course?.officialPageUrl ??
    buildOfficialPageUrl(course?.courseNumber ?? courseBasic.courseNumber);
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
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-bold leading-tight flex items-center gap-1 min-w-0">
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-t-muted" />
              {(course?.courseNumber ?? courseBasic.courseNumber) && (
                <span className="mr-1 text-t-muted font-normal text-xs">
                  {course?.courseNumber ?? courseBasic.courseNumber}
                </span>
              )}
              <span className="truncate">{course?.name ?? courseBasic.name}</span>
              {course?.archived && <span className="ml-1 text-[11px] font-normal text-t-muted">(구)</span>}
            </h2>
          </div>
          {(course?.gpxFileKey || (officialPageUrl && course && !course.archived)) && (
            <div className="shrink-0 flex items-center gap-1">
              {course?.gpxFileKey && (
                <a
                  href={`/api/courses/${course.id}/gpx`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex"
                >
                  <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]">
                    <Download className="mr-1 h-3.5 w-3.5" />
                    GPX
                  </Button>
                </a>
              )}
              {officialPageUrl && course && !course.archived && (
                <a
                  href={officialPageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex"
                >
                  <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]">
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                    공식
                  </Button>
                </a>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1 mt-1">
          <Badge variant="primary" className="text-[10px]">
            {course?.region ?? courseBasic.region}
          </Badge>
          {categories.map((cat) => (
            <Badge key={cat.value} className="text-[10px]">
              {cat.label}
            </Badge>
          ))}
          {course?.tags?.map((tag) => (
            <Badge key={tag} className="text-[10px]">{tag}</Badge>
          ))}
          {course?.designer && (
            <Badge className="text-[10px] inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {course.designer}
            </Badge>
          )}
          <span className="ml-auto -mb-2 text-[11px] text-t-muted whitespace-nowrap">
            {course?.startLocation} → {course?.endLocation}
          </span>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 space-y-1 scrollbar-hidden">
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
            {/* Compact metrics (option 2: value-first) */}
            <div className="rounded-lg border border-t-border bg-t-surface/70 px-2.5 py-1.5">
              <div
                className={`grid gap-x-2 ${
                  course.estimatedTime ? "grid-cols-3" : "grid-cols-2"
                }`}
              >
                <div className="text-center">
                  <div className="text-base font-semibold text-t-text">{Math.round(course.distanceKm)}km</div>
                  <div className="text-[10px] text-t-muted">거리</div>
                </div>
                <div className="text-center">
                  <div className="text-base font-semibold text-t-text">{course.elevationM.toLocaleString()}m</div>
                  <div className="text-[10px] text-t-muted">획득고도</div>
                </div>
                {course.estimatedTime && (
                  <div className="text-center">
                    <div className="text-base font-semibold text-t-text">
                      {course.estimatedTime.replace("시간", "h")}
                    </div>
                    <div className="text-[10px] text-t-muted">제한시간</div>
                  </div>
                )}
              </div>
            </div>

            {/* Description + designer */}
            {course.description && (
              <div className="text-xs text-t-sub space-y-1">
                {course.description && <p>{course.description}</p>}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <FavoriteButton courseId={courseId} />
              <CompletionForm courseId={courseId} />
            </div>

            {/* Checkpoints */}
            {checkpoints.length > 0 && (
              <div className="pb-1">
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
                        className="flex w-full items-center gap-2 rounded px-1 py-1 text-left transition-colors hover:bg-t-hover cursor-pointer"
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
                        <span className="inline-flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-md border border-t-border bg-t-bg/90 leading-none">
                          <span className="text-[8px] font-semibold tracking-[0.04em] text-t-muted">CP</span>
                          <span className="text-[10px] font-bold text-t-sub">{String(i + 1).padStart(2, "0")}</span>
                        </span>
                        {cp.imageKey && (
                          <button
                            type="button"
                            className="shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewImage({ key: cp.imageKey!, name: cp.name });
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/images/${cp.imageKey}`}
                              alt={normalizeCheckpointName(cp.name)}
                              className="h-8 w-8 rounded object-cover border border-t-border"
                              loading="lazy"
                            />
                          </button>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-t-text">{normalizeCheckpointName(cp.name)}</span>
                          <span className="text-t-muted">{cp.distanceKm.toFixed(1)} km</span>
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
                                  title={`${normalizeCheckpointName(cp.name)} around view`}
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
              </div>
            )}
          </>
        )}
      </div>
      {previewImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            className="absolute right-3 top-3 rounded bg-black/50 px-2 py-1 text-xs text-white"
            onClick={() => setPreviewImage(null)}
          >
            닫기
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/images/${previewImage.key}`}
            alt={previewImage.name}
            className="max-h-[90vh] max-w-[92vw] rounded-md object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
