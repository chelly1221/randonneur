"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Download, Archive, Plus, RotateCcw, Upload, X, AlertTriangle, CheckCircle2, Bike, Play, Globe } from "lucide-react";

interface ServiceStatus {
  name: string;
  status: "ok" | "error";
  message?: string;
}

interface HealthData {
  status: string;
  services: ServiceStatus[];
}

interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
}

interface ScraperStatus {
  enabled: boolean;
  lastScrapeDate: string | null;
  lastResult: {
    created: number;
    updated: number;
    skipped: number;
    errors: number;
    total: number;
    timestamp: string;
  } | null;
  [key: string]: unknown;
}

interface ScraperRunResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  total: number;
}

interface ScraperConfig {
  id: string;
  title: string;
  description: string;
  apiPath: string;
  countKey: string;
  countLabel: string;
  icon: "bike" | "globe";
}

const SCRAPER_CONFIGS: ScraperConfig[] = [
  {
    id: "kora",
    title: "ACP BRM 스크래퍼",
    description: "ACP (Audax Club Parisien) BRM 월드 캘린더에서 전세계 브레베 일정을 자동으로 가져와 이벤트로 등록합니다. 매일 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/kora",
    countKey: "koraEventCount",
    countLabel: "ACP 이벤트 수",
    icon: "bike",
  },
  {
    id: "audax-au",
    title: "Audax Australia 퍼머넌트 스크래퍼",
    description: "Audax Australia 퍼머넌트 코스를 자동으로 가져와 세계 코스로 등록합니다. RideWithGPS에서 GPX 파일도 함께 다운로드합니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/audax-au",
    countKey: "auCourseCount",
    countLabel: "AU 코스 수",
    icon: "globe",
  },
  {
    id: "kora-perm",
    title: "한국 퍼머넌트 스크래퍼",
    description: "한국 란도너스 웹사이트에서 퍼머넌트 코스 정보와 GPX를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/kora-permanents",
    countKey: "krCourseCount",
    countLabel: "KR 코스 수",
    icon: "bike",
  },
  {
    id: "randonneurs-be",
    title: "Randonneurs.be 퍼머넌트 스크래퍼",
    description: "Randonneurs.be 벨기에 퍼머넌트 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/randonneurs-be",
    countKey: "beCourseCount",
    countLabel: "BE 코스 수",
    icon: "globe",
  },
  {
    id: "bcr",
    title: "BC Randonneurs 퍼머넌트 스크래퍼",
    description: "BC Randonneurs (캐나다 브리티시컬럼비아) 퍼머넌트 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/bcr",
    countKey: "bcrCourseCount",
    countLabel: "CA-BC 코스 수",
    icon: "globe",
  },
  {
    id: "ontario",
    title: "Randonneurs Ontario 스크래퍼",
    description: "Randonneurs Ontario (캐나다 온타리오) 4개 챕터의 코스를 RWGPS 및 GPX에서 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/ontario-randonneurs",
    countKey: "orCourseCount",
    countLabel: "CA-ON 코스 수",
    icon: "globe",
  },
  {
    id: "alberta",
    title: "Alberta Randonneurs 스크래퍼",
    description: "Alberta Randonneurs (캐나다 앨버타) 퍼머넌트 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/alberta-randonneurs",
    countKey: "abCourseCount",
    countLabel: "CA-AB 코스 수",
    icon: "globe",
  },
  {
    id: "audax-de",
    title: "Audax Germany 스크래퍼",
    description: "Audax Randonneure Deutschland 퍼머넌트 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/audax-de",
    countKey: "deCourseCount",
    countLabel: "DE 코스 수",
    icon: "globe",
  },
  {
    id: "audax-ireland",
    title: "Audax Ireland 스크래퍼",
    description: "Audax Ireland 퍼머넌트 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/audax-ireland",
    countKey: "ieCourseCount",
    countLabel: "IE 코스 수",
    icon: "globe",
  },
  {
    id: "audax-italy",
    title: "Audax Italy 스크래퍼",
    description: "Audax Italia 퍼머넌트 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/audax-italy",
    countKey: "itCourseCount",
    countLabel: "IT 코스 수",
    icon: "globe",
  },
  {
    id: "audax-japan",
    title: "Audax Japan 스크래퍼",
    description: "Audax Japan 퍼머넌트 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/audax-japan",
    countKey: "jpCourseCount",
    countLabel: "JP 코스 수",
    icon: "globe",
  },
  {
    id: "randonneurs-no",
    title: "Randonneurs Norway 스크래퍼",
    description: "Norsk Randonneur 퍼머넌트 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/randonneurs-no",
    countKey: "noCourseCount",
    countLabel: "NO 코스 수",
    icon: "globe",
  },
  {
    id: "kiwi-randonneurs",
    title: "Kiwi Randonneurs 스크래퍼",
    description: "Kiwi Randonneurs (뉴질랜드) 퍼머넌트 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/kiwi-randonneurs",
    countKey: "nzCourseCount",
    countLabel: "NZ 코스 수",
    icon: "globe",
  },
  {
    id: "audax-uk",
    title: "Audax UK 스크래퍼",
    description: "Audax UK 퍼머넌트 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/audax-uk",
    countKey: "gbCourseCount",
    countLabel: "GB 코스 수",
    icon: "globe",
  },
  {
    id: "rusa",
    title: "RUSA 스크래퍼",
    description: "RUSA (Randonneurs USA) 퍼머넌트 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/rusa",
    countKey: "usCourseCount",
    countLabel: "US 코스 수",
    icon: "globe",
  },
  {
    id: "rancat",
    title: "Rancat 스크래퍼",
    description: "Rancat (카탈루냐/스페인) 퍼머넌트 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/rancat",
    countKey: "esCourseCount",
    countLabel: "ES 코스 수",
    icon: "globe",
  },
  {
    id: "audax-dk",
    title: "Audax Denmark 스크래퍼",
    description: "Audax Club Denmark 퍼머넌트 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/audax-dk",
    countKey: "dkCourseCount",
    countLabel: "DK 코스 수",
    icon: "globe",
  },
  {
    id: "sr-france",
    title: "SR France 스크래퍼",
    description: "프랑스 Super Randonnée 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/sr-france",
    countKey: "frCourseCount",
    countLabel: "FR 코스 수",
    icon: "globe",
  },
  {
    id: "audax-sa",
    title: "Audax South Africa 스크래퍼",
    description: "Audax South Africa Super Randonnée 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.",
    apiPath: "/api/admin/scraper/audax-sa",
    countKey: "zaCourseCount",
    countLabel: "ZA 코스 수",
    icon: "globe",
  },
];

