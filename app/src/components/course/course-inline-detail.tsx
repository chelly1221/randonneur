"use client";

import { useEffect, useRef, useState, useLayoutEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { interpolatePointOnLine } from "@/lib/geo-utils";
import { CATEGORIES } from "@/types";
import { CourseReviews } from "@/components/course/course-reviews";
import { ImprovementRequestForm } from "@/components/course/improvement-request-form";
import { GpxStatsPreview } from "@/components/course/gpx-stats-preview";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  User,
  Download,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  CheckCircle,
  Loader2,
  Lock,
  Plus,
  X,
} from "lucide-react";
import { ShareButton } from "@/components/course/share-button";

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
  mapCollapsed?: boolean;
  onToggleMap?: () => void;
}

type Tab = "checkpoints" | "records" | "reviews" | "improvement";

interface MyCompletion {
  id: string;
  completedAt: string;
  completionStatus: string;
  notes: string | null;
  course: { id: string };
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
  mapCollapsed,
  onToggleMap,
}: CourseInlineDetailProps) {
  const { data: session } = useSession();
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

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>("checkpoints");

  // Records tab state
  const [myCompletions, setMyCompletions] = useState<MyCompletion[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [addingRecord, setAddingRecord] = useState(false);
  const [recordSubmitting, setRecordSubmitting] = useState(false);
  const [recordSuccess, setRecordSuccess] = useState(false);
  const [completedAt, setCompletedAt] = useState(() => new Date().toISOString().split("T")[0]);
  const [completionStatus, setCompletionStatus] = useState("success");
  const [recordNotes, setRecordNotes] = useState("");
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  // Inline review (optional, inside records form)
  const [showReview, setShowReview] = useState(false);
  const [reviewStatus, setReviewStatus] = useState("success");
  const [reviewDifficulty, setReviewDifficulty] = useState("");
  const [reviewDiffHover, setReviewDiffHover] = useState(0);
  const [reviewContent, setReviewContent] = useState("");

  // Photo upload state
  const [photoUploadCpId, setPhotoUploadCpId] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoSubmitting, setPhotoSubmitting] = useState(false);
  const [photoSuccessCpId, setPhotoSuccessCpId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Fetch course detail
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setActiveCheckpointId(null);
    setCheckpointViewMode("street");
    setPreviewImage(null);
    setActiveTab("checkpoints");
    setRecordsLoaded(false);
    setMyCompletions([]);
    setAddingRecord(false);
    setRecordSuccess(false);
    setCompletionStatus("success");
    setShowReview(false);
    setReviewContent("");
    setGpxFile(null);
    setPhotoUploadCpId(null);
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoSuccessCpId(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Fetch my completions when records tab is activated
  const fetchMyCompletions = useCallback(() => {
    if (!session) return;
    setRecordsLoading(true);
    fetch("/api/completions/me")
      .then((r) => r.json())
      .then((data: { completions: MyCompletion[] }) => {
        setMyCompletions(data.completions.filter((c) => c.course.id === courseId));
        setRecordsLoaded(true);
        setRecordsLoading(false);
      })
      .catch(() => setRecordsLoading(false));
  }, [session, courseId]);

  useEffect(() => {
    if (activeTab !== "records" || !session || recordsLoaded) return;
    fetchMyCompletions();
  }, [activeTab, session, recordsLoaded, fetchMyCompletions]);

  const openAddRecord = useCallback(() => {
    setActiveTab("records");
    setAddingRecord(true);
    setRecordSuccess(false);
  }, []);

  async function handleRecordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRecordSubmitting(true);
    const form = new FormData(e.currentTarget);
    form.set("courseId", courseId);
    form.set("completionStatus", completionStatus);
    try {
      const compRes = await fetch("/api/completions", { method: "POST", body: form });
      if (compRes.ok) {
        // If review content is provided, also submit a review
        if (showReview && reviewContent.trim()) {
          await fetch(`/api/courses/${courseId}/reviews`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              completionStatus: reviewStatus,
              difficulty: reviewDifficulty || null,
              content: reviewContent.trim(),
            }),
          });
        }
        setRecordSuccess(true);
        setAddingRecord(false);
        setRecordNotes("");
        setCompletionStatus("success");
        setGpxFile(null);
        setShowReview(false);
        setReviewContent("");
        setReviewStatus("success");
        setReviewDifficulty("");
        setRecordsLoaded(false);
      }
    } finally {
      setRecordSubmitting(false);
    }
  }

  async function handlePhotoSubmit(cpId: string) {
    if (!photoFile) return;
    setPhotoSubmitting(true);
    try {
      const form = new FormData();
      form.append("file", photoFile);
      const res = await fetch(`/api/checkpoints/${cpId}/photo-submission`, {
        method: "POST",
        body: form,
      });
      if (res.ok) {
        setPhotoSuccessCpId(cpId);
        setPhotoUploadCpId(null);
        setPhotoFile(null);
        setPhotoPreviewUrl(null);
      }
    } finally {
      setPhotoSubmitting(false);
    }
  }

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

  const tabs: { key: Tab; label: string; authRequired?: boolean }[] = [
    { key: "checkpoints", label: "체크포인트" },
    { key: "records", label: "내 기록", authRequired: true },
    { key: "reviews", label: "후기" },
    { key: "improvement", label: "수정요청", authRequired: true },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:h-full">
      {/* Header — tap to close */}
      <div
        ref={headerRef}
        className="shrink-0 border-b border-t-border px-3 py-2 cursor-pointer hover:bg-t-hover transition-colors"
        onClick={onClose}
      >
        <div className="flex items-stretch justify-between gap-2">
          <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
            <h2 className="text-sm font-bold leading-tight flex items-center gap-1 min-w-0">
              {(course?.courseNumber ?? courseBasic.courseNumber) && (
                <span className="shrink-0 text-t-muted font-normal text-xs">
                  {course?.courseNumber ?? courseBasic.courseNumber}
                </span>
              )}
              <span className="truncate">{course?.name ?? courseBasic.name}</span>
              {course?.archived && (
                <span className="ml-1 text-[11px] font-normal text-t-muted shrink-0">(구)</span>
              )}
              {course?.startLocation && (
                <span className="font-normal text-[11px] text-t-muted shrink-0 whitespace-nowrap ml-1">
                  {course.startLocation} → {course.endLocation}
                </span>
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-1">
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
            </div>
          </div>

          <div className="shrink-0 flex items-stretch gap-1">
            <div className="self-stretch inline-flex items-center" onClick={(e) => e.stopPropagation()}>
              <ShareButton
                courseId={courseId}
                courseName={course?.name ?? courseBasic.name}
                courseDistance={course?.distanceKm ?? courseBasic.distanceKm}
              />
            </div>
            {onToggleMap && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleMap(); }}
                className="lg:hidden self-stretch inline-flex items-center gap-1 px-3 rounded-md border border-t-border text-[11px] text-t-text hover:bg-t-hover transition-colors"
              >
                {mapCollapsed ? (
                  <><ChevronUp className="h-3 w-3" />지도</>
                ) : (
                  <>상세보기<ChevronDown className="h-3 w-3" /></>
                )}
              </button>
            )}
            {course?.gpxFileKey && (
              <a
                href={`/api/courses/${course.id}/gpx`}
                onClick={(e) => e.stopPropagation()}
                className="hidden lg:inline-flex items-center"
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
                className="hidden lg:inline-flex items-center"
              >
                <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]">
                  <ExternalLink className="mr-1 h-3.5 w-3.5" />
                  공식
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div
        ref={bodyRef}
        className={`${
          mapCollapsed
            ? "min-h-0 flex-1 overflow-y-auto px-3 py-2"
            : "h-0 overflow-hidden px-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:py-2"
        } space-y-1 scrollbar-hidden`}
      >
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-t-hover animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="text-sm text-sky-red p-2 text-center">{error}</div>
        )}

        {!loading && !error && course && (
          <>
            {/* Mobile: GPX + 공식 buttons */}
            {(course.gpxFileKey || (officialPageUrl && !course.archived)) && (
              <div className="flex items-center gap-2 lg:hidden">
                {course.gpxFileKey && (
                  <a href={`/api/courses/${course.id}/gpx`} className="inline-flex">
                    <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]">
                      <Download className="mr-1 h-3.5 w-3.5" />
                      GPX
                    </Button>
                  </a>
                )}
                {officialPageUrl && !course.archived && (
                  <a
                    href={officialPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
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

            {/* Compact metrics */}
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

            {/* Description */}
            {course.description && (
              <div className="text-xs text-t-sub space-y-1">
                <p>{course.description}</p>
              </div>
            )}

            {/* Tab bar */}
            <div className="flex border-b border-t-border -mx-3 px-3">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                    activeTab === tab.key
                      ? "border-sky-blue text-sky-blue"
                      : "border-transparent text-t-muted hover:text-t-text"
                  }`}
                >
                  {tab.label}
                  {tab.authRequired && !session && (
                    <Lock className="h-2.5 w-2.5 opacity-50" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab: 체크포인트 */}
            {activeTab === "checkpoints" && (
              checkpoints.length === 0 ? (
                <p className="text-[11px] text-t-muted text-center py-4">체크포인트가 없습니다.</p>
              ) : (
                <div className="space-y-1.5 pb-1">
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
                        {cp.imageKey ? (
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
                        ) : photoSuccessCpId === cp.id ? (
                          <span className="h-8 w-8 shrink-0 flex items-center justify-center rounded border border-t-border text-emerald-500">
                            <CheckCircle className="h-4 w-4" />
                          </span>
                        ) : (
                          <button
                            type="button"
                            title="사진 제출"
                            className="h-8 w-8 shrink-0 flex items-center justify-center rounded border-2 border-dashed border-t-border text-t-muted hover:border-sky-blue hover:text-sky-blue transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPhotoUploadCpId(cp.id);
                              setPhotoFile(null);
                              setPhotoPreviewUrl(null);
                            }}
                          >
                            <Plus className="h-4 w-4" />
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
              )
            )}

            {/* Tab: 내 기록 */}
            {activeTab === "records" && (
              !session ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Lock className="h-6 w-6 text-t-muted" />
                  <p className="text-[12px] text-t-muted">로그인 후 완주 기록을 확인하고 추가할 수 있습니다.</p>
                </div>
              ) : (
                <div className="space-y-2 pb-1">
                  {/* Add record button / success */}
                  {recordSuccess && (
                    <div className="flex items-center gap-2 rounded border border-t-border bg-t-surface px-3 py-2 text-[12px] text-t-success">
                      <CheckCircle className="h-4 w-4" />
                      완주 기록이 저장되었습니다.
                    </div>
                  )}

                  {!addingRecord && (
                    <button
                      type="button"
                      onClick={() => { setAddingRecord(true); setRecordSuccess(false); }}
                      className="w-full rounded border border-dashed border-t-border py-2 text-[11px] text-t-muted hover:bg-t-hover transition-colors"
                    >
                      + 내 기록 추가
                    </button>
                  )}

                  {addingRecord && (
                    <form
                      onSubmit={handleRecordSubmit}
                      className="rounded border border-t-border bg-t-surface/60 px-3 py-2.5 space-y-2"
                    >
                      <div>
                        <label className="block text-[10px] text-t-muted mb-1">완주 상태</label>
                        <div className="flex flex-wrap gap-1">
                          {(
                            [
                              { value: "success", label: "완주",  cls: completionStatus === "success" ? "bg-emerald-600 text-white border-emerald-600" : "border-t-border text-t-muted hover:border-sky-blue hover:text-sky-blue" },
                              { value: "dnf",     label: "DNF",   cls: completionStatus === "dnf"     ? "bg-sky-orange text-white border-sky-orange"   : "border-t-border text-t-muted hover:border-sky-blue hover:text-sky-blue" },
                              { value: "dnq",     label: "DNQ",   cls: completionStatus === "dnq"     ? "bg-t-subtle text-t-text border-t-subtle"       : "border-t-border text-t-muted hover:border-sky-blue hover:text-sky-blue" },
                              { value: "dns",     label: "DNS",   cls: completionStatus === "dns"     ? "bg-sky-red text-white border-sky-red"           : "border-t-border text-t-muted hover:border-sky-blue hover:text-sky-blue" },
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setCompletionStatus(opt.value)}
                              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${opt.cls}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-t-muted mb-1">완주 날짜</label>
                        <input
                          type="date"
                          name="completedAt"
                          required
                          value={completedAt}
                          onChange={(e) => setCompletedAt(e.target.value)}
                          className="w-full rounded border border-t-border bg-t-surface px-2 py-1 text-[11px] text-t-text"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-t-muted mb-1">메모 (선택)</label>
                        <input
                          type="text"
                          name="notes"
                          value={recordNotes}
                          onChange={(e) => setRecordNotes(e.target.value)}
                          placeholder="메모를 입력하세요"
                          className="w-full rounded border border-t-border bg-t-surface px-2 py-1 text-[11px] text-t-text placeholder:text-t-muted"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-t-muted mb-1">GPX 파일 (선택)</label>
                        <input
                          type="file"
                          name="gpx"
                          accept=".gpx"
                          className="w-full text-[11px] text-t-text"
                          onChange={(e) => setGpxFile(e.target.files?.[0] ?? null)}
                        />
                      </div>
                      <GpxStatsPreview file={gpxFile} />

                      {/* 후기 작성 토글 */}
                      <div className="border-t border-t-border pt-2">
                        <button
                          type="button"
                          onClick={() => setShowReview((v) => !v)}
                          className="flex items-center gap-1.5 text-[10px] text-sky-blue hover:underline"
                        >
                          {showReview ? "▾ 후기 작성 취소" : "▸ 후기도 함께 작성 (선택)"}
                        </button>
                        {showReview && (
                          <div className="mt-2 space-y-1.5">
                            {/* Completion status — badge buttons */}
                            <div>
                              <p className="text-[10px] text-t-muted mb-1">완주 상태</p>
                              <div className="flex flex-wrap gap-1">
                                {(
                                  [
                                    { value: "success", label: "성공",  cls: reviewStatus === "success" ? "bg-emerald-600 text-white" : "bg-t-hover text-t-muted" },
                                    { value: "dnf",     label: "DNF",   cls: reviewStatus === "dnf"     ? "bg-sky-orange text-white"  : "bg-t-hover text-t-muted" },
                                    { value: "dnq",     label: "DNQ",   cls: reviewStatus === "dnq"     ? "bg-t-subtle text-t-text"   : "bg-t-hover text-t-muted" },
                                    { value: "dns",     label: "DNS",   cls: reviewStatus === "dns"     ? "bg-sky-red text-white"     : "bg-t-hover text-t-muted" },
                                  ] as const
                                ).map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setReviewStatus(opt.value)}
                                    className={`rounded px-2.5 py-0.5 text-[11px] font-medium transition-colors ${opt.cls}`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {/* Star difficulty */}
                            <div>
                              <p className="text-[10px] text-t-muted mb-1">체감 난이도 (선택)</p>
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    type="button"
                                    onMouseEnter={() => setReviewDiffHover(star)}
                                    onMouseLeave={() => setReviewDiffHover(0)}
                                    onClick={() => setReviewDifficulty(reviewDifficulty === String(star) ? "" : String(star))}
                                    className={`text-lg leading-none transition-colors ${
                                      star <= (reviewDiffHover || Number(reviewDifficulty)) ? "text-sky-yellow" : "text-t-muted"
                                    }`}
                                  >
                                    ★
                                  </button>
                                ))}
                                {reviewDifficulty && (
                                  <span className="ml-1 text-[10px] text-t-muted">{reviewDifficulty}/5</span>
                                )}
                              </div>
                            </div>
                            <RichTextEditor
                              value={reviewContent}
                              onChange={setReviewContent}
                              placeholder="후기를 입력하세요..."
                              minHeight={72}
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex gap-1.5">
                        <button
                          type="submit"
                          disabled={recordSubmitting}
                          className="flex items-center gap-1 rounded bg-sky-darkblue px-3 py-1 text-[11px] text-white hover:bg-sky-darkblue/80 disabled:opacity-50"
                        >
                          {recordSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAddingRecord(false); setShowReview(false); setReviewContent(""); }}
                          className="rounded border border-t-border px-3 py-1 text-[11px] text-t-muted hover:bg-t-hover"
                        >
                          취소
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Completions list */}
                  {recordsLoading && (
                    <div className="space-y-1.5">
                      {[1, 2].map((i) => (
                        <div key={i} className="h-10 rounded bg-t-hover animate-pulse" />
                      ))}
                    </div>
                  )}

                  {!recordsLoading && myCompletions.length === 0 && (
                    <p className="text-[11px] text-t-muted text-center py-3">
                      이 코스의 완주 기록이 없습니다.
                    </p>
                  )}

                  {!recordsLoading && myCompletions.map((c) => {
                    const statusLabel = c.completionStatus === "dnf" ? "DNF"
                      : c.completionStatus === "dnq" ? "DNQ"
                      : c.completionStatus === "dns" ? "DNS"
                      : null;
                    const statusCls = c.completionStatus === "dnf" ? "text-sky-orange"
                      : c.completionStatus === "dnq" ? "text-t-muted"
                      : c.completionStatus === "dns" ? "text-sky-red"
                      : "text-t-success";
                    return (
                      <div
                        key={c.id}
                        className="rounded border border-t-border bg-t-bg/40 px-2.5 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle className={`h-3.5 w-3.5 shrink-0 ${statusCls}`} />
                          <span className="text-[11px] font-medium text-t-text">
                            {new Date(c.completedAt).toLocaleDateString("ko-KR")}
                          </span>
                          {statusLabel && (
                            <span className={`text-[10px] font-semibold ${statusCls}`}>{statusLabel}</span>
                          )}
                        </div>
                        {c.notes && (
                          <p className="mt-0.5 pl-5 text-[11px] text-t-muted">{c.notes}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Tab: 후기 */}
            {activeTab === "reviews" && (
              <CourseReviews courseId={courseId} onWriteClick={openAddRecord} />
            )}

            {/* Tab: 수정요청 */}
            {activeTab === "improvement" && (
              !session ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Lock className="h-6 w-6 text-t-muted" />
                  <p className="text-[12px] text-t-muted">로그인 후 수정 요청을 제출할 수 있습니다.</p>
                </div>
              ) : (
                <ImprovementRequestForm courseId={courseId} />
              )
            )}
          </>
        )}
      </div>

      {/* Photo upload modal */}
      {photoUploadCpId !== null && (() => {
        const cp = checkpoints.find((c) => c.id === photoUploadCpId);
        return (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
            onClick={() => { setPhotoUploadCpId(null); setPhotoFile(null); setPhotoPreviewUrl(null); }}
          >
            <div
              className="relative w-full max-w-sm rounded-xl border border-t-border bg-t-surface p-5 shadow-xl space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="absolute right-3 top-3 rounded p-1 text-t-muted hover:bg-t-hover"
                onClick={() => { setPhotoUploadCpId(null); setPhotoFile(null); setPhotoPreviewUrl(null); }}
              >
                <X className="h-4 w-4" />
              </button>

              <div>
                <h3 className="text-sm font-semibold text-t-text">CP 사진 제출</h3>
                {cp && (
                  <p className="text-xs text-t-muted mt-0.5">{normalizeCheckpointName(cp.name)}</p>
                )}
              </div>

              {!session ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <Lock className="h-6 w-6 text-t-muted" />
                  <p className="text-[12px] text-t-muted">로그인 후 사진을 제출할 수 있습니다.</p>
                  <a
                    href="/auth/login"
                    className="rounded bg-sky-darkblue px-4 py-1.5 text-[12px] text-white hover:bg-sky-darkblue/80"
                  >
                    로그인
                  </a>
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-t-muted">
                    📸 낮에 촬영한 사진을 올려주세요. 야간 사진은 검토에서 제외될 수 있습니다.
                  </p>

                  <div>
                    <label className="block text-[10px] text-t-muted mb-1">사진 선택</label>
                    <input
                      type="file"
                      accept="image/*"
                      className="w-full text-[11px] text-t-text"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setPhotoFile(f);
                        if (f) {
                          const url = URL.createObjectURL(f);
                          setPhotoPreviewUrl(url);
                        } else {
                          setPhotoPreviewUrl(null);
                        }
                      }}
                    />
                  </div>

                  {photoPreviewUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={photoPreviewUrl}
                      alt="미리보기"
                      className="w-full max-h-48 rounded border border-t-border object-cover"
                    />
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={!photoFile || photoSubmitting}
                      onClick={() => handlePhotoSubmit(photoUploadCpId)}
                      className="flex items-center gap-1 rounded bg-sky-darkblue px-4 py-1.5 text-[12px] text-white hover:bg-sky-darkblue/80 disabled:opacity-50"
                    >
                      {photoSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
                      제출
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPhotoUploadCpId(null); setPhotoFile(null); setPhotoPreviewUrl(null); }}
                      className="rounded border border-t-border px-3 py-1.5 text-[12px] text-t-muted hover:bg-t-hover"
                    >
                      취소
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

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
