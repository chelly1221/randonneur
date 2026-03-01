"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Globe, Map as MapIcon, List, ExternalLink, Mountain } from "lucide-react";
import { Button } from "@/components/ui/button";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface WorldCourse {
  id: string;
  name: string;
  courseNumber: string | null;
  distanceKm: number;
  elevationM: number;
  region: string | null;
  category: string[];
  startLocation: string;
  endLocation: string;
  gpxFileKey: string | null;
  tags: string[];
  country: string | null;
  officialPageUrl: string | null;
  hasGeometry: boolean;
}

interface WorldCoursesClientProps {
  courses: WorldCourse[];
  featureCollection: GeoJSON.FeatureCollection;
  regions: string[];
  countries: string[];
}

/** Country code to flag emoji */
function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return "";
  const offset = 0x1f1e6;
  return (
    String.fromCodePoint(code.charCodeAt(0) - 65 + offset) +
    String.fromCodePoint(code.charCodeAt(1) - 65 + offset)
  );
}

/** Country code to name */
const COUNTRY_NAMES: Record<string, string> = {
  KR: "한국",
  AU: "호주",
};

/** Category code to display label */
const CATEGORY_LABELS: Record<string, string> = {
  permanent: "BP",
  "permanent-dirt": "BPD",
  "permanent-gravel": "BPG",
  "permanent-randonneur": "BPR",
  "super-randonneur": "SR",
  raid: "RAID",
};

