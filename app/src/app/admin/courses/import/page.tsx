"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Upload, Loader2 } from "lucide-react";

export default function ImportCoursesPage() {
  const router = useRouter();
  const [data, setData] = useState<unknown[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    errors: number;
  } | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(text);
          setData(Array.isArray(parsed) ? parsed : parsed.courses ?? []);
        } else if (file.name.endsWith(".csv")) {
          const lines = text.split("\n").filter((l) => l.trim());
          const headers = lines[0].split(",").map((h) => h.trim());
          const rows = lines.slice(1).map((line) => {
            const values = line.split(",").map((v) => v.trim());
            const obj: Record<string, string | number> = {};
            headers.forEach((h, i) => {
              obj[h] = values[i] ?? "";
            });
            if (obj.distanceKm) obj.distanceKm = parseFloat(String(obj.distanceKm));
            if (obj.elevationM) obj.elevationM = parseInt(String(obj.elevationM));
            return obj;
          });
          setData(rows);
        }
      } catch {
        alert("파일을 파싱할 수 없습니다.");
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!data) return;
    setLoading(true);
    try {
      const res = await fetch("/api/courses/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courses: data }),
      });
      const json = await res.json();
      setResult({ imported: json.imported, errors: json.errors });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">코스 일괄 가져오기</h1>

      <Card className="mb-6">
        <CardHeader>
          <p className="text-sm text-t-sub">
            JSON 또는 CSV 파일을 업로드하세요. 필수 필드: name, distanceKm,
            elevationM, startLocation, endLocation, region
          </p>
        </CardHeader>
        <CardContent>
          <input
            type="file"
            accept=".json,.csv"
            onChange={handleFileChange}
            className="mb-4 block text-sm"
          />

          {data && (
            <div className="mb-4">
              <p className="text-sm text-t-sub">
                {data.length}개의 코스를 발견했습니다.
              </p>
              <div className="mt-2 max-h-48 overflow-auto rounded border border-t-border bg-t-subtle p-3 text-xs">
                <pre>{JSON.stringify(data.slice(0, 3), null, 2)}</pre>
                {data.length > 3 && (
                  <p className="text-t-faint">... 외 {data.length - 3}개</p>
                )}
              </div>
            </div>
          )}

          <Button
            onClick={handleImport}
            disabled={!data || loading}
          >
            {loading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1 h-4 w-4" />
            )}
            가져오기
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent>
            <p className="text-sm">
              <span className="font-semibold text-t-success">
                {result.imported}개
              </span>{" "}
              성공
              {result.errors > 0 && (
                <>
                  ,{" "}
                  <span className="font-semibold text-t-danger">
                    {result.errors}개
                  </span>{" "}
                  실패
                </>
              )}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => router.push("/admin/courses")}
            >
              코스 목록으로
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
