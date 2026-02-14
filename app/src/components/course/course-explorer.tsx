"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Badge } from "@/components/ui/badge";
import { RangeSlider } from "@/components/ui/range-slider";
import { REGIONS, CATEGORIES } from "@/types";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  X,
  MapPin,
  Mountain,
  ArrowRight,
  Download,
  Layers,
} from "lucide-react";
import Link from "next/link";

const MAP_TILES = [
  {
    id: "osm",
    label: "일반",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  {
    id: "topo",
    label: "지형",
    tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
  },
  {
    id: "light",
    label: "밝은",
    tiles: ["https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  {
    id: "dark",
    label: "어두운",
    tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
] as const;

interface CourseData {
  id: string;
  name: string;
  distanceKm: number;
  elevationM: number;
  region: string;
  category: string[];
  startLocation: string;
  endLocation: string;
  courseNumber: string | null;
  gpxFileKey: string | null;
  tags: string[];
  archived: boolean;
}

interface CourseExplorerProps {
  courses: CourseData[];
  featureCollection: GeoJSON.FeatureCollection;
  distanceRange: [number, number];
  elevationRange: [number, number];
}

/** Among candidate features, find the one whose line is closest to the cursor in screen pixels. */
function findNearestFeature(
  point: { x: number; y: number },
  features: maplibregl.MapGeoJSONFeature[],
  map: maplibregl.Map,
): maplibregl.MapGeoJSONFeature | null {
  let best: maplibregl.MapGeoJSONFeature | null = null;
  let bestDist = Infinity;

  for (const f of features) {
    if (f.geometry.type !== "LineString") continue;
    const coords = f.geometry.coordinates;
    // Sample up to ~50 points per feature for performance
    const step = Math.max(1, Math.floor(coords.length / 50));
    for (let i = 0; i < coords.length; i += step) {
      const p = map.project(coords[i] as [number, number]);
      const dx = p.x - point.x;
      const dy = p.y - point.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
  }

  return best;
}

export function CourseExplorer({
  courses,
  featureCollection,
  distanceRange,
  elevationRange,
}: CourseExplorerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Filters
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [distFilter, setDistFilter] = useState<[number, number]>(distanceRange);
  const [elevFilter, setElevFilter] = useState<[number, number]>(elevationRange);

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Map style
  const [mapTileId, setMapTileId] = useState("osm");
  const [tileMenuOpen, setTileMenuOpen] = useState(false);

  // Compute filtered courses
  const filtered = courses.filter((c) => {
    if (region && c.region !== region) return false;
    if (category && !c.category.includes(category)) return false;
    if (c.distanceKm < distFilter[0] || c.distanceKm > distFilter[1])
      return false;
    if (c.elevationM < elevFilter[0] || c.elevationM > elevFilter[1])
      return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !c.name.toLowerCase().includes(q) &&
        !c.startLocation.toLowerCase().includes(q) &&
        !c.endLocation.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const filteredIdKey = filtered.map((c) => c.id).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredIds = useMemo(() => new Set(filtered.map((c) => c.id)), [filteredIdKey]);
  const filteredIdsRef = useRef<Set<string>>(filteredIds);

  const clearAll = useCallback(() => {
    setSearch("");
    setRegion("");
    setCategory("");
    setDistFilter(distanceRange);
    setElevFilter(elevationRange);
  }, [distanceRange, elevationRange]);

  // Keep refs in sync for stale closures in map callbacks
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    filteredIdsRef.current = filteredIds;
  }, [filteredIds]);

  const hasFilters =
    !!search || !!region || !!category ||
    distFilter[0] !== distanceRange[0] ||
    distFilter[1] !== distanceRange[1] ||
    elevFilter[0] !== elevationRange[0] ||
    elevFilter[1] !== elevationRange[1];

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        },
        layers: [{ id: "basemap", type: "raster", source: "basemap" }],
      },
      center: [127.5, 36.0],
      zoom: 6.0,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.FullscreenControl({ container: mapWrapperRef.current! }),
      "top-right",
    );

    // Force attribution to start collapsed (MapLibre auto-opens on desktop)
    const collapseAttrib = () => {
      mapContainerRef.current
        ?.querySelector(".maplibregl-ctrl-attrib")
        ?.classList.remove("maplibregl-compact-show");
    };
    requestAnimationFrame(collapseAttrib);
    map.once("load", collapseAttrib);

    mapRef.current = map;

    map.on("load", () => {
      map.addSource("courses", { type: "geojson", data: featureCollection });

      // Casing (outline) for better visibility on any background
      map.addLayer({
        id: "courses-line-casing",
        type: "line",
        source: "courses",
        paint: {
          "line-color": "#ffffff",
          "line-width": 5,
          "line-opacity": 0.6,
        },
      });

      // Base lines — per-course color from pre-computed "color" property
      map.addLayer({
        id: "courses-line",
        type: "line",
        source: "courses",
        paint: {
          "line-color": ["get", "color"] as unknown as maplibregl.ExpressionSpecification,
          "line-width": 2,
          "line-opacity": 0.7,
        },
      });

      // Active casing (outline) for selected/hovered course
      map.addLayer({
        id: "courses-line-active-casing",
        type: "line",
        source: "courses",
        paint: {
          "line-color": "#ffffff",
          "line-width": 8,
          "line-opacity": 0.8,
        },
        filter: [
          "==",
          ["get", "id"],
          "",
        ] as unknown as maplibregl.FilterSpecification,
      });

      // Selected/highlighted line
      map.addLayer({
        id: "courses-line-active",
        type: "line",
        source: "courses",
        paint: {
          "line-color": "#ff9800",
          "line-width": 5,
          "line-opacity": 0.9,
        },
        filter: [
          "==",
          ["get", "id"],
          "",
        ] as unknown as maplibregl.FilterSpecification,
      });

      // Click handler — toggle selection (bbox-based for easy clicking at low zoom)
      map.on("click", (e) => {
        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 20, e.point.y - 20],
          [e.point.x + 20, e.point.y + 20],
        ];
        const features = map.queryRenderedFeatures(bbox, {
          layers: ["courses-line"],
        });
        const nearest = findNearestFeature(e.point, features, map);
        if (nearest) {
          const id = nearest.properties?.id;
          if (id === selectedIdRef.current) setSelectedId(null);
          else if (id) setSelectedId(id);
        }
      });

      // Proximity hover — highlight nearest course within 20px of cursor
      map.on("mousemove", (e) => {
        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 20, e.point.y - 20],
          [e.point.x + 20, e.point.y + 20],
        ];
        const features = map.queryRenderedFeatures(bbox, {
          layers: ["courses-line"],
        });
        const nearest = findNearestFeature(e.point, features, map);
        if (nearest) {
          map.getCanvas().style.cursor = "pointer";
          const id = nearest.properties?.id;
          if (id) setHoveredId(id);
        } else {
          map.getCanvas().style.cursor = "";
          setHoveredId(null);
        }
      });

      // Apply initial filter state (effects already ran before layers existed)
      const ids = [...filteredIdsRef.current];
      if (ids.length > 0) {
        const filter = [
          "in",
          ["get", "id"],
          ["literal", ids],
        ] as unknown as maplibregl.FilterSpecification;
        map.setFilter("courses-line-casing", filter);
        map.setFilter("courses-line", filter);
      }

      mapReadyRef.current = true;
    });

    return () => {
      mapReadyRef.current = false;
      mapRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch map tile source
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    const tile = MAP_TILES.find((t) => t.id === mapTileId) ?? MAP_TILES[0];

    if (map.getLayer("basemap")) map.removeLayer("basemap");
    if (map.getSource("basemap")) map.removeSource("basemap");

    map.addSource("basemap", {
      type: "raster",
      tiles: [...tile.tiles],
      tileSize: 256,
      attribution: tile.attribution,
    });
    // Insert below course layers (including casing)
    map.addLayer(
      { id: "basemap", type: "raster", source: "basemap" },
      "courses-line-casing"
    );
  }, [mapTileId]);

  // Update map filter for visible courses
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    const ids = [...filteredIds];
    if (ids.length > 0) {
      const filter = [
        "in",
        ["get", "id"],
        ["literal", ids],
      ] as unknown as maplibregl.FilterSpecification;
      map.setFilter("courses-line-casing", filter);
      map.setFilter("courses-line", filter);
    } else {
      const filter = [
        "==",
        ["get", "id"],
        "",
      ] as unknown as maplibregl.FilterSpecification;
      map.setFilter("courses-line-casing", filter);
      map.setFilter("courses-line", filter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredIdKey]);

  // Update active/highlight filter
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    const activeId = selectedId || hoveredId || "";
    const filter = [
      "==",
      ["get", "id"],
      activeId,
    ] as unknown as maplibregl.FilterSpecification;
    map.setFilter("courses-line-active-casing", filter);
    map.setFilter("courses-line-active", filter);
  }, [selectedId, hoveredId]);

  // When course is selected, fit bounds on map and scroll card into view
  // When deselected, zoom back out to show all visible courses
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    if (!selectedId) {
      // Zoom back out to show all visible courses
      const bounds = new maplibregl.LngLatBounds();
      let hasCoords = false;
      for (const feature of featureCollection.features) {
        if (!filteredIds.has(feature.properties?.id)) continue;
        if (feature.geometry.type === "LineString") {
          for (const c of feature.geometry.coordinates) {
            bounds.extend(c as [number, number]);
            hasCoords = true;
          }
        }
      }
      if (hasCoords) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 12 });
      }
      return;
    }

    // Fit map to selected course
    const feature = featureCollection.features.find(
      (f) => f.properties?.id === selectedId
    );
    if (feature && feature.geometry.type === "LineString") {
      const coords = feature.geometry.coordinates;
      if (coords.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        for (const c of coords) {
          bounds.extend(c as [number, number]);
        }
        map.fitBounds(bounds, { padding: 60, maxZoom: 12 });
      }
    }

    // Scroll card into view
    const card = cardRefs.current.get(selectedId);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("ring-2", "ring-sky-orange");
      setTimeout(() => {
        card.classList.remove("ring-2", "ring-sky-orange");
      }, 2000);
    }
  }, [selectedId, featureCollection, filteredIds]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Filters bar */}
      <div className="shrink-0 border-b border-t-border bg-t-surface px-4 py-3">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t-faint" />
              <Input
                placeholder="코스 검색..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">모든 지역</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>

            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">모든 시리즈</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </Select>

            <div className="w-40">
              <RangeSlider
                min={distanceRange[0]}
                max={distanceRange[1]}
                value={distFilter}
                onChange={setDistFilter}
                step={10}
                formatLabel={(v) => `${v}km`}
              />
            </div>

            <div className="w-40">
              <RangeSlider
                min={elevationRange[0]}
                max={elevationRange[1]}
                value={elevFilter}
                onChange={setElevFilter}
                step={100}
                formatLabel={(v) => `${v}m`}
              />
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <X className="mr-1 h-3.5 w-3.5" />
                초기화
              </Button>
            )}

            <a href="/api/courses/batch-download">
              <Button variant="outline" size="sm">
                <Download className="mr-1 h-3.5 w-3.5" />
                GPX 일괄 다운로드
              </Button>
            </a>

            <span className="text-xs text-t-muted">{filtered.length}개 코스</span>
          </div>
        </div>
      </div>

      {/* Map + List split */}
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        {/* Map panel */}
        <div ref={mapWrapperRef} className="relative h-[40vh] lg:h-full lg:flex-1">
          <div ref={mapContainerRef} className="h-full w-full" />
          {/* Map tile selector */}
          <div className="absolute bottom-3 left-3 z-10">
            {tileMenuOpen ? (
              <div className="flex gap-1 rounded-lg bg-white/90 p-1 shadow-lg backdrop-blur-sm">
                {MAP_TILES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setMapTileId(t.id); setTileMenuOpen(false); }}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      mapTileId === t.id
                        ? "bg-sky-darkblue text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setTileMenuOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-lg backdrop-blur-sm hover:bg-white"
              >
                <Layers className="h-3.5 w-3.5" />
                {MAP_TILES.find((t) => t.id === mapTileId)?.label ?? "일반"}
              </button>
            )}
          </div>
        </div>

        {/* Course list panel */}
        <div className="flex-1 overflow-y-auto border-l border-t-border lg:max-w-md">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-t-muted">
              검색 결과가 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-t-divider">
              {filtered.map((course) => {
                const cats = CATEGORIES.filter((c) => course.category.includes(c.value));
                const isSelected = course.id === selectedId;
                const isHovered = course.id === hoveredId;

                return (
                  <div
                    key={course.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(course.id, el);
                    }}
                    className={`p-3 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-sky-orange/10"
                        : isHovered
                          ? "bg-t-hover"
                          : "hover:bg-t-hover"
                    }`}
                    onClick={() =>
                      setSelectedId(isSelected ? null : course.id)
                    }
                    onMouseEnter={() => setHoveredId(course.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/courses/${course.id}`}
                          className="text-sm font-semibold hover:text-t-link truncate block"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {cats.map((cat) => (
                            <span key={cat.value} className="mr-1">{cat.emoji}</span>
                          ))}
                          {course.courseNumber && (
                            <span className="mr-1 text-t-muted font-normal">{course.courseNumber}</span>
                          )}
                          {course.name}
                          {course.archived && (
                            <span className="ml-1 text-[10px] text-t-muted font-normal">(구)</span>
                          )}
                        </Link>
                      </div>
                      <Badge variant="primary" className="shrink-0 text-[10px]">
                        {course.region}
                      </Badge>
                    </div>

                    <div className="mt-1 flex items-center gap-3 text-xs text-t-sub">
                      <span className="flex items-center gap-0.5">
                        <ArrowRight className="h-3 w-3" />
                        {course.distanceKm} km
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Mountain className="h-3 w-3" />
                        {course.elevationM} m
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-1 text-xs text-t-muted">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {course.startLocation}
                        {course.endLocation !== course.startLocation && (
                          <> → {course.endLocation}</>
                        )}
                      </span>
                      {course.gpxFileKey && (
                        <a
                          href={`/api/courses/${course.id}/gpx`}
                          className="ml-auto shrink-0 text-t-accent hover:text-t-accent-x"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
