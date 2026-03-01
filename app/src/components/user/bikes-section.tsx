"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bike } from "lucide-react";

interface BikeEntry {
  id: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  type?: string | null;
  isDefault?: boolean;
}

const BIKE_TYPE_LABELS: Record<string, string> = {
  road: "로드",
  gravel: "그래블",
  touring: "투어링",
  mtb: "MTB",
  hybrid: "하이브리드",
  folding: "접이식",
  ebike: "전기자전거",
};

interface BikesSectionProps {
  userId: string;
}

export function BikesSection({ userId }: BikesSectionProps) {
  const [bikes, setBikes] = useState<BikeEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/bikes?userId=${userId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setBikes(data);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [userId]);

  if (!loaded || bikes.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">자전거</h2>
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
        {bikes.map((bike) => (
          <Card key={bike.id}>
            <CardContent className="flex items-center gap-3 py-3">
              <Bike className="h-5 w-5 text-t-muted shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{bike.name}</p>
                  {bike.isDefault && (
                    <Badge variant="primary" className="text-[9px] px-1.5 py-0 shrink-0">
                      기본
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-t-muted truncate">
                  {[
                    bike.brand,
                    bike.model,
                    bike.year,
                    bike.type ? BIKE_TYPE_LABELS[bike.type] || bike.type : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "\u00A0"}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
