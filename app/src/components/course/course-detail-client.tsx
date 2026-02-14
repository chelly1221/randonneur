"use client";

import { useState, useCallback } from "react";
import { CourseMap } from "@/components/map/course-map";
import { ElevationProfile } from "@/components/course/elevation-profile";
import { GeolocationTracker } from "@/components/course/geolocation-tracker";
import { interpolatePointOnLine, closestPointOnLine } from "@/lib/geo-utils";

interface Checkpoint {
  id: string;
  name: string;
  description: string | null;
  distanceKm: number;
  imageKey?: string | null;
}

interface CourseDetailClientProps {
  geojson: GeoJSON.FeatureCollection | null;
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } | null;
  elevations: { distance: number; elevation: number }[];
  checkpoints: Checkpoint[];
  compact?: boolean;
}

export function CourseDetailClient({
  geojson,
  bounds,
  elevations,
  checkpoints,
  compact,
}: CourseDetailClientProps) {
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [closestPt, setClosestPt] = useState<[number, number] | null>(null);
  const [currentDistanceKm, setCurrentDistanceKm] = useState<number | null>(null);

  const handleChartHover = useCallback(
    (distanceKm: number | null) => {
      if (distanceKm === null || !geojson) {
        setHoverPoint(null);
        return;
      }
      const point = interpolatePointOnLine(geojson, distanceKm);
      setHoverPoint(point);
    },
    [geojson]
  );

  const handleLocationUpdate = useCallback(
    (lngLat: [number, number] | null) => {
      setUserLocation(lngLat);
      if (lngLat && geojson) {
        const result = closestPointOnLine(geojson, {
          lng: lngLat[0],
          lat: lngLat[1],
        });
        if (result) {
          setClosestPt(result.point);
          setCurrentDistanceKm(result.distanceAlongKm);
        }
      } else {
        setClosestPt(null);
        setCurrentDistanceKm(null);
      }
    },
    [geojson]
  );

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Map */}
      <div className="flex-1 overflow-hidden rounded-lg border border-t-border min-h-[250px] relative">
        <CourseMap
          geojson={geojson}
          bounds={bounds}
          checkpoints={checkpoints}
          hoverPoint={hoverPoint}
          userLocation={userLocation}
          closestPoint={closestPt}
          className="h-full"
        />
        <GeolocationTracker
          onLocationUpdate={handleLocationUpdate}
          distanceAlongKm={currentDistanceKm}
        />
      </div>

      {/* Elevation profile */}
      {elevations.length > 0 && (
        <div className="mt-2 shrink-0 rounded-lg border border-t-border bg-t-surface px-3 py-2">
          <ElevationProfile
            data={elevations}
            checkpoints={checkpoints}
            onHover={handleChartHover}
            currentDistanceKm={currentDistanceKm}
            compact={compact}
          />
        </div>
      )}
    </div>
  );
}
