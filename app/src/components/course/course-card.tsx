import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SeriesIcon } from "@/components/series-icon";
import { CATEGORIES } from "@/types";
import {
  MapPin,
  Mountain,
  Clock,
  Download,
  ArrowRight,
} from "lucide-react";

interface CourseCardProps {
  course: {
    id: string;
    name: string;
    distanceKm: number;
    elevationM: number;
    estimatedTime: string | null;
    startLocation: string;
    endLocation: string;
    region: string | null;
    category: string[];
    tags: string[];
    gpxFileKey: string | null;
  };
}

export function CourseCard({ course }: CourseCardProps) {
  const categories = CATEGORIES.filter((c) => course.category.includes(c.value));

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex-1">
            <Link
              href={`/courses/${course.id}`}
              className="text-lg font-semibold group-hover:text-t-link transition-colors"
            >
              {categories.map((cat) => (
                <span key={cat.value} className="mr-1 inline-flex align-middle">
                  <SeriesIcon value={cat.value} emoji={cat.emoji} />
                </span>
              ))}
              {course.name}
            </Link>
          </div>
          <Badge variant="primary">{course.region}</Badge>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-3 text-sm text-t-sub">
          <div className="flex items-center gap-1">
            <ArrowRight className="h-3.5 w-3.5" />
            <span>{course.distanceKm} km</span>
          </div>
          <div className="flex items-center gap-1">
            <Mountain className="h-3.5 w-3.5" />
            <span>{course.elevationM} m</span>
          </div>
          {course.estimatedTime && (
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>{course.estimatedTime}</span>
            </div>
          )}
        </div>

        <div className="mb-3 flex items-center gap-1 text-sm text-t-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {course.startLocation}
            {course.endLocation !== course.startLocation && (
              <> → {course.endLocation}</>
            )}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {course.tags.slice(0, 3).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
          {course.gpxFileKey && (
            <a
              href={`/api/courses/${course.id}/gpx`}
              className="flex items-center gap-1 text-xs text-t-accent hover:text-t-accent-x"
            >
              <Download className="h-3.5 w-3.5" />
              GPX
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}
