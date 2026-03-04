"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user/user-avatar";
import { MapPin, Users, ExternalLink } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "primary" | "success" | "warning" | "danger" }> = {
  open: { label: "모집중", variant: "success" },
  closed: { label: "마감", variant: "default" },
  completed: { label: "완료", variant: "primary" },
  cancelled: { label: "취소", variant: "danger" },
};

interface RecruitCardData {
  id: string;
  title: string;
  description: string | null;
  rideDate: string;
  meetingPoint: string | null;
  maxMembers: number;
  status: string;
  createdAt: string;
  participantCount: number;
  user: { id: string; displayName: string; avatarKey: string | null };
  course: { id: string; name: string; distanceKm: number; region: string | null } | null;
}

export function RideRecruitCard({ recruit }: { recruit: RecruitCardData }) {
  const rideDate = new Date(recruit.rideDate);
  const day = format(rideDate, "d");
  const month = format(rideDate, "MMM", { locale: ko });
  const weekday = format(rideDate, "EEE", { locale: ko });
  const statusConfig = STATUS_CONFIG[recruit.status] || STATUS_CONFIG.open;
  const isFull = recruit.participantCount >= recruit.maxMembers;

  return (
    <Link href={`/community/rides/${recruit.id}`}>
      <Card className="hover:bg-t-hover transition-colors">
        <CardContent className="py-3 px-4">
          <div className="flex gap-3">
            {/* Date display */}
            <div className="flex flex-col items-center justify-center rounded-lg bg-sky-darkblue/10 px-3 py-2 min-w-[60px]">
              <span className="text-[10px] font-medium text-sky-darkblue uppercase">{month}</span>
              <span className="text-xl font-bold text-sky-darkblue leading-tight">{day}</span>
              <span className="text-[10px] text-t-muted">{weekday}</span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <Badge variant={statusConfig.variant} className="text-[9px] px-1.5 py-0">
                  {statusConfig.label}
                </Badge>
                {isFull && recruit.status === "open" && (
                  <Badge variant="danger" className="text-[9px] px-1.5 py-0">
                    인원 마감
                  </Badge>
                )}
              </div>

              <h3 className="text-sm font-semibold text-t-text truncate">{recruit.title}</h3>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-t-muted">
                {recruit.meetingPoint && (
                  <span className="flex items-center gap-0.5 truncate">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {recruit.meetingPoint}
                  </span>
                )}
                <span className="flex items-center gap-0.5">
                  <Users className="h-3 w-3" />
                  {recruit.participantCount}/{recruit.maxMembers}명
                </span>
                {recruit.course && (
                  <span className="flex items-center gap-0.5 truncate">
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    {recruit.course.name} ({recruit.course.distanceKm}km)
                  </span>
                )}
              </div>

              {/* Creator */}
              <div className="mt-1.5 flex items-center gap-1">
                <UserAvatar
                  displayName={recruit.user.displayName}
                  avatarKey={recruit.user.avatarKey}
                  size="sm"
                />
                <span className="text-[10px] text-t-muted">
                  {recruit.user.displayName}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
