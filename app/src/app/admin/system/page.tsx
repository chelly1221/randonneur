"use client";

import { useEffect, useState, useRef } from "react";
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

  // KORA Scraper state
  const [scraperStatus, setScraperStatus] = useState<{
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
    koraEventCount: number;
  } | null>(null);
  const [scraperLoading, setScraperLoading] = useState(false);
  const [scraperRunning, setScraperRunning] = useState(false);
  const [scraperRunResult, setScraperRunResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
    total: number;
  } | null>(null);

  // Audax AU Scraper state
  const [krPermScraperStatus, setKrPermScraperStatus] = useState<{
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
    krCourseCount: number;
  } | null>(null);
  const [krPermScraperLoading, setKrPermScraperLoading] = useState(false);
  const [krPermScraperRunning, setKrPermScraperRunning] = useState(false);
  const [krPermScraperRunResult, setKrPermScraperRunResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
    total: number;
  } | null>(null);

  // BC Randonneurs Scraper state
  const [bcrScraperStatus, setBcrScraperStatus] = useState<{
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
    bcrCourseCount: number;
  } | null>(null);
  const [bcrScraperLoading, setBcrScraperLoading] = useState(false);
  const [bcrScraperRunning, setBcrScraperRunning] = useState(false);
  const [bcrScraperRunResult, setBcrScraperRunResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
    total: number;
  } | null>(null);

  // Ontario Randonneurs Scraper state
  const [orScraperStatus, setOrScraperStatus] = useState<{
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
    orCourseCount: number;
  } | null>(null);
  const [orScraperLoading, setOrScraperLoading] = useState(false);
  const [orScraperRunning, setOrScraperRunning] = useState(false);
  const [orScraperRunResult, setOrScraperRunResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
    total: number;
  } | null>(null);

  // Alberta Randonneurs Scraper state
  const [abScraperStatus, setAbScraperStatus] = useState<{
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
    abCourseCount: number;
  } | null>(null);
  const [abScraperLoading, setAbScraperLoading] = useState(false);
  const [abScraperRunning, setAbScraperRunning] = useState(false);
  const [abScraperRunResult, setAbScraperRunResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
    total: number;
  } | null>(null);

  // Randonneurs.be Scraper state
  const [beScraperStatus, setBeScraperStatus] = useState<{
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
    beCourseCount: number;
  } | null>(null);
  const [beScraperLoading, setBeScraperLoading] = useState(false);
  const [beScraperRunning, setBeScraperRunning] = useState(false);
  const [beScraperRunResult, setBeScraperRunResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
    total: number;
  } | null>(null);

  const [auScraperStatus, setAuScraperStatus] = useState<{
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
    auCourseCount: number;
  } | null>(null);
  const [auScraperLoading, setAuScraperLoading] = useState(false);
  const [auScraperRunning, setAuScraperRunning] = useState(false);
  const [auScraperRunResult, setAuScraperRunResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
    total: number;
  } | null>(null);

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

  function fetchScraperStatus() {
    setScraperLoading(true);
    fetch("/api/admin/scraper/kora")
      .then((r) => r.json())
      .then(setScraperStatus)
      .catch(() => setScraperStatus(null))
      .finally(() => setScraperLoading(false));
  }

  async function toggleScraper() {
    if (!scraperStatus) return;
    const newEnabled = !scraperStatus.enabled;
    try {
      const res = await fetch("/api/admin/scraper/kora", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (res.ok) {
        setScraperStatus((prev) => prev ? { ...prev, enabled: newEnabled } : null);
      }
    } catch {
      // ignore
    }
  }

  async function runScraper() {
    setScraperRunning(true);
    setScraperRunResult(null);
    try {
      const res = await fetch("/api/admin/scraper/kora", { method: "POST" });
      const data = await res.json();
      setScraperRunResult(data);
      fetchScraperStatus();
    } catch {
      setScraperRunResult({ created: 0, updated: 0, skipped: 0, errors: ["요청 실패"], total: 0 });
    } finally {
      setScraperRunning(false);
    }
  }

  function fetchBcrScraperStatus() {
    setBcrScraperLoading(true);
    fetch("/api/admin/scraper/bcr")
      .then((r) => r.json())
      .then(setBcrScraperStatus)
      .catch(() => setBcrScraperStatus(null))
      .finally(() => setBcrScraperLoading(false));
  }

  async function toggleBcrScraper() {
    if (!bcrScraperStatus) return;
    const newEnabled = !bcrScraperStatus.enabled;
    try {
      const res = await fetch("/api/admin/scraper/bcr", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (res.ok) {
        setBcrScraperStatus((prev) => prev ? { ...prev, enabled: newEnabled } : null);
      }
    } catch {
      // ignore
    }
  }

  async function runBcrScraper() {
    setBcrScraperRunning(true);
    setBcrScraperRunResult(null);
    try {
      const res = await fetch("/api/admin/scraper/bcr", { method: "POST" });
      const data = await res.json();
      setBcrScraperRunResult(data);
      fetchBcrScraperStatus();
    } catch {
      setBcrScraperRunResult({ created: 0, updated: 0, skipped: 0, errors: ["요청 실패"], total: 0 });
    } finally {
      setBcrScraperRunning(false);
    }
  }

  function fetchOrScraperStatus() {
    setOrScraperLoading(true);
    fetch("/api/admin/scraper/ontario-randonneurs")
      .then((r) => r.json())
      .then(setOrScraperStatus)
      .catch(() => setOrScraperStatus(null))
      .finally(() => setOrScraperLoading(false));
  }

  async function toggleOrScraper() {
    if (!orScraperStatus) return;
    const newEnabled = !orScraperStatus.enabled;
    try {
      const res = await fetch("/api/admin/scraper/ontario-randonneurs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (res.ok) {
        setOrScraperStatus((prev) => prev ? { ...prev, enabled: newEnabled } : null);
      }
    } catch {
      // ignore
    }
  }

  async function runOrScraper() {
    setOrScraperRunning(true);
    setOrScraperRunResult(null);
    try {
      const res = await fetch("/api/admin/scraper/ontario-randonneurs", { method: "POST" });
      const data = await res.json();
      setOrScraperRunResult(data);
      fetchOrScraperStatus();
    } catch {
      setOrScraperRunResult({ created: 0, updated: 0, skipped: 0, errors: ["요청 실패"], total: 0 });
    } finally {
      setOrScraperRunning(false);
    }
  }

  function fetchAbScraperStatus() {
    setAbScraperLoading(true);
    fetch("/api/admin/scraper/alberta-randonneurs")
      .then((r) => r.json())
      .then(setAbScraperStatus)
      .catch(() => setAbScraperStatus(null))
      .finally(() => setAbScraperLoading(false));
  }

  async function toggleAbScraper() {
    if (!abScraperStatus) return;
    const newEnabled = !abScraperStatus.enabled;
    try {
      const res = await fetch("/api/admin/scraper/alberta-randonneurs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (res.ok) {
        setAbScraperStatus((prev) => prev ? { ...prev, enabled: newEnabled } : null);
      }
    } catch {
      // ignore
    }
  }

  async function runAbScraper() {
    setAbScraperRunning(true);
    setAbScraperRunResult(null);
    try {
      const res = await fetch("/api/admin/scraper/alberta-randonneurs", { method: "POST" });
      const data = await res.json();
      setAbScraperRunResult(data);
      fetchAbScraperStatus();
    } catch {
      setAbScraperRunResult({ created: 0, updated: 0, skipped: 0, errors: ["요청 실패"], total: 0 });
    } finally {
      setAbScraperRunning(false);
    }
  }

  function fetchBeScraperStatus() {
    setBeScraperLoading(true);
    fetch("/api/admin/scraper/randonneurs-be")
      .then((r) => r.json())
      .then(setBeScraperStatus)
      .catch(() => setBeScraperStatus(null))
      .finally(() => setBeScraperLoading(false));
  }

  async function toggleBeScraper() {
    if (!beScraperStatus) return;
    const newEnabled = !beScraperStatus.enabled;
    try {
      const res = await fetch("/api/admin/scraper/randonneurs-be", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (res.ok) {
        setBeScraperStatus((prev) => prev ? { ...prev, enabled: newEnabled } : null);
      }
    } catch {
      // ignore
    }
  }

  async function runBeScraper() {
    setBeScraperRunning(true);
    setBeScraperRunResult(null);
    try {
      const res = await fetch("/api/admin/scraper/randonneurs-be", { method: "POST" });
      const data = await res.json();
      setBeScraperRunResult(data);
      fetchBeScraperStatus();
    } catch {
      setBeScraperRunResult({ created: 0, updated: 0, skipped: 0, errors: ["요청 실패"], total: 0 });
    } finally {
      setBeScraperRunning(false);
    }
  }

  function fetchAuScraperStatus() {
    setAuScraperLoading(true);
    fetch("/api/admin/scraper/audax-au")
      .then((r) => r.json())
      .then(setAuScraperStatus)
      .catch(() => setAuScraperStatus(null))
      .finally(() => setAuScraperLoading(false));
  }

  async function toggleAuScraper() {
    if (!auScraperStatus) return;
    const newEnabled = !auScraperStatus.enabled;
    try {
      const res = await fetch("/api/admin/scraper/audax-au", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (res.ok) {
        setAuScraperStatus((prev) => prev ? { ...prev, enabled: newEnabled } : null);
      }
    } catch {
      // ignore
    }
  }

  async function runAuScraper() {
    setAuScraperRunning(true);
    setAuScraperRunResult(null);
    try {
      const res = await fetch("/api/admin/scraper/audax-au", { method: "POST" });
      const data = await res.json();
      setAuScraperRunResult(data);
      fetchAuScraperStatus();
    } catch {
      setAuScraperRunResult({ created: 0, updated: 0, skipped: 0, errors: ["요청 실패"], total: 0 });
    } finally {
      setAuScraperRunning(false);
    }
  }

  function fetchKrPermScraperStatus() {
    setKrPermScraperLoading(true);
    fetch("/api/admin/scraper/kora-permanents")
      .then((r) => r.json())
      .then(setKrPermScraperStatus)
      .catch(() => setKrPermScraperStatus(null))
      .finally(() => setKrPermScraperLoading(false));
  }

  async function toggleKrPermScraper() {
    if (!krPermScraperStatus) return;
    const newEnabled = !krPermScraperStatus.enabled;
    try {
      const res = await fetch("/api/admin/scraper/kora-permanents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (res.ok) {
        setKrPermScraperStatus((prev) => prev ? { ...prev, enabled: newEnabled } : null);
      }
    } catch {
      // ignore
    }
  }

  async function runKrPermScraper() {
    setKrPermScraperRunning(true);
    setKrPermScraperRunResult(null);
    try {
      const res = await fetch("/api/admin/scraper/kora-permanents", { method: "POST" });
      const data = await res.json();
      setKrPermScraperRunResult(data);
      fetchKrPermScraperStatus();
    } catch {
      setKrPermScraperRunResult({ created: 0, updated: 0, skipped: 0, errors: ["요청 실패"], total: 0 });
    } finally {
      setKrPermScraperRunning(false);
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
    fetchScraperStatus();
    fetchAuScraperStatus();
    fetchBeScraperStatus();
    fetchBcrScraperStatus();
    fetchOrScraperStatus();
    fetchAbScraperStatus();
    fetchKrPermScraperStatus();
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

      {/* KORA Scraper Section */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Bike className="h-5 w-5" />
            ACP BRM 스크래퍼
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchScraperStatus}
              disabled={scraperLoading}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${scraperLoading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <Button
              size="sm"
              onClick={runScraper}
              disabled={scraperRunning}
            >
              {scraperRunning ? (
                <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              {scraperRunning ? "실행 중..." : "지금 실행"}
            </Button>
          </div>
        </div>

        <p className="mb-4 text-sm text-t-muted">
          ACP (Audax Club Parisien) BRM 월드 캘린더에서 전세계 브레베 일정을 자동으로 가져와 이벤트로 등록합니다.
          매일 1회 자동 실행됩니다.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">상태</p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  onClick={toggleScraper}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    scraperStatus?.enabled ? "bg-sky-blue" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      scraperStatus?.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm font-medium">
                  {scraperStatus?.enabled ? "활성" : "비활성"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">ACP 이벤트 수</p>
              <p className="mt-1 text-lg font-bold">
                {scraperStatus?.koraEventCount ?? "—"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">마지막 실행</p>
              <p className="mt-1 text-sm font-medium">
                {scraperStatus?.lastScrapeDate
                  ? new Date(scraperStatus.lastScrapeDate).toLocaleString("ko-KR")
                  : "실행 기록 없음"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">마지막 결과</p>
              {scraperStatus?.lastResult ? (
                <div className="mt-1 text-xs space-y-0.5">
                  <p>생성 <strong>{scraperStatus.lastResult.created}</strong> / 업데이트 <strong>{scraperStatus.lastResult.updated}</strong></p>
                  <p>스킵 {scraperStatus.lastResult.skipped} / 오류 {scraperStatus.lastResult.errors}</p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-t-muted">—</p>
              )}
            </CardContent>
          </Card>
        </div>

        {scraperRunResult && (
          <Card className={`mb-4 ${scraperRunResult.errors.length > 0 ? "border-sky-orange" : "border-green-300"}`}>
            <CardContent className="py-3">
              <div className="flex items-start gap-2">
                {scraperRunResult.errors.length > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-sky-orange mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                )}
                <div className="text-sm">
                  <p className="font-medium">
                    수동 실행 완료: {scraperRunResult.total}개 발견, {scraperRunResult.created}개 생성,{" "}
                    {scraperRunResult.updated}개 업데이트, {scraperRunResult.skipped}개 스킵
                  </p>
                  {scraperRunResult.errors.length > 0 && (
                    <div className="mt-1 text-xs text-t-muted">
                      {scraperRunResult.errors.slice(0, 5).map((err, i) => (
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

      {/* Audax Australia Scraper Section */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Audax Australia 퍼머넌트 스크래퍼
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAuScraperStatus}
              disabled={auScraperLoading}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${auScraperLoading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <Button
              size="sm"
              onClick={runAuScraper}
              disabled={auScraperRunning}
            >
              {auScraperRunning ? (
                <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              {auScraperRunning ? "실행 중..." : "지금 실행"}
            </Button>
          </div>
        </div>

        <p className="mb-4 text-sm text-t-muted">
          Audax Australia 퍼머넌트 코스를 자동으로 가져와 세계 코스로 등록합니다.
          RideWithGPS에서 GPX 파일도 함께 다운로드합니다. 매월 1회 자동 실행됩니다.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">상태</p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  onClick={toggleAuScraper}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    auScraperStatus?.enabled ? "bg-sky-blue" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      auScraperStatus?.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm font-medium">
                  {auScraperStatus?.enabled ? "활성" : "비활성"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">AU 코스 수</p>
              <p className="mt-1 text-lg font-bold">
                {auScraperStatus?.auCourseCount ?? "—"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">마지막 실행</p>
              <p className="mt-1 text-sm font-medium">
                {auScraperStatus?.lastScrapeDate
                  ? new Date(auScraperStatus.lastScrapeDate).toLocaleString("ko-KR")
                  : "실행 기록 없음"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">마지막 결과</p>
              {auScraperStatus?.lastResult ? (
                <div className="mt-1 text-xs space-y-0.5">
                  <p>생성 <strong>{auScraperStatus.lastResult.created}</strong> / 업데이트 <strong>{auScraperStatus.lastResult.updated}</strong></p>
                  <p>스킵 {auScraperStatus.lastResult.skipped} / 오류 {auScraperStatus.lastResult.errors}</p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-t-muted">—</p>
              )}
            </CardContent>
          </Card>
        </div>

        {auScraperRunResult && (
          <Card className={`mb-4 ${auScraperRunResult.errors.length > 0 ? "border-sky-orange" : "border-green-300"}`}>
            <CardContent className="py-3">
              <div className="flex items-start gap-2">
                {auScraperRunResult.errors.length > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-sky-orange mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                )}
                <div className="text-sm">
                  <p className="font-medium">
                    수동 실행 완료: {auScraperRunResult.total}개 발견, {auScraperRunResult.created}개 생성,{" "}
                    {auScraperRunResult.updated}개 업데이트, {auScraperRunResult.skipped}개 스킵
                  </p>
                  {auScraperRunResult.errors.length > 0 && (
                    <div className="mt-1 text-xs text-t-muted">
                      {auScraperRunResult.errors.slice(0, 5).map((err, i) => (
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

      {/* Randonneurs.be Scraper Section */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Randonneurs.be 퍼머넌트 스크래퍼
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchBeScraperStatus}
              disabled={beScraperLoading}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${beScraperLoading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <Button
              size="sm"
              onClick={runBeScraper}
              disabled={beScraperRunning}
            >
              {beScraperRunning ? (
                <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              {beScraperRunning ? "실행 중..." : "지금 실행"}
            </Button>
          </div>
        </div>

        <p className="mb-4 text-sm text-t-muted">
          Randonneurs.be 벨기에 퍼머넌트 코스를 자동으로 가져와 세계 코스로 등록합니다.
          RideWithGPS에서 GPX 파일도 함께 다운로드합니다. 매월 1회 자동 실행됩니다.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">상태</p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  onClick={toggleBeScraper}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    beScraperStatus?.enabled ? "bg-sky-blue" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      beScraperStatus?.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm font-medium">
                  {beScraperStatus?.enabled ? "활성" : "비활성"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">BE 코스 수</p>
              <p className="mt-1 text-lg font-bold">
                {beScraperStatus?.beCourseCount ?? "—"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">마지막 실행</p>
              <p className="mt-1 text-sm font-medium">
                {beScraperStatus?.lastScrapeDate
                  ? new Date(beScraperStatus.lastScrapeDate).toLocaleString("ko-KR")
                  : "실행 기록 없음"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">마지막 결과</p>
              {beScraperStatus?.lastResult ? (
                <div className="mt-1 text-xs space-y-0.5">
                  <p>생성 <strong>{beScraperStatus.lastResult.created}</strong> / 업데이트 <strong>{beScraperStatus.lastResult.updated}</strong></p>
                  <p>스킵 {beScraperStatus.lastResult.skipped} / 오류 {beScraperStatus.lastResult.errors}</p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-t-muted">—</p>
              )}
            </CardContent>
          </Card>
        </div>

        {beScraperRunResult && (
          <Card className={`mb-4 ${beScraperRunResult.errors.length > 0 ? "border-sky-orange" : "border-green-300"}`}>
            <CardContent className="py-3">
              <div className="flex items-start gap-2">
                {beScraperRunResult.errors.length > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-sky-orange mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                )}
                <div className="text-sm">
                  <p className="font-medium">
                    수동 실행 완료: {beScraperRunResult.total}개 발견, {beScraperRunResult.created}개 생성,{" "}
                    {beScraperRunResult.updated}개 업데이트, {beScraperRunResult.skipped}개 스킵
                  </p>
                  {beScraperRunResult.errors.length > 0 && (
                    <div className="mt-1 text-xs text-t-muted">
                      {beScraperRunResult.errors.slice(0, 5).map((err, i) => (
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

      {/* BC Randonneurs Scraper Section */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Globe className="h-5 w-5" />
            BC Randonneurs 퍼머넌트 스크래퍼
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchBcrScraperStatus}
              disabled={bcrScraperLoading}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${bcrScraperLoading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <Button
              size="sm"
              onClick={runBcrScraper}
              disabled={bcrScraperRunning}
            >
              {bcrScraperRunning ? (
                <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              {bcrScraperRunning ? "실행 중..." : "지금 실행"}
            </Button>
          </div>
        </div>

        <p className="mb-4 text-sm text-t-muted">
          BC Randonneurs (캐나다 브리티시컬럼비아) 퍼머넌트 코스를 자동으로 가져옵니다.
          GPX 파일이 있는 코스만 동기화합니다. 매월 1회 자동 실행됩니다.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">상태</p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  onClick={toggleBcrScraper}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    bcrScraperStatus?.enabled ? "bg-sky-blue" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      bcrScraperStatus?.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm font-medium">
                  {bcrScraperStatus?.enabled ? "활성" : "비활성"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">CA 코스 수</p>
              <p className="mt-1 text-lg font-bold">
                {bcrScraperStatus?.bcrCourseCount ?? "—"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">마지막 실행</p>
              <p className="mt-1 text-sm font-medium">
                {bcrScraperStatus?.lastScrapeDate
                  ? new Date(bcrScraperStatus.lastScrapeDate).toLocaleString("ko-KR")
                  : "실행 기록 없음"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">마지막 결과</p>
              {bcrScraperStatus?.lastResult ? (
                <div className="mt-1 text-xs space-y-0.5">
                  <p>생성 <strong>{bcrScraperStatus.lastResult.created}</strong> / 업데이트 <strong>{bcrScraperStatus.lastResult.updated}</strong></p>
                  <p>스킵 {bcrScraperStatus.lastResult.skipped} / 오류 {bcrScraperStatus.lastResult.errors}</p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-t-muted">—</p>
              )}
            </CardContent>
          </Card>
        </div>

        {bcrScraperRunResult && (
          <Card className={`mb-4 ${bcrScraperRunResult.errors.length > 0 ? "border-sky-orange" : "border-green-300"}`}>
            <CardContent className="py-3">
              <div className="flex items-start gap-2">
                {bcrScraperRunResult.errors.length > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-sky-orange mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                )}
                <div className="text-sm">
                  <p className="font-medium">
                    수동 실행 완료: {bcrScraperRunResult.total}개 발견, {bcrScraperRunResult.created}개 생성,{" "}
                    {bcrScraperRunResult.updated}개 업데이트, {bcrScraperRunResult.skipped}개 스킵
                  </p>
                  {bcrScraperRunResult.errors.length > 0 && (
                    <div className="mt-1 text-xs text-t-muted">
                      {bcrScraperRunResult.errors.slice(0, 5).map((err, i) => (
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

      {/* Ontario Randonneurs Scraper Section */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Randonneurs Ontario 스크래퍼
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchOrScraperStatus}
              disabled={orScraperLoading}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${orScraperLoading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <Button
              size="sm"
              onClick={runOrScraper}
              disabled={orScraperRunning}
            >
              {orScraperRunning ? (
                <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              {orScraperRunning ? "실행 중..." : "지금 실행"}
            </Button>
          </div>
        </div>

        <p className="mb-4 text-sm text-t-muted">
          Randonneurs Ontario (캐나다 온타리오) 4개 챕터(Toronto, Simcoe-Muskoka, Ottawa, Huron)의
          코스를 RWGPS 및 GPX에서 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">상태</p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  onClick={toggleOrScraper}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    orScraperStatus?.enabled ? "bg-sky-blue" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      orScraperStatus?.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm font-medium">
                  {orScraperStatus?.enabled ? "활성" : "비활성"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">ON 코스 수</p>
              <p className="mt-1 text-lg font-bold">
                {orScraperStatus?.orCourseCount ?? "—"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">마지막 실행</p>
              <p className="mt-1 text-sm font-medium">
                {orScraperStatus?.lastScrapeDate
                  ? new Date(orScraperStatus.lastScrapeDate).toLocaleString("ko-KR")
                  : "실행 기록 없음"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">마지막 결과</p>
              {orScraperStatus?.lastResult ? (
                <div className="mt-1 text-xs space-y-0.5">
                  <p>생성 <strong>{orScraperStatus.lastResult.created}</strong> / 업데이트 <strong>{orScraperStatus.lastResult.updated}</strong></p>
                  <p>스킵 {orScraperStatus.lastResult.skipped} / 오류 {orScraperStatus.lastResult.errors}</p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-t-muted">—</p>
              )}
            </CardContent>
          </Card>
        </div>

        {orScraperRunResult && (
          <Card className={`mb-4 ${orScraperRunResult.errors.length > 0 ? "border-sky-orange" : "border-green-300"}`}>
            <CardContent className="py-3">
              <div className="flex items-start gap-2">
                {orScraperRunResult.errors.length > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-sky-orange mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                )}
                <div className="text-sm">
                  <p className="font-medium">
                    수동 실행 완료: {orScraperRunResult.total}개 발견, {orScraperRunResult.created}개 생성,{" "}
                    {orScraperRunResult.updated}개 업데이트, {orScraperRunResult.skipped}개 스킵
                  </p>
                  {orScraperRunResult.errors.length > 0 && (
                    <div className="mt-1 text-xs text-t-muted">
                      {orScraperRunResult.errors.slice(0, 5).map((err, i) => (
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

      {/* Alberta Randonneurs Scraper Section */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Alberta Randonneurs 스크래퍼
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAbScraperStatus}
              disabled={abScraperLoading}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${abScraperLoading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <Button
              size="sm"
              onClick={runAbScraper}
              disabled={abScraperRunning}
            >
              {abScraperRunning ? (
                <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              {abScraperRunning ? "실행 중..." : "지금 실행"}
            </Button>
          </div>
        </div>

        <p className="mb-4 text-sm text-t-muted">
          Alberta Randonneurs (캐나다 앨버타) 퍼머넌트 코스를 자동으로 가져옵니다. 매월 1회 자동 실행됩니다.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">상태</p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  onClick={toggleAbScraper}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    abScraperStatus?.enabled ? "bg-sky-blue" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      abScraperStatus?.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm font-medium">
                  {abScraperStatus?.enabled ? "활성" : "비활성"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">AB 코스 수</p>
              <p className="mt-1 text-lg font-bold">
                {abScraperStatus?.abCourseCount ?? "—"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">마지막 실행</p>
              <p className="mt-1 text-sm font-medium">
                {abScraperStatus?.lastScrapeDate
                  ? new Date(abScraperStatus.lastScrapeDate).toLocaleString("ko-KR")
                  : "실행 기록 없음"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">마지막 결과</p>
              {abScraperStatus?.lastResult ? (
                <div className="mt-1 text-xs space-y-0.5">
                  <p>생성 <strong>{abScraperStatus.lastResult.created}</strong> / 업데이트 <strong>{abScraperStatus.lastResult.updated}</strong></p>
                  <p>스킵 {abScraperStatus.lastResult.skipped} / 오류 {abScraperStatus.lastResult.errors}</p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-t-muted">—</p>
              )}
            </CardContent>
          </Card>
        </div>

        {abScraperRunResult && (
          <Card className={`mb-4 ${abScraperRunResult.errors.length > 0 ? "border-sky-orange" : "border-green-300"}`}>
            <CardContent className="py-3">
              <div className="flex items-start gap-2">
                {abScraperRunResult.errors.length > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-sky-orange mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                )}
                <div className="text-sm">
                  <p className="font-medium">
                    수동 실행 완료: {abScraperRunResult.total}개 발견, {abScraperRunResult.created}개 생성,{" "}
                    {abScraperRunResult.updated}개 업데이트, {abScraperRunResult.skipped}개 스킵
                  </p>
                  {abScraperRunResult.errors.length > 0 && (
                    <div className="mt-1 text-xs text-t-muted">
                      {abScraperRunResult.errors.slice(0, 5).map((err, i) => (
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

      {/* KORA Permanents Scraper Section */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Bike className="h-5 w-5" />
            한국 퍼머넌트 스크래퍼
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchKrPermScraperStatus}
              disabled={krPermScraperLoading}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${krPermScraperLoading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <Button
              size="sm"
              onClick={runKrPermScraper}
              disabled={krPermScraperRunning}
            >
              {krPermScraperRunning ? (
                <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              {krPermScraperRunning ? "실행 중..." : "지금 실행"}
            </Button>
          </div>
        </div>

        <p className="mb-4 text-sm text-t-muted">
          한국 란도너스 웹사이트에서 퍼머넌트 코스 정보와 GPX를 자동으로 가져옵니다.
          RideWithGPS에서 경로 데이터도 함께 다운로드합니다. 매월 1회 자동 실행됩니다.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">상태</p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  onClick={toggleKrPermScraper}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    krPermScraperStatus?.enabled ? "bg-sky-blue" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      krPermScraperStatus?.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm font-medium">
                  {krPermScraperStatus?.enabled ? "활성" : "비활성"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">KR 코스 수</p>
              <p className="mt-1 text-lg font-bold">
                {krPermScraperStatus?.krCourseCount ?? "—"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">마지막 실행</p>
              <p className="mt-1 text-sm font-medium">
                {krPermScraperStatus?.lastScrapeDate
                  ? new Date(krPermScraperStatus.lastScrapeDate).toLocaleString("ko-KR")
                  : "실행 기록 없음"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-3">
              <p className="text-xs text-t-muted">마지막 결과</p>
              {krPermScraperStatus?.lastResult ? (
                <div className="mt-1 text-xs space-y-0.5">
                  <p>생성 <strong>{krPermScraperStatus.lastResult.created}</strong> / 업데이트 <strong>{krPermScraperStatus.lastResult.updated}</strong></p>
                  <p>스킵 {krPermScraperStatus.lastResult.skipped} / 오류 {krPermScraperStatus.lastResult.errors}</p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-t-muted">—</p>
              )}
            </CardContent>
          </Card>
        </div>

        {krPermScraperRunResult && (
          <Card className={`mb-4 ${krPermScraperRunResult.errors.length > 0 ? "border-sky-orange" : "border-green-300"}`}>
            <CardContent className="py-3">
              <div className="flex items-start gap-2">
                {krPermScraperRunResult.errors.length > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-sky-orange mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                )}
                <div className="text-sm">
                  <p className="font-medium">
                    수동 실행 완료: {krPermScraperRunResult.total}개 발견, {krPermScraperRunResult.created}개 생성,{" "}
                    {krPermScraperRunResult.updated}개 업데이트, {krPermScraperRunResult.skipped}개 스킵
                  </p>
                  {krPermScraperRunResult.errors.length > 0 && (
                    <div className="mt-1 text-xs text-t-muted">
                      {krPermScraperRunResult.errors.slice(0, 5).map((err, i) => (
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
          DB(PostgreSQL, Keycloak)와 파일(MinIO)을 포함한 전체 백업을 생성하고 다운로드합니다.
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
