"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Badge } from "@/components/ui/badge";
import { RangeSlider } from "@/components/ui/range-slider";
import { SeriesIcon } from "@/components/series-icon";
import { REGIONS, CATEGORIES } from "@/types";
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
import { ElevationProfile } from "@/components/course/elevation-profile";
import { CourseInlineDetail, type DetailData } from "@/components/course/course-inline-detail";
import { interpolatePointOnLine } from "@/lib/geo-utils";

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
  region: string | null;
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
  const mobileDetailPanelRef = useRef<HTMLDivElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Filters
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [sortBy, setSortBy] = useState<"number" | "distance" | "elevation" | "name">("number");
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const [seriesMenuOpen, setSeriesMenuOpen] = useState(false);
  const [distFilter, setDistFilter] = useState<[number, number]>(distanceRange);
  const [elevFilter, setElevFilter] = useState<[number, number]>(elevationRange);

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(selectedId);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Detail mode
  const [detailData, setDetailData] = useState<DetailData | null>(null);
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);
  const detailMarkersRef = useRef<maplibregl.Marker[]>([]);
  const hoverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [mobileDetailHeight, setMobileDetailHeight] = useState<number>(0);
  const detailCacheRef = useRef<Map<string, DetailData>>(new Map());
  const detailFetchRef = useRef<Map<string, Promise<DetailData | null>>>(new Map());

  // Map style
  const [mapTileId, setMapTileId] = useState("osm");
  const [tileMenuOpen, setTileMenuOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);

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
  const filteredSorted = useMemo(() => {
    const parseCourseNumber = (value: string | null): number => {
      if (!value) return Number.POSITIVE_INFINITY;
      const matched = value.match(/\d+/);
      if (!matched) return Number.POSITIVE_INFINITY;
      return Number.parseInt(matched[0], 10);
    };

    return [...filtered].sort((a, b) => {
      if (sortBy === "distance") {
        if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
        return a.name.localeCompare(b.name, "ko");
      }
      if (sortBy === "elevation") {
        if (a.elevationM !== b.elevationM) return a.elevationM - b.elevationM;
        return a.name.localeCompare(b.name, "ko");
      }
      if (sortBy === "name") {
        return a.name.localeCompare(b.name, "ko");
      }

      const aIsSr = !!a.courseNumber && /^SR-/i.test(a.courseNumber);
      const bIsSr = !!b.courseNumber && /^SR-/i.test(b.courseNumber);
      if (aIsSr !== bIsSr) return aIsSr ? 1 : -1;

      const aNum = parseCourseNumber(a.courseNumber);
      const bNum = parseCourseNumber(b.courseNumber);
      if (aNum !== bNum) return aNum - bNum;
      return a.name.localeCompare(b.name, "ko");
    });
  }, [filtered, sortBy]);

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

  const isDetailMode = selectedId !== null;

  useEffect(() => {
    if (!searchExpanded) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (searchPanelRef.current && !searchPanelRef.current.contains(target)) {
        setSearchExpanded(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [searchExpanded]);

  useEffect(() => {
    if (!searchExpanded) {
      setRegionMenuOpen(false);
      setSeriesMenuOpen(false);
    }
  }, [searchExpanded]);

  // Resize map when exiting detail mode (filter bar expands back)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || isDetailMode) return; // entering detail mode is handled by fitBounds effect
    const timer = setTimeout(() => map.resize(), 320);
    return () => clearTimeout(timer);
  }, [isDetailMode]);

  // URL sync
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idFromUrl = params.get("id");
    if (idFromUrl) setSelectedId(idFromUrl);
  }, []);

  useEffect(() => {
    const url = selectedId ? `/courses?id=${selectedId}` : "/courses";
    window.history.replaceState(null, "", url);
  }, [selectedId]);

  // Clear detail data when deselecting
  useEffect(() => {
    if (!selectedId) {
      setDetailData(null);
      setHoverPoint(null);
      setMobileDetailHeight(0);
    }
  }, [selectedId]);

  // Callback from inline detail component
  const handleDetailLoaded = useCallback((data: DetailData) => {
    if (selectedId) {
      detailCacheRef.current.set(selectedId, data);
    }
    setDetailData(data);
  }, [selectedId]);

  const handleDetailHeaderHeightChange = (height: number) => {
    setMobileDetailHeight(height);
  };

  const prefetchDetail = useCallback(async (courseId: string): Promise<DetailData | null> => {
    const cached = detailCacheRef.current.get(courseId);
    if (cached) return cached;

    const pending = detailFetchRef.current.get(courseId);
    if (pending) return pending;

    const req = fetch(`/api/courses/${courseId}/detail`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return null;
        const normalized: DetailData = {
          elevations: data.elevations ?? [],
          elevationBands: data.elevationBands ?? [],
          geojson: data.geojson ?? null,
          bounds: data.bounds ?? null,
          checkpoints: data.checkpoints ?? [],
        };
        detailCacheRef.current.set(courseId, normalized);
        return normalized;
      })
      .catch(() => null)
      .finally(() => {
        detailFetchRef.current.delete(courseId);
      });

    detailFetchRef.current.set(courseId, req);
    return req;
  }, []);

  useEffect(() => {
    if (!selectedId || detailData) return;
    const cached = detailCacheRef.current.get(selectedId);
    if (cached) {
      setDetailData(cached);
      return;
    }
    void prefetchDetail(selectedId).then((data) => {
      if (data && selectedIdRef.current === selectedId) {
        setDetailData(data);
      }
    });
  }, [selectedId, detailData, prefetchDetail]);

  useEffect(() => {
    if (!hoveredId) return;
    void prefetchDetail(hoveredId);
  }, [hoveredId, prefetchDetail]);

  // Elevation chart hover → map marker
  const handleChartHover = useCallback(
    (distanceKm: number | null) => {
      if (distanceKm === null || !detailData?.geojson) {
        setHoverPoint(null);
        return;
      }
      const point = interpolatePointOnLine(detailData.geojson, distanceKm);
      setHoverPoint(point);
    },
    [detailData?.geojson]
  );

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

  // Boost route contrast when a series(category) filter is active.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    // Detail mode has its own opacity/line styling.
    if (detailData) return;

    const emphasized = !!category;
    const casingColor = emphasized
      ? "#0f172a"
      : (mapTileId === "dark" ? "#ffffff" : "#f8fafc");
    const baseLineColor = emphasized
      ? (["get", "pastelColor"] as unknown as maplibregl.ExpressionSpecification)
      : (["get", "color"] as unknown as maplibregl.ExpressionSpecification);

    map.setPaintProperty("courses-line-casing", "line-color", casingColor);
    map.setPaintProperty("courses-line-casing", "line-width", emphasized ? 7 : 5);
    map.setPaintProperty("courses-line-casing", "line-opacity", emphasized ? 0.95 : 0.65);

    map.setPaintProperty("courses-line", "line-color", baseLineColor);
    map.setPaintProperty("courses-line", "line-width", emphasized ? 3.8 : 2);
    map.setPaintProperty("courses-line", "line-opacity", emphasized ? 0.95 : 0.7);

    map.setPaintProperty("courses-line-active-casing", "line-width", emphasized ? 10 : 8);
    map.setPaintProperty("courses-line-active-casing", "line-opacity", emphasized ? 0.95 : 0.8);
    map.setPaintProperty("courses-line-active", "line-width", emphasized ? 6 : 5);
    map.setPaintProperty("courses-line-active", "line-opacity", emphasized ? 1 : 0.9);
  }, [category, mapTileId, detailData]);

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

  // When course is selected (without detail data yet), fit bounds on map and scroll card into view
  // When deselected, zoom back out to show all visible courses
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    // Don't zoom for list-level selection if detail data is present (detail effect handles it)
    if (detailData) return;

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

    // Fit map to selected course (from explorer feature collection)
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

    // Scroll card into view (only in list mode, not detail mode)
    const card = cardRefs.current.get(selectedId);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("ring-2", "ring-sky-orange");
      setTimeout(() => {
        card.classList.remove("ring-2", "ring-sky-orange");
      }, 2000);
    }
  }, [selectedId, featureCollection, filteredIds, detailData]);

  // Detail mode: add full-res route, markers, dim other routes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    const getLiveMap = () => mapRef.current ?? map;

    // Cleanup function to restore normal state
    const cleanup = () => {
      const liveMap = getLiveMap();
      if (!liveMap) return;

      // Remove detail route layer/source
      try {
        if (liveMap.getLayer("detail-route-line")) liveMap.removeLayer("detail-route-line");
        if (liveMap.getSource("detail-route")) liveMap.removeSource("detail-route");
      } catch {
        // map may already be disposed during fast route changes/unmount
      }

      // Remove all detail markers
      for (const m of detailMarkersRef.current) m.remove();
      detailMarkersRef.current = [];

      // Restore base layer opacities
      try {
        if (liveMap.getLayer("courses-line")) {
          liveMap.setPaintProperty("courses-line", "line-opacity", 0.7);
        }
        if (liveMap.getLayer("courses-line-casing")) {
          liveMap.setPaintProperty("courses-line-casing", "line-opacity", 0.6);
        }
      } catch {
        // map/style may be gone during teardown
      }
    };

    if (!detailData || !selectedId) {
      cleanup();
      return cleanup;
    }

    // Dim other routes
    map.setPaintProperty("courses-line", "line-opacity", 0.15);
    map.setPaintProperty("courses-line-casing", "line-opacity", 0.1);

    // Add full-res route from GPX data
    if (detailData.geojson) {
      map.addSource("detail-route", {
        type: "geojson",
        data: detailData.geojson,
      });
      map.addLayer({
        id: "detail-route-line",
        type: "line",
        source: "detail-route",
        paint: {
          "line-color": "#1a237e",
          "line-width": 3,
          "line-opacity": 0.9,
        },
      });

      // Get coordinates for start/end markers
      const lineFeature = detailData.geojson.features.find(
        (f) => f.geometry.type === "LineString"
      );
      if (lineFeature && lineFeature.geometry.type === "LineString") {
        const coords = lineFeature.geometry.coordinates;
        if (coords.length > 0) {
          // Start marker (sky-blue)
          const startEl = document.createElement("div");
          startEl.className = "detail-marker-start";
          startEl.style.cssText =
            "width:14px;height:14px;border-radius:50%;background:#4fc3f7;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);";
          const startMarker = new maplibregl.Marker({ element: startEl })
            .setLngLat(coords[0] as [number, number])
            .addTo(map);
          detailMarkersRef.current.push(startMarker);

          // End marker (red)
          const endEl = document.createElement("div");
          endEl.className = "detail-marker-end";
          endEl.style.cssText =
            "width:14px;height:14px;border-radius:50%;background:#e53935;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);";
          const endMarker = new maplibregl.Marker({ element: endEl })
            .setLngLat(coords[coords.length - 1] as [number, number])
            .addTo(map);
          detailMarkersRef.current.push(endMarker);
        }
      }
    }

    // Checkpoint markers (yellow numbered circles)
    if (detailData.checkpoints.length > 0 && detailData.geojson) {
      for (let i = 0; i < detailData.checkpoints.length; i++) {
        const cp = detailData.checkpoints[i];
        // Interpolate position from distance along route
        const point = interpolatePointOnLine(detailData.geojson, cp.distanceKm);
        if (!point) continue;

        const el = document.createElement("div");
        el.style.cssText =
          "width:20px;height:20px;border-radius:50%;background:#facc15;border:2px solid #111;box-shadow:0 1px 4px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:#111;cursor:pointer;";
        el.textContent = String(i + 1);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(point)
          .addTo(map);
        detailMarkersRef.current.push(marker);
      }
    }

    // Fit bounds from GPX data (delayed to wait for layout to stabilize:
    // filter bar collapse animation 300ms + elevation profile render)
    let boundsTimer: ReturnType<typeof setTimeout> | null = null;
    if (detailData.bounds) {
      const { minLng, minLat, maxLng, maxLat } = detailData.bounds;
      boundsTimer = setTimeout(() => {
        map.resize();
        map.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          { padding: 60, maxZoom: 14 }
        );
      }, 350);
    }

    return () => {
      if (boundsTimer) clearTimeout(boundsTimer);
      cleanup();
    };
  }, [detailData, selectedId]);

  // Hover marker from elevation chart
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!hoverPoint) {
      hoverMarkerRef.current?.remove();
      hoverMarkerRef.current = null;
      return;
    }

    if (!hoverMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:10px;height:10px;border-radius:50%;background:#e53935;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);";
      hoverMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(hoverPoint)
        .addTo(map);
    } else {
      hoverMarkerRef.current.setLngLat(hoverPoint);
    }
  }, [hoverPoint]);

  const selectedCourse = selectedId
    ? courses.find((c) => c.id === selectedId) ?? null
    : null;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-y-auto scrollbar-hidden">
      {/* Filters bar — smooth collapse in detail mode */}
      <div
        className={`relative z-30 transition-all duration-300 ease-in-out ${
          isDetailMode
            ? "max-h-0 overflow-hidden opacity-0"
            : `${searchExpanded ? "overflow-visible" : "overflow-hidden"} max-h-40 opacity-100 border-b border-t-border bg-t-surface`
        }`}
      >
        <div className="px-4 py-3">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-wrap items-center gap-3">
              <div ref={searchPanelRef} className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t-faint" />
                <Input
                  placeholder="코스 검색..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearchExpanded(true)}
                  onClick={() => setSearchExpanded(true)}
                />
                {searchExpanded && (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-xl border border-t-border bg-t-surface p-3 shadow-lg">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              setRegionMenuOpen((prev) => !prev);
                              setSeriesMenuOpen(false);
                            }}
                            className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-left text-sm text-t-text focus:border-t-focus focus:outline-none focus:ring-1 focus:ring-t-focus"
                          >
                            {region || "모든 지역"}
                          </button>
                          {regionMenuOpen && (
                            <div className="absolute z-30 mt-1 w-full rounded-md border border-t-border bg-t-surface py-1 shadow-lg">
                              <button
                                type="button"
                                onClick={() => {
                                  setRegion("");
                                  setRegionMenuOpen(false);
                                }}
                                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-t-text hover:bg-t-hover"
                              >
                                모든 지역
                              </button>
                              {REGIONS.map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => {
                                    setRegion(r);
                                    setRegionMenuOpen(false);
                                  }}
                                  className="flex w-full items-center px-3 py-1.5 text-left text-sm text-t-text hover:bg-t-hover"
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              setSeriesMenuOpen((prev) => !prev);
                              setRegionMenuOpen(false);
                            }}
                            className="w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-left text-sm text-t-text focus:border-t-focus focus:outline-none focus:ring-1 focus:ring-t-focus"
                          >
                            {category
                              ? CATEGORIES.find((c) => c.value === category)?.label ?? "모든 시리즈"
                              : "모든 시리즈"}
                          </button>
                          {seriesMenuOpen && (
                            <div className="absolute z-30 mt-1 w-full rounded-md border border-t-border bg-t-surface py-1 shadow-lg">
                              <button
                                type="button"
                                onClick={() => {
                                  setCategory("");
                                  setSeriesMenuOpen(false);
                                }}
                                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-t-text hover:bg-t-hover"
                              >
                                모든 시리즈
                              </button>
                              {CATEGORIES.map((c) => (
                                <button
                                  key={c.value}
                                  type="button"
                                  onClick={() => {
                                    setCategory(c.value);
                                    setSeriesMenuOpen(false);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-t-text hover:bg-t-hover"
                                >
                                  <SeriesIcon value={c.value} emoji={c.emoji} className="h-4 w-4" />
                                  {c.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <RangeSlider
                          min={distanceRange[0]}
                          max={distanceRange[1]}
                          value={distFilter}
                          onChange={setDistFilter}
                          step={10}
                          formatLabel={(v) => `${v}km`}
                          tone="distance"
                          label="거리"
                        />
                      </div>
                      <div>
                        <RangeSlider
                          min={elevationRange[0]}
                          max={elevationRange[1]}
                          value={elevFilter}
                          onChange={setElevFilter}
                          step={100}
                          formatLabel={(v) => `${v}m`}
                          tone="elevation"
                          label="고도"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      {hasFilters && (
                        <Button variant="ghost" size="sm" onClick={clearAll}>
                          <X className="mr-1 h-3.5 w-3.5" />
                          초기화
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => setSearchExpanded(false)}>
                        닫기
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <a href="/api/courses/batch-download">
                <Button variant="outline" size="sm">
                  <Download className="mr-1 h-3.5 w-3.5" />
                  GPX 일괄 다운로드
                </Button>
              </a>

            </div>
          </div>
        </div>
      </div>

      {/* Map + List split */}
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        {/* Map column — expands on mobile detail mode, fixed 40vh otherwise */}
        <div className={`${isDetailMode ? "flex-1" : "h-[40vh]"} lg:h-full lg:flex-1 flex flex-col`}>
          <div ref={mapWrapperRef} className="relative flex-1 min-h-0">
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

          {/* Elevation chart — below map, always in DOM with max-height transition */}
          <div className={`shrink-0 overflow-hidden transition-[max-height] duration-300 ease-in-out ${
            isDetailMode
              ? "max-h-44"
              : "max-h-0"
          }`}>
            {detailData && detailData.elevations.length > 0 ? (
              <div className="bg-t-bg px-3 py-1.5 border-t border-b border-t-border">
                <ElevationProfile
                  data={detailData.elevations}
                  checkpoints={detailData.checkpoints}
                  onHover={handleChartHover}
                  compact
                />
              </div>
            ) : isDetailMode ? (
              <div className="bg-t-bg px-3 py-2 border-t border-b border-t-border">
                <div className="h-28 rounded-md bg-t-hover animate-pulse" />
              </div>
            ) : null}
          </div>
        </div>

        {/* Right panel: pinned to bottom on mobile detail; map fills remaining space */}
        <div
          ref={mobileDetailPanelRef}
          style={isDetailMode && mobileDetailHeight > 0 ? { minHeight: `${mobileDetailHeight}px` } : undefined}
          className={`${isDetailMode ? "shrink-0 bg-t-surface" : "flex-1 overflow-y-auto"} scrollbar-hidden flex flex-col transition-[height] duration-300 ease-in-out lg:relative lg:block lg:overflow-hidden border-l border-t-border lg:max-w-md lg:flex-1 lg:h-auto`}
        >
          {/* Course list — hidden on mobile when detail shown, crossfade on desktop */}
          <div
            className={`shrink-0 lg:absolute lg:inset-0 lg:overflow-y-auto lg:transition-opacity lg:duration-200 lg:ease-in-out ${
              selectedId && selectedCourse
                ? "hidden lg:block lg:opacity-0 lg:pointer-events-none"
                : ""
            }`}
          >
            {filteredSorted.length === 0 ? (
              <div className="p-8 text-center text-t-muted">
                검색 결과가 없습니다.
              </div>
            ) : (
              <div>
                <div className="border-b border-t-border bg-t-surface px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { value: "number", label: "PT 번호순" },
                      { value: "distance", label: "거리순" },
                      { value: "elevation", label: "고도순" },
                      { value: "name", label: "가나다순" },
                    ].map((opt) => {
                      const active = sortBy === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setSortBy(
                              opt.value as "number" | "distance" | "elevation" | "name"
                            )
                          }
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                            active
                              ? "bg-t-badge-p-bg text-t-badge-p-text"
                              : "bg-t-badge-bg text-t-badge-text hover:bg-t-hover"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="divide-y divide-t-divider">
                {filteredSorted.map((course) => {
                  const isSelected = course.id === selectedId;
                  const isHovered = course.id === hoveredId;
                  const series = CATEGORIES.filter((c) =>
                    course.category.includes(c.value)
                  );

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
                          <span className="text-sm font-semibold hover:text-t-link truncate block">
                            {course.courseNumber && (
                              <span className="mr-1 text-t-muted font-normal">{course.courseNumber}</span>
                            )}
                            {course.name}
                            {course.archived && (
                              <span className="ml-1 text-[10px] text-t-muted font-normal">(구)</span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {series.map((s) => (
                            <Badge key={s.value} className="text-[10px]">
                              {s.label}
                            </Badge>
                          ))}
                          <Badge variant="primary" className="text-[10px]">
                            {course.region}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-1 flex items-center gap-3 text-xs text-t-sub">
                        <span className="flex items-center gap-0.5">
                          <ArrowRight className="h-3 w-3" />
                          {Math.round(course.distanceKm)} km
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
                            className="ml-auto shrink-0 inline-flex items-center gap-1 text-t-accent hover:text-t-accent-x"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Download className="h-3 w-3" />
                            <span className="text-[10px] font-medium">GPX</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            )}
          </div>

          {/* Inline detail — flow on mobile, crossfade on desktop */}
          <div
            className={`shrink-0 overflow-visible lg:absolute lg:inset-0 lg:overflow-y-auto lg:transition-opacity lg:duration-200 lg:ease-in-out ${
              selectedId && selectedCourse
                ? "lg:opacity-100"
                : "hidden lg:block lg:opacity-0 lg:pointer-events-none"
            }`}
          >
            {selectedId && selectedCourse && (
              <div className="h-auto min-h-0 lg:h-full">
                <CourseInlineDetail
                  key={selectedId}
                  courseId={selectedId}
                  courseBasic={selectedCourse}
                  onClose={() => setSelectedId(null)}
                  onDataLoaded={handleDetailLoaded}
                  onHeaderHeightChange={handleDetailHeaderHeightChange}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
