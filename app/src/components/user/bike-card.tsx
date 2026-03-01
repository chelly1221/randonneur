"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Bike, Star, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const BIKE_TYPE_LABELS: Record<string, string> = {
  road: "로드",
  gravel: "그래블",
  touring: "투어링",
  mtb: "MTB",
  minivelo: "미니벨로",
  other: "기타",
};

export interface BikeData {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  type: string | null;
  imageKey: string | null;
  isDefault: boolean;
  createdAt: string;
}

interface BikeCardProps {
  bike: BikeData;
  editable?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function BikeCard({ bike, editable, onEdit, onDelete }: BikeCardProps) {
  const typeLabel = bike.type ? BIKE_TYPE_LABELS[bike.type] ?? bike.type : null;

  const details: string[] = [];
  if (bike.brand) details.push(bike.brand);
  if (bike.model) details.push(bike.model);
  if (bike.year) details.push(String(bike.year));

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-0">
        <div className="flex gap-4 p-4">
          {/* Photo or placeholder */}
          <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-t-subtle">
            {bike.imageKey ? (
              <img
                src={`/api/images/${encodeURIComponent(bike.imageKey)}`}
                alt={bike.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-t-faint">
                <Bike className="h-8 w-8" />
              </div>
            )}
            {bike.isDefault && (
              <div className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-sky-yellow text-sky-black">
                <Star className="h-3 w-3 fill-current" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-t-text">
                {bike.name}
              </h3>
              {typeLabel && (
                <span className="flex-shrink-0 rounded-full bg-sky-blue/10 px-2 py-0.5 text-xs font-medium text-sky-blue">
                  {typeLabel}
                </span>
              )}
            </div>
            {details.length > 0 && (
              <p className="mt-0.5 truncate text-xs text-t-muted">
                {details.join(" / ")}
              </p>
            )}
            {bike.isDefault && (
              <p className="mt-1 text-xs text-sky-orange font-medium">
                기본 자전거
              </p>
            )}
          </div>

          {/* Action buttons */}
          {editable && (
            <div className="flex flex-shrink-0 items-start gap-1">
              <button
                onClick={onEdit}
                className={cn(
                  "rounded-md p-1.5 text-t-muted transition-colors",
                  "hover:bg-t-hover hover:text-t-text"
                )}
                title="수정"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={onDelete}
                className={cn(
                  "rounded-md p-1.5 text-t-muted transition-colors",
                  "hover:bg-red-50 hover:text-sky-red"
                )}
                title="삭제"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
