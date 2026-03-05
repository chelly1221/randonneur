"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { interpolatePointOnLine } from "@/lib/geo-utils";

interface Checkpoint {
  id: string;
  name: string;
  description?: string | null;
  distanceKm: number;
  imageKey?: string | null;
}

interface CourseMapProps {
  geojson?: GeoJSON.FeatureCollection | null;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } | null;
  checkpoints?: Checkpoint[];
  hoverPoint?: [number, number] | null;
  userLocation?: [number, number] | null;
  closestPoint?: [number, number] | null;
  className?: string;
  children?: ReactNode;
}

export function CourseMap({
  geojson,
  bounds,
  checkpoints,
  hoverPoint,
  userLocation,
  closestPoint,
  className = "h-96",
  children,
}: CourseMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const hoverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const closestMarkerRef = useRef<maplibregl.Marker | null>(null);
  const cpMarkersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [127.5, 36.5],
      zoom: 7,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    // Force attribution to start collapsed (MapLibre auto-opens on desktop)
    const collapseAttrib = () => {
      containerRef.current
        ?.querySelector(".maplibregl-ctrl-attrib")
        ?.classList.remove("maplibregl-compact-show");
    };
    requestAnimationFrame(collapseAttrib);
    map.once("load", collapseAttrib);

    mapRef.current = map;

    map.on("load", () => {
      if (geojson && geojson.features.length > 0) {
        map.addSource("route", { type: "geojson", data: geojson });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#1a237e",
            "line-width": 3,
            "line-opacity": 0.8,
          },
        });

        // Start/end markers
        const firstFeature = geojson.features[0];
        if (firstFeature.geometry.type === "LineString") {
          const coords = firstFeature.geometry.coordinates;
          if (coords.length > 0) {
            new maplibregl.Marker({ color: "#4fc3f7" })
              .setLngLat(coords[0] as [number, number])
              .setPopup(new maplibregl.Popup().setText("출발"))
              .addTo(map);
            new maplibregl.Marker({ color: "#e53935" })
              .setLngLat(coords[coords.length - 1] as [number, number])
              .setPopup(new maplibregl.Popup().setText("도착"))
              .addTo(map);
          }
        }

        // Checkpoint markers
        if (checkpoints && checkpoints.length > 0 && geojson) {
          checkpoints.forEach((cp, i) => {
            const pt = interpolatePointOnLine(geojson, cp.distanceKm);
            if (pt) {
              const el = document.createElement("div");
              el.className = "cp-marker";
              el.style.cssText =
                "width:20px;height:20px;background:#ff9800;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);cursor:pointer;color:#fff;font-size:11px;font-weight:bold;display:flex;align-items:center;justify-content:center;";
              el.textContent = String(i + 1);

              const marker = new maplibregl.Marker({ element: el })
                .setLngLat(pt)
                .addTo(map);

              cpMarkersRef.current.push(marker);
            }
          });
        }
      }

      if (bounds) {
        map.fitBounds(
          [
            [bounds.minLng, bounds.minLat],
            [bounds.maxLng, bounds.maxLat],
          ],
          { padding: 40, maxZoom: 14 }
        );
      }
    });

    return () => {
      cpMarkersRef.current.forEach((m) => m.remove());
      cpMarkersRef.current = [];
      hoverMarkerRef.current?.remove();
      userMarkerRef.current?.remove();
      closestMarkerRef.current?.remove();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson, bounds, checkpoints]);

  // Hover point marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (hoverPoint) {
      if (!hoverMarkerRef.current) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:12px;height:12px;background:#e53935;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);pointer-events:none;";
        hoverMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat(hoverPoint).addTo(map);
      } else {
        hoverMarkerRef.current.setLngLat(hoverPoint);
      }
    } else {
      hoverMarkerRef.current?.remove();
      hoverMarkerRef.current = null;
    }
  }, [hoverPoint]);

  // User location marker (blue pulsing)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userLocation) {
      if (!userMarkerRef.current) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:16px;height:16px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(59,130,246,0.3);";
        el.className = "animate-pulse";
        userMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat(userLocation).addTo(map);
      } else {
        userMarkerRef.current.setLngLat(userLocation);
      }
    } else {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
    }
  }, [userLocation]);

  // Closest point on line marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (closestPoint) {
      if (!closestMarkerRef.current) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:10px;height:10px;background:#e53935;border:2px solid #fff;border-radius:50%;pointer-events:none;";
        closestMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat(closestPoint).addTo(map);
      } else {
        closestMarkerRef.current.setLngLat(closestPoint);
      }
    } else {
      closestMarkerRef.current?.remove();
      closestMarkerRef.current = null;
    }
  }, [closestPoint]);

  return (
    <div ref={containerRef} className={`${className} relative`}>
      {children}
    </div>
  );
}
