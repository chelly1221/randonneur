"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Download, Archive } from "lucide-react";

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

  useEffect(() => {
    fetchHealth();
    fetchBackups();
  }, []);

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

      {/* Backup Management Section */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Archive className="h-5 w-5" />
            백업 관리
          </h2>
          <Button variant="outline" size="sm" onClick={fetchBackups} disabled={backupsLoading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${backupsLoading ? "animate-spin" : ""}`} />
            새로고침
          </Button>
        </div>

        <p className="mb-4 text-sm text-t-muted">
          <code>scripts/migrate-export.sh</code>로 생성한 백업 아카이브를 관리합니다.
        </p>

        {backupsLoading && backups.length === 0 ? (
          <Card>
            <CardContent className="text-center text-t-faint">
              불러오는 중...
            </CardContent>
          </Card>
        ) : backups.length === 0 ? (
          <Card>
            <CardContent className="text-center text-t-faint">
              백업 파일이 없습니다. <code>scripts/migrate-export.sh</code>를 실행하여 백업을 생성하세요.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {backups.map((backup) => (
              <Card key={backup.filename}>
                <CardContent className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{backup.filename}</p>
                    <p className="text-xs text-t-muted">
                      {formatFileSize(backup.size)} · {new Date(backup.createdAt).toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <a href={`/api/admin/backups/${encodeURIComponent(backup.filename)}`} download>
                    <Button variant="outline" size="sm">
                      <Download className="mr-1 h-4 w-4" />
                      다운로드
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