function ScraperSection({ config }: { config: ScraperConfig }) {
  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<ScraperRunResult | null>(null);

  const fetchStatus = useCallback(() => {
    setLoading(true);
    fetch(config.apiPath)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, [config.apiPath]);

  async function toggle() {
    if (!status) return;
    const newEnabled = !status.enabled;
    try {
      const res = await fetch(config.apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (res.ok) {
        setStatus((prev) => prev ? { ...prev, enabled: newEnabled } : null);
      }
    } catch {
      // ignore
    }
  }

  async function run() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch(config.apiPath, { method: "POST" });
      const data = await res.json();
      setRunResult(data);
      fetchStatus();
    } catch {
      setRunResult({ created: 0, updated: 0, skipped: 0, errors: ["요청 실패"], total: 0 });
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const Icon = config.icon === "bike" ? Bike : Globe;
  const courseCount = status ? (status[config.countKey] as number) : null;

  return (
    <div className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Icon className="h-5 w-5" />
          {config.title}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </Button>
          <Button size="sm" onClick={run} disabled={running}>
            {running ? (
              <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-1 h-4 w-4" />
            )}
            {running ? "실행 중..." : "지금 실행"}
          </Button>
        </div>
      </div>

      <p className="mb-4 text-sm text-t-muted">{config.description}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-t-muted">상태</p>
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={toggle}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  status?.enabled ? "bg-sky-blue" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    status?.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm font-medium">
                {status?.enabled ? "활성" : "비활성"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-t-muted">{config.countLabel}</p>
            <p className="mt-1 text-lg font-bold">
              {courseCount ?? "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-t-muted">마지막 실행</p>
            <p className="mt-1 text-sm font-medium">
              {status?.lastScrapeDate
                ? new Date(status.lastScrapeDate).toLocaleString("ko-KR")
                : "실행 기록 없음"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-t-muted">마지막 결과</p>
            {status?.lastResult ? (
              <div className="mt-1 text-xs space-y-0.5">
                <p>생성 <strong>{status.lastResult.created}</strong> / 업데이트 <strong>{status.lastResult.updated}</strong></p>
                <p>스킵 {status.lastResult.skipped} / 오류 {status.lastResult.errors}</p>
              </div>
            ) : (
              <p className="mt-1 text-sm text-t-muted">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {runResult && (
        <Card className={`mb-4 ${runResult.errors.length > 0 ? "border-sky-orange" : "border-green-300"}`}>
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              {runResult.errors.length > 0 ? (
                <AlertTriangle className="h-4 w-4 text-sky-orange mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              )}
              <div className="text-sm">
                <p className="font-medium">
                  수동 실행 완료: {runResult.total}개 발견, {runResult.created}개 생성,{" "}
                  {runResult.updated}개 업데이트, {runResult.skipped}개 스킵
                </p>
                {runResult.errors.length > 0 && (
                  <div className="mt-1 text-xs text-t-muted">
                    {runResult.errors.slice(0, 5).map((err, i) => (
                      <p key={i}>{err}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function SystemStatusPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Restore state
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [restoreConfirmInput, setRestoreConfirmInput] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ success: boolean; message: string } | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function fetchHealth() {
    setLoading(true);
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setLoading(false));
  }

  function fetchBackups() {
    setBackupsLoading(true);
    fetch("/api/admin/backups")
      .then((r) => r.json())
      .then((data) => setBackups(data.backups ?? []))
      .catch(() => setBackups([]))
      .finally(() => setBackupsLoading(false));
  }

  async function createBackup() {
    if (!confirm("백업을 생성하시겠습니까? 수 분이 소요될 수 있습니다.")) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/backups", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error ?? "백업 생성 실패");
      } else {
        fetchBackups();
      }
    } catch {
      setCreateError("백업 생성 중 오류가 발생했습니다.");
    } finally {
      setCreating(false);
    }
  }

  function openRestoreDialog(filename: string) {
    setRestoreTarget(filename);
    setRestoreConfirmInput("");
    setRestoreResult(null);
  }

  function closeRestoreDialog() {
    if (restoring) return;
    setRestoreTarget(null);
    setRestoreConfirmInput("");
  }

  async function executeRestore() {
    if (!restoreTarget || restoreConfirmInput !== restoreTarget) return;
    setRestoring(true);
    setRestoreResult(null);
    try {
      const res = await fetch("/api/admin/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: restoreTarget }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRestoreResult({ success: false, message: data.error ?? "복원 실패" });
      } else {
        setRestoreResult({
          success: true,
          message: data.message ?? "복원이 완료되었습니다.",
        });
      }
    } catch {
      setRestoreResult({ success: false, message: "복원 중 오류가 발생했습니다." });
    } finally {
      setRestoring(false);
    }
  }

  async function uploadBackup(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/backups/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "업로드 실패");
      } else {
        fetchBackups();
      }
    } catch {
      setUploadError("업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".tar.gz")) {
      setUploadError(".tar.gz 파일만 업로드할 수 있습니다.");
      e.target.value = "";
      return;
    }
    uploadBackup(file);
  }

  useEffect(() => {
    fetchHealth();
    fetchBackups();
  }, []);

  // Auto-reload after successful restore (server restarts itself)
  useEffect(() => {
    if (!restoreResult?.success) return;
    let cancelled = false;
    async function waitAndReload() {
      // Wait for server to go down first
      await new Promise((r) => setTimeout(r, 3000));
      // Then poll until it's back up
      while (!cancelled) {
        try {
          const res = await fetch("/api/health", { cache: "no-store" });
          if (res.ok) {
            window.location.reload();
            return;
          }
        } catch {
          // Server still down, retry
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    waitAndReload();
    return () => { cancelled = true; };
  }, [restoreResult]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">시스템 상태</h1>
        <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {health?.services.map((service) => (
          <Card key={service.name}>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="font-medium capitalize">{service.name}</p>
                {service.message && (
                  <p className="text-xs text-t-muted">{service.message}</p>
                )}
              </div>
              <Badge
                variant={service.status === "ok" ? "success" : "danger"}
              >
                {service.status === "ok" ? "정상" : "오류"}
              </Badge>
            </CardContent>
          </Card>
        )) ?? (
          <Card>
            <CardContent className="text-center text-t-faint">
              {loading ? "확인중..." : "상태를 가져올 수 없습니다."}
            </CardContent>
          </Card>
        )}
      </div>

      {/* All Scraper Sections */}
      {SCRAPER_CONFIGS.map((config) => (
        <ScraperSection key={config.id} config={config} />
      ))}

      {/* Backup Management Section */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Archive className="h-5 w-5" />
            백업 관리
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchBackups} disabled={backupsLoading}>
              <RefreshCw className={`mr-1 h-4 w-4 ${backupsLoading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <Button size="sm" onClick={createBackup} disabled={creating}>
              {creating ? (
                <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1 h-4 w-4" />
              )}
              {creating ? "생성 중..." : "백업 생성"}
            </Button>
          </div>
        </div>

        <p className="mb-4 text-sm text-t-muted">
          DB(PostgreSQL)와 파일(MinIO)을 포함한 전체 백업을 생성하고 다운로드합니다.
        </p>

        {createError && (
          <Card className="mb-4 border-red-300 bg-red-50">
            <CardContent className="text-sm text-red-700">{createError}</CardContent>
          </Card>
        )}

        {/* Upload Section */}
        <Card className="mb-4">
          <CardContent>
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-t-muted shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">외부 백업 파일 업로드</p>
                <p className="text-xs text-t-muted">다른 서버에서 생성된 .tar.gz 백업 파일을 업로드합니다.</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".tar.gz,.gz"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploading}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1 h-4 w-4" />
                )}
                {uploading ? "업로드 중..." : "파일 선택"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {uploadError && (
          <Card className="mb-4 border-red-300 bg-red-50">
            <CardContent className="text-sm text-red-700">{uploadError}</CardContent>
          </Card>
        )}

        {backupsLoading && backups.length === 0 ? (
          <Card>
            <CardContent className="text-center text-t-faint">
              불러오는 중...
            </CardContent>
          </Card>
        ) : backups.length === 0 ? (
          <Card>
            <CardContent className="text-center text-t-faint">
              백업 파일이 없습니다. 위의 &quot;백업 생성&quot; 버튼을 클릭하여 백업을 생성하세요.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {backups.map((backup) => (
              <Card key={backup.filename}>
                <CardContent className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{backup.filename}</p>
                    <p className="text-xs text-t-muted">
                      {formatFileSize(backup.size)} · {new Date(backup.createdAt).toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <a href={`/api/admin/backups/${encodeURIComponent(backup.filename)}`} download>
                      <Button variant="outline" size="sm">
                        <Download className="mr-1 h-4 w-4" />
                        다운로드
                      </Button>
                    </a>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => openRestoreDialog(backup.filename)}
                    >
                      <RotateCcw className="mr-1 h-4 w-4" />
                      복원
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Restore Confirmation Dialog */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-lg bg-t-surface p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h3 className="text-lg font-bold">백업 복원</h3>
              </div>
              {!restoring && !restoreResult?.success && (
                <button onClick={closeRestoreDialog} className="text-t-muted hover:text-t-text">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {restoreResult ? (
              <div>
                <div className={`mb-4 rounded-md p-3 ${
                  restoreResult.success
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}>
                  <div className="flex items-center gap-2">
                    {restoreResult.success ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    )}
                    <p className="text-sm font-medium">{restoreResult.message}</p>
                  </div>
                </div>

                {restoreResult.success && (
                  <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3">
                    <p className="text-sm font-medium text-blue-800">
                      서비스가 자동으로 재시작됩니다.
                    </p>
                    <p className="mt-1 text-xs text-blue-700">
                      잠시 후 페이지가 새로고침됩니다.
                    </p>
                    <RefreshCw className="mt-2 h-4 w-4 animate-spin text-blue-600" />
                  </div>
                )}

                {!restoreResult.success && (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRestoreTarget(null)}
                    >
                      닫기
                    </Button>
                  </div>
                )}
              </div>
            ) : restoring ? (
              <div className="py-8 text-center">
                <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-t-primary" />
                <p className="font-medium">복원 진행 중...</p>
                <p className="mt-1 text-sm text-t-muted">
                  DB와 파일을 복원하고 있습니다. 수 분이 소요될 수 있습니다.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <p className="text-sm text-t-text">
                    이 백업으로 복원하면 <strong>현재 데이터가 모두 삭제</strong>됩니다.
                    복원하려면 아래에 파일명을 정확히 입력하세요.
                  </p>
                  <p className="mt-2 rounded bg-t-faint px-3 py-2 font-mono text-sm break-all">
                    {restoreTarget}
                  </p>
                </div>

                <div className="mb-4">
                  <label className="mb-1 block text-sm font-medium text-t-text">
                    파일명 확인
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm focus:border-t-primary focus:outline-none"
                    placeholder="파일명을 입력하세요"
                    value={restoreConfirmInput}
                    onChange={(e) => setRestoreConfirmInput(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={closeRestoreDialog}>
                    취소
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={restoreConfirmInput !== restoreTarget}
                    onClick={executeRestore}
                  >
                    <RotateCcw className="mr-1 h-4 w-4" />
                    복원 실행
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