export function WorldCoursesClient({
  courses,
  featureCollection,
  regions,
  countries,
}: WorldCoursesClientProps) {
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [distanceMin, setDistanceMin] = useState("");
  const [distanceMax, setDistanceMax] = useState("");
  const [view, setView] = useState<"list" | "map">("map");
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  const filtered = useMemo(() => {
    let result = courses;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.startLocation.toLowerCase().includes(q) ||
          (c.courseNumber && c.courseNumber.toLowerCase().includes(q)) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (countryFilter) {
      result = result.filter((c) => c.country === countryFilter);
    }
    if (regionFilter) {
      result = result.filter((c) => c.region === regionFilter);
    }
    if (distanceMin) {
      const min = parseFloat(distanceMin);
      if (!isNaN(min)) result = result.filter((c) => c.distanceKm >= min);
    }
    if (distanceMax) {
      const max = parseFloat(distanceMax);
      if (!isNaN(max)) result = result.filter((c) => c.distanceKm <= max);
    }
    return result;
  }, [courses, search, countryFilter, regionFilter, distanceMin, distanceMax]);

  // Initialize map when switching to map view
  useEffect(() => {
    if (view !== "map" || !mapContainerRef.current) return;
    if (mapRef.current) return; // Already initialized

    let cancelled = false;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "&copy; OpenStreetMap contributors",
          },
        },
        layers: [
          {
            id: "osm-tiles",
            type: "raster",
            source: "osm",
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: [133.77, -25.27],
      zoom: 4,
      minZoom: 1,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      if (cancelled) return;

      map.addSource("courses", {
        type: "geojson",
        data: featureCollection,
      });

      // Layer 1: White casing (outline/border)
      map.addLayer({
        id: "courses-line-casing",
        type: "line",
        source: "courses",
        paint: {
          "line-color": "#f8fafc",
          "line-width": 5,
          "line-opacity": 0.65,
        },
      });

      // Layer 2: Color-coded course line
      map.addLayer({
        id: "courses-line",
        type: "line",
        source: "courses",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
          "line-opacity": 0.7,
        },
      });

      // Layer 3: Active/hover casing (white outline)
      map.addLayer({
        id: "courses-line-active-casing",
        type: "line",
        source: "courses",
        paint: {
          "line-color": "#ffffff",
          "line-width": 8,
          "line-opacity": 0.8,
        },
        filter: ["==", ["get", "id"], ""],
      });

      // Layer 4: Active/hover highlight (orange)
      map.addLayer({
        id: "courses-line-active",
        type: "line",
        source: "courses",
        paint: {
          "line-color": "#ff9800",
          "line-width": 5,
          "line-opacity": 0.9,
        },
        filter: ["==", ["get", "id"], ""],
      });

      // Popup on click
      map.on("click", "courses-line", (e) => {
        const feature = e.features?.[0];
        if (!feature?.properties) return;
        const { name, distanceKm, region, courseNumber } = feature.properties;
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="text-sm"><strong>${name}</strong><br/>${courseNumber || ""} ${distanceKm}km${region ? ` · ${region}` : ""}</div>`
          )
          .addTo(map);
      });

      // Hover effect
      map.on("mouseenter", "courses-line", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "courses-line", () => {
        map.getCanvas().style.cursor = "";
        map.setFilter("courses-line-active-casing", ["==", ["get", "id"], ""]);
        map.setFilter("courses-line-active", ["==", ["get", "id"], ""]);
      });
      map.on("mousemove", "courses-line", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) {
          map.setFilter("courses-line-active-casing", ["==", ["get", "id"], id]);
          map.setFilter("courses-line-active", ["==", ["get", "id"], id]);
        }
      });

      // Fit to bounds if we have features
      if (featureCollection.features.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        for (const feature of featureCollection.features) {
          const geom = feature.geometry;
          if (geom.type === "LineString") {
            for (const coord of geom.coordinates) {
              bounds.extend(coord as [number, number]);
            }
          }
        }
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 50, maxZoom: 10 });
        }
      }
    });

    mapRef.current = map;

    return () => {
      cancelled = true;
    };
  }, [view, featureCollection]);

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }
    };
  }, []);

  const hasGeometryCount = courses.filter((c) => c.hasGeometry).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe className="h-6 w-6 text-sky-blue" />
          <div>
            <h1 className="text-2xl font-bold">세계 코스</h1>
            <p className="text-sm text-t-muted">
              {courses.length}개 코스
              {hasGeometryCount > 0 && ` (${hasGeometryCount}개 지도 표시)`}
            </p>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex gap-1 rounded-lg border border-t-border p-1">
          <button
            onClick={() => setView("list")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "list"
                ? "bg-t-primary text-white"
                : "text-t-muted hover:text-t-text"
            }`}
          >
            <List className="inline h-4 w-4 mr-1" />
            목록
          </button>
          <button
            onClick={() => setView("map")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "map"
                ? "bg-t-primary text-white"
                : "text-t-muted hover:text-t-text"
            }`}
          >
            <MapIcon className="inline h-4 w-4 mr-1" />
            지도
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t-faint" />
          <Input
            placeholder="코스 이름, 출발지, 태그 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="w-auto min-w-[100px]"
        >
          <option value="">전체 국가</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {countryFlag(c)} {COUNTRY_NAMES[c] || c}
            </option>
          ))}
        </Select>
        <Select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          className="w-auto min-w-[120px]"
        >
          <option value="">전체 지역</option>
          {regions.sort().map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            placeholder="최소 km"
            value={distanceMin}
            onChange={(e) => setDistanceMin(e.target.value)}
            className="w-24"
          />
          <span className="text-t-muted">~</span>
          <Input
            type="number"
            placeholder="최대 km"
            value={distanceMax}
            onChange={(e) => setDistanceMax(e.target.value)}
            className="w-24"
          />
        </div>
      </div>

      {/* Map view */}
      {view === "map" && (
        <div
          ref={mapContainerRef}
          className="mb-6 h-[500px] rounded-lg border border-t-border overflow-hidden"
        />
      )}

      {/* Results count */}
      <div className="mb-3 text-sm text-t-muted">
        {filtered.length === courses.length
          ? `총 ${courses.length}개 코스`
          : `${filtered.length}개 코스 (전체 ${courses.length}개 중)`}
      </div>

      {/* Course list */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-t-border p-12 text-center text-t-muted">
          <Globe className="mx-auto h-12 w-12 mb-3 opacity-50" />
          <p>검색 결과가 없습니다.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-t-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-t-border bg-t-faint/30">
                <th className="px-3 py-2.5 text-left font-medium text-t-muted">코스</th>
                <th className="px-3 py-2.5 text-left font-medium text-t-muted hidden sm:table-cell">유형</th>
                <th className="px-3 py-2.5 text-left font-medium text-t-muted hidden md:table-cell">출발지</th>
                <th className="px-3 py-2.5 text-right font-medium text-t-muted">거리</th>
                <th className="px-3 py-2.5 text-right font-medium text-t-muted hidden sm:table-cell">고도</th>
                <th className="px-3 py-2.5 text-left font-medium text-t-muted hidden lg:table-cell">지역</th>
                <th className="px-3 py-2.5 text-center font-medium text-t-muted w-20">GPX</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-t-border">
              {filtered.map((course) => (
                <tr
                  key={course.id}
                  className="hover:bg-t-hover transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base" title={course.country ? COUNTRY_NAMES[course.country] || course.country : ""}>
                        {countryFlag(course.country)}
                      </span>
                      <div>
                        <div className="font-medium text-t-text">
                          {course.officialPageUrl ? (
                            <a
                              href={course.officialPageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-sky-blue transition-colors inline-flex items-center gap-1"
                            >
                              {course.name}
                              <ExternalLink className="h-3 w-3 opacity-50" />
                            </a>
                          ) : (
                            course.name
                          )}
                        </div>
                        <div className="text-xs text-t-muted">
                          {course.courseNumber}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    <div className="flex gap-1">
                      {course.category.map((cat) => (
                        <Badge key={cat} className="text-xs">
                          {CATEGORY_LABELS[cat] || cat}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-t-muted hidden md:table-cell">
                    {course.startLocation}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {course.distanceKm}km
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums hidden sm:table-cell">
                    {course.elevationM > 0 ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Mountain className="h-3 w-3 text-t-muted" />
                        {course.elevationM.toLocaleString()}m
                      </span>
                    ) : (
                      <span className="text-t-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-t-muted hidden lg:table-cell">
                    {course.region || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {course.gpxFileKey ? (
                      <a href={`/api/courses/${course.id}/gpx`} download>
                        <Button variant="outline" size="sm" className="h-7 px-2">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    ) : (
                      <span className="text-t-faint text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
