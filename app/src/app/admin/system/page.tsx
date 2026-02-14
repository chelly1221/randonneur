"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";

interface ServiceStatus {
  name: string;
  status: "ok" | "error";
  message?: string;
}

interface HealthData {
  status: string;
  services: ServiceStatus[];
}

export default function SystemStatusPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);

  function fetchHealth() {
    setLoading(true);
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setLoading(false));
  }

  useEffect(fetchHealth, []);

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
    </div>
  );
}
