"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user/user-avatar";
import { Download, Trash2, MapPin, TrendingUp, Route } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

interface SharedRouteEntry {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  distance: number | null;
  elevation: number | null;
  region: string | null;
  gpxFileKey: string;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
  user: { id: string; keycloakId: string; displayName: string; avatarKey: string | null };
}

interface SharedRouteCardProps {
  route: SharedRouteEntry;
  onDelete: (id: string) => void;
}

export function SharedRouteCard({ route, onDelete }: SharedRouteCardProps) {
  const { data: session } = useSession();
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloadCount, setDownloadCount] = useState(route.downloadCount);

  const isOwner = session?.user?.id && route.user.keycloakId === session.user.id;
  const isAdmin = session?.user?.roles?.includes("admin");
  const canDelete = isOwner || isAdmin;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/shared-routes/${route.id}/download`);
      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Extract filename from Content-Disposition header
      const disposition = res.headers.get("Content-Disposition");
      let filename = `${route.title}.gpx`;
      if (disposition) {
        const filenameMatch = disposition.match(/filename\*=UTF-8''(.+)/);
        if (filenameMatch) {
          filename = decodeURIComponent(filenameMatch[1]);
        }
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadCount((c) => c + 1);
    } catch {
      // silent
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("이 루트를 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/shared-routes/${route.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      onDelete(route.id);
    } catch {
      alert("삭제에 실패했습니다");
    } finally {
      setDeleting(false);
    }
  };

  const timeAgo = formatDistanceToNow(new Date(route.createdAt), {
    addSuffix: true,
    locale: ko,
  });

  return (
    <Card>
      <CardContent className="py-3 px-4">
        {/* Header: title + meta */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-t-text truncate">
              {route.title}
            </h3>
          </div>
          <span className="text-[10px] text-t-muted whitespace-nowrap shrink-0">
            {timeAgo}
          </span>
        </div>

        {/* Author */}
        <div className="mb-2 flex items-center gap-1.5">
          <Link
            href={`/users/${route.user.id}`}
            className="flex items-center gap-1 hover:underline"
          >
            <UserAvatar
              displayName={route.user.displayName}
              avatarKey={route.user.avatarKey}
              size="sm"
            />
            <span className="text-[11px] font-medium text-t-text">
              {route.user.displayName}
            </span>
          </Link>
        </div>

        {/* Description */}
        {route.description && (
          <p className="mb-2 text-xs text-t-muted line-clamp-2">
            {route.description}
          </p>
        )}

        {/* Stats + actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-t-muted">
            {route.region && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                <MapPin className="mr-0.5 h-2.5 w-2.5" />
                {route.region}
              </Badge>
            )}
            {route.distance != null && route.distance > 0 && (
              <span className="flex items-center gap-0.5">
                <Route className="h-3 w-3" />
                {route.distance.toFixed(1)} km
              </span>
            )}
            {route.elevation != null && route.elevation > 0 && (
              <span className="flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3" />
                {Math.round(route.elevation)} m
              </span>
            )}
            <span className="flex items-center gap-0.5">
              <Download className="h-3 w-3" />
              {downloadCount}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1 rounded-md bg-sky-blue/15 px-2.5 py-1 text-[11px] font-medium text-sky-blue transition-colors hover:bg-sky-blue/25 disabled:opacity-50"
            >
              <Download className="h-3 w-3" />
              {downloading ? "..." : "GPX"}
            </button>

            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1 rounded-md bg-sky-red/10 px-2 py-1 text-[11px] font-medium text-sky-red transition-colors hover:bg-sky-red/20 disabled:opacity-50"
                title="삭제"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
