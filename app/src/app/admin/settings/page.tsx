"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, RefreshCw, Eye, EyeOff } from "lucide-react";

interface SettingItem {
  key: string;
  label: string;
  group: string;
  password?: boolean;
  value: string;
  source: "db" | "env";
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      const data = await res.json();
      setSettings(data.settings);
      const vals: Record<string, string> = {};
      for (const s of data.settings) {
        vals[s.key] = s.value;
      }
      setValues(vals);
    } catch {
      setError("설정을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function togglePasswordVisibility(key: string) {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    if (!confirm("설정을 저장하면 서버가 자동으로 재시작됩니다. 계속하시겠습니까?")) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: values }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "저장 실패");
        setSaving(false);
        return;
      }
      // Server will restart — poll until back up
      setRestarting(true);
      setSaving(false);
      await waitForRestart();
    } catch {
      setError("저장 중 오류가 발생했습니다.");
      setSaving(false);
    }
  }

  async function waitForRestart() {
    // Wait for server to go down
    await new Promise((r) => setTimeout(r, 3000));
    // Poll until back up
    while (true) {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (res.ok) {
          window.location.reload();
          return;
        }
      } catch {
        // Still down
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Group settings
  const groups = new Map<string, SettingItem[]>();
  for (const s of settings) {
    const list = groups.get(s.group) ?? [];
    list.push(s);
    groups.set(s.group, list);
  }

  if (restarting) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <RefreshCw className="mb-4 h-8 w-8 animate-spin text-t-primary" />
        <p className="text-lg font-medium">서버를 재시작하고 있습니다...</p>
        <p className="mt-2 text-sm text-t-muted">잠시 후 페이지가 자동으로 새로고침됩니다.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">설정 관리</h1>
        <Button size="sm" onClick={handleSave} disabled={saving || loading}>
          {saving ? (
            <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          {saving ? "저장 중..." : "저장"}
        </Button>
      </div>

      <p className="mb-6 text-sm text-t-muted">
        앱 설정을 관리합니다. 저장하면 서버가 자동으로 재시작되어 변경사항이 적용됩니다.
      </p>

      {error && (
        <Card className="mb-4 border-red-300 bg-red-50">
          <CardContent className="text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="text-center text-t-faint">불러오는 중...</CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([group, items]) => (
            <Card key={group}>
              <CardContent>
                <h2 className="mb-4 text-lg font-semibold">{group}</h2>
                <div className="space-y-4">
                  {items.map((item) => (
                    <div key={item.key}>
                      <div className="mb-1 flex items-center gap-2">
                        <label className="text-sm font-medium text-t-text">{item.label}</label>
                        <Badge variant={item.source === "db" ? "success" : "default"}>
                          {item.source === "db" ? "DB" : "ENV"}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type={item.password && !visiblePasswords.has(item.key) ? "password" : "text"}
                          className="flex-1 rounded-md border border-t-border bg-t-surface px-3 py-2 font-mono text-sm focus:border-t-primary focus:outline-none"
                          value={values[item.key] ?? ""}
                          onChange={(e) => handleChange(item.key, e.target.value)}
                          placeholder={item.key}
                        />
                        {item.password && (
                          <button
                            type="button"
                            className="rounded-md border border-t-border px-2 text-t-muted hover:text-t-text"
                            onClick={() => togglePasswordVisibility(item.key)}
                          >
                            {visiblePasswords.has(item.key) ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-t-faint">{item.key}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
