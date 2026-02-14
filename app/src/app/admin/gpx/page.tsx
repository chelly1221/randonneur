"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function AdminGpxPage() {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/gpx-list")
      .then((r) => r.json())
      .then((data) => setFiles(data.files ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">GPX 파일 관리</h1>

      <Card>
        <div className="divide-y divide-t-divider">
          {loading ? (
            <div className="px-6 py-8 text-center text-t-faint">
              로딩중...
            </div>
          ) : files.length === 0 ? (
            <div className="px-6 py-8 text-center text-t-faint">
              GPX 파일이 없습니다.
            </div>
          ) : (
            files.map((file) => (
              <div
                key={file}
                className="flex items-center gap-3 px-6 py-3"
              >
                <FileText className="h-4 w-4 text-t-muted" />
                <span className="text-sm">{file}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
