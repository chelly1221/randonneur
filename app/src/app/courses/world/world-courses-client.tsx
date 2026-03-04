"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RangeSlider } from "@/components/ui/range-slider";
import { ElevationProfile } from "@/components/course/elevation-profile";
import { CourseInlineDetail, type DetailData } from "@/components/course/course-inline-detail";
import { interpolatePointOnLine } from "@/lib/geo-utils";
import {
  Search,
  Download,
  Globe,
  ExternalLink,
  Mountain,
  MapPin,
  ArrowRight,
  X,
  Layers,
} from "lucide-react";
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
  distanceRange: [number, number];
  elevationRange: [number, number];
  categories: string[];
}

const MAP_TILES = [
  {
    id: "osm",
    label: "OSM",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  {
    id: "topo",
    label: "Topo",
    tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
    attribution:
      '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
  },
  {
    id: "light",
    label: "Light",
    tiles: ["https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  {
    id: "dark",
    label: "Dark",
    tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
] as const;

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
  AU: "Australia",
  BE: "Belgium",
  CA: "Canada",
  DE: "Germany",
  DK: "Denmark",
  ES: "Spain",
  FR: "France",
  GB: "United Kingdom",
  IE: "Ireland",
  IT: "Italy",
  JP: "Japan",
  KR: "Korea",
  NO: "Norway",
  NZ: "New Zealand",
  US: "United States",
  ZA: "South Africa",
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

/** Among candidate features, find the one whose line is closest to the cursor in screen pixels. */
function findNearestFeature(
  point: { x: number; y: number },
  features: maplibregl.MapGeoJSONFeature[],
  map: maplibregl.Map
): maplibregl.MapGeoJSONFeature | null {
  let best: maplibregl.MapGeoJSONFeature | null = null;
  let bestDist = Infinity;

  for (const f of features) {
    if (f.geometry.type !== "LineString") continue;
    const coords = f.geometry.coordinates;
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

export function WorldCoursesClient({
  courses,
  featureCollection,
  regions,
  countries,
  distanceRange,
  elevationRange,
  categories,
}: WorldCoursesClientProps) {
  // Filters
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [distFilter, setDistFilter] = useState<[number, number]>(distanceRange);
  const [elevFilter, setElevFilter] = useState<[number, number]>(elevationRange);
  const [sortBy, setSortBy] = useState<"distance" | "elevation" | "name" | "country">("country");
  const [searchExpanded, setSearchExpanded] = useState(false);

  // Selection / hover
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(selectedId);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Detail mode
  const [detailData, setDetailData] = useState<DetailData | null>(null);
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);
  const [mapCollapsed, setMapCollapsed] = useState(false);
  const handleToggleMap = useCallback(() => setMapCollapsed((v) => !v), []);
  const detailMarkersRef = useRef<maplibregl.Marker[]>([]);
  const hoverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const detailCacheRef = useRef<Map<string, DetailData>>(new Map());
  const detailFetchRef = useRef<Map<string, Promise<DetailData | null>>>(new Map());
  const [mobileDetailHeight, setMobileDetailHeight] = useState<number>(0);

  // Map
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const searchPanelRef = useRef<HTMLDivElement>(null);

  // Map style
  const [mapTileId, setMapTileId] = useState("osm");
  const [tileMenuOpen, setTileMenuOpen] = useState(false);

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
    if (categoryFilter) {
      result = result.filter((c) => c.category.includes(categoryFilter));
    }
    result = result.filter(
      (c) => c.distanceKm >= distFilter[0] && c.distanceKm <= distFilter[1]
    );
    result = result.filter(
      (c) => c.elevationM >= elevFilter[0] && c.elevationM <= elevFilter[1]
    );
    return result;
  }, [courses, search, countryFilter, regionFilter, categoryFilter, distFilter, elevFilter]);

  const filteredSorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "distance") {
        if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "elevation") {
        if (a.elevationM !== b.elevationM) return b.elevationM - a.elevationM;
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      // country sort (default)
      const ca = a.country || "";
      const cb = b.country || "";
      if (ca !== cb) return ca.localeCompare(cb);
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
      return a.name.localeCompare(b.name);
    });
  }, [filtered, sortBy]);

  const filteredIdKey = filtered.map((c) => c.id).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredIds = useMemo(() => new Set(filtered.map((c) => c.id)), [filteredIdKey]);
  const filteredIdsRef = useRef<Set<string>>(filteredIds);

  const hasFilters =
    !!search ||
    !!countryFilter ||
    !!regionFilter ||
    !!categoryFilter ||
    distFilter[0] !== distanceRange[0] ||
    distFilter[1] !== distanceRange[1] ||
    elevFilter[0] !== elevationRange[0] ||
    elevFilter[1] !== elevationRange[1];

  const clearAll = useCallback(() => {
    setSearch("");
    setCountryFilter("");
    setRegionFilter("");
    setCategoryFilter("");
    setDistFilter(distanceRange);
    setElevFilter(elevationRange);
  }, [distanceRange, elevationRange]);

  const isDetailMode = selectedId !== null;

  // Keep refs in sync
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    filteredIdsRef.current = filteredIds;
  }, [filteredIds]);

  // Close search panel on outside click
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

  // URL sync
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idFromUrl = params.get("id");
    if (idFromUrl) setSelectedId(idFromUrl);
  }, []);

  useEffect(() => {
    const url = selectedId
      ? `/courses/world?id=${selectedId}`
      : "/courses/world";
    window.history.replaceState(null, "", url);
  }, [selectedId]);

  // Clear detail data when deselecting
  useEffect(() => {
    if (!selectedId) {
      setDetailData(null);
      setHoverPoint(null);
      setMobileDetailHeight(0);
      setMapCollapsed(false);
    }
  }, [selectedId]);

  // Resize map when exiting detail mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || isDetailMode) return;
    const timer = setTimeout(() => map.resize(), 320);
    return () => clearTimeout(timer);
  }, [isDetailMode]);

  // Resize map when collapsing/expanding map section
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isDetailMode || mapCollapsed) return;
    const timer = setTimeout(() => map.resize(), 320);
    return () => clearTimeout(timer);
  }, [mapCollapsed, isDetailMode]);

  // Callback from inline detail component
  const handleDetailLoaded = useCallback(
    (data: DetailData) => {
      if (selectedId) {
        detailCacheRef.current.set(selectedId, data);
      }
      setDetailData(data);
    },
    [selectedId]
  );

  const handleDetailHeaderHeightChange = (height: number) => {
    setMobileDetailHeight(height);
  };

  const prefetchDetail = useCallback(
    async (courseId: string): Promise<DetailData | null> => {
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
    },
    []
  );

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

  // Elevation chart hover -> map marker
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
            attribution: "&copy; OpenStreetMap contributors",
          },
        },
        layers: [{ id: "basemap", type: "raster", source: "basemap" }],
      },
      center: [10, 30],
      zoom: 2,
      minZoom: 1,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.FullscreenControl({ container: mapWrapperRef.current! }),
      "top-right"
    );

    // Force attribution to start collapsed
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
          "line-color": ["get", "color"] as unknown as maplibregl.ExpressionSpecification,
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
        filter: [
          "==",
          ["get", "id"],
          "",
        ] as unknown as maplibregl.FilterSpecification,
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
        filter: [
          "==",
          ["get", "id"],
          "",
        ] as unknown as maplibregl.FilterSpecification,
      });

      // Click handler -- toggle selection (bbox-based for easy clicking at low zoom)
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

      // Proximity hover -- highlight nearest course within 20px of cursor
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

      // Apply initial filter state
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
    map.addLayer(
      { id: "basemap", type: "raster", source: "basemap" },
      "courses-line-casing"
    );
  }, [mapTileId]);

  // Update map filter for visible courses (map-list sync)
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

  // Update active/highlight filter on map
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
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    // Don't zoom for list-level selection if detail data is present
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
  }, [selectedId, featureCollection, filteredIds, detailData]);

  // Detail mode: add full-res route, markers, dim other routes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    const getLiveMap = () => mapRef.current ?? map;

    const cleanup = () => {
      const liveMap = getLiveMap();
      if (!liveMap) return;

      try {
        if (liveMap.getLayer("detail-route-line")) liveMap.removeLayer("detail-route-line");
        if (liveMap.getSource("detail-route")) liveMap.removeSource("detail-route");
      } catch {
        // map may already be disposed
      }

      for (const m of detailMarkersRef.current) m.remove();
      detailMarkersRef.current = [];

      try {
        if (liveMap.getLayer("courses-line")) {
          liveMap.setPaintProperty("courses-line", "line-opacity", 0.7);
        }
        if (liveMap.getLayer("courses-line-casing")) {
          liveMap.setPaintProperty("courses-line-casing", "line-opacity", 0.65);
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

      const lineFeature = detailData.geojson.features.find(
        (f) => f.geometry.type === "LineString"
      );
      if (lineFeature && lineFeature.geometry.type === "LineString") {
        const coords = lineFeature.geometry.coordinates;
        if (coords.length > 0) {
          // Start marker (sky-blue)
          const startEl = document.createElement("div");
          startEl.style.cssText =
            "width:14px;height:14px;border-radius:50%;background:#4fc3f7;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);";
          const startMarker = new maplibregl.Marker({ element: startEl })
            .setLngLat(coords[0] as [number, number])
            .addTo(map);
          detailMarkersRef.current.push(startMarker);

          // End marker (red)
          const endEl = document.createElement("div");
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

    // Fit bounds from GPX data
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

  const hasGeometryCount = courses.filter((c) => c.hasGeometry).length;

  return (
    <div
      className={`flex h-[calc(100vh-4rem)] flex-col scrollbar-hidden ${
        isDetailMode ? "overflow-hidden" : "overflow-y-auto"
      }`}
    >
      {/* Filters bar -- smooth collapse in detail mode */}
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
              {/* Globe icon + title */}
              <div className="flex items-center gap-2 shrink-0">
                <Globe className="h-5 w-5 text-sky-blue" />
                <div>
                  <h1 className="text-lg font-bold leading-tight">World Courses</h1>
                  <p className="text-[11px] text-t-muted">
                    {courses.length} courses
                    {hasGeometryCount > 0 && ` (${hasGeometryCount} on map)`}
                  </p>
                </div>
              </div>

              {/* Search */}
              <div ref={searchPanelRef} className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t-faint" />
                <Input
                  placeholder="Search courses..."
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
                        <label className="text-[11px] font-medium text-t-muted mb-1 block">Country</label>
                        <Select
                          value={countryFilter}
                          onChange={(e) => setCountryFilter(e.target.value)}
                          className="w-full"
                        >
                          <option value="">All Countries</option>
                          {countries.map((c) => (
                            <option key={c} value={c}>
                              {countryFlag(c)} {COUNTRY_NAMES[c] || c}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-t-muted mb-1 block">Region</label>
                        <Select
                          value={regionFilter}
                          onChange={(e) => setRegionFilter(e.target.value)}
                          className="w-full"
                        >
                          <option value="">All Regions</option>
                          {regions.sort().map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-t-muted mb-1 block">Category</label>
                        <Select
                          value={categoryFilter}
                          onChange={(e) => setCategoryFilter(e.target.value)}
                          className="w-full"
                        >
                          <option value="">All Categories</option>
                          {categories.map((c) => (
                            <option key={c} value={c}>
                              {CATEGORY_LABELS[c] || c}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div />
                      <div>
                        <RangeSlider
                          min={distanceRange[0]}
                          max={distanceRange[1]}
                          value={distFilter}
                          onChange={setDistFilter}
                          step={10}
                          formatLabel={(v) => `${v}km`}
                          tone="distance"
                          label="Distance"
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
                          label="Elevation"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      {hasFilters && (
                        <Button variant="ghost" size="sm" onClick={clearAll}>
                          <X className="mr-1 h-3.5 w-3.5" />
                          Reset
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSearchExpanded(false)}
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick country/category filter chips */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Select
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                  className="w-auto min-w-[100px] text-xs"
                >
                  <option value="">All Countries</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {countryFlag(c)} {COUNTRY_NAMES[c] || c}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Map + List split */}
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        {/* Map column */}
        <div
          className={`${
            isDetailMode
              ? mapCollapsed
                ? "h-0 overflow-hidden lg:h-auto lg:overflow-visible"
                : "flex-1"
              : "h-[40vh]"
          } lg:h-full lg:flex-1 flex flex-col transition-all duration-300 ease-in-out`}
        >
          <div ref={mapWrapperRef} className="relative flex-1 min-h-0">
            <div ref={mapContainerRef} className="h-full w-full" />

            {/* Map tile selector */}
            <div className="absolute bottom-3 left-3 z-10">
              {tileMenuOpen ? (
                <div className="flex gap-1 rounded-lg bg-white/90 p-1 shadow-lg backdrop-blur-sm">
                  {MAP_TILES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setMapTileId(t.id);
                        setTileMenuOpen(false);
                      }}
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
                  {MAP_TILES.find((t) => t.id === mapTileId)?.label ?? "OSM"}
                </button>
              )}
            </div>
          </div>

          {/* Elevation chart -- below map, always in DOM with max-height transition */}
          <div
            className={`shrink-0 overflow-hidden transition-[max-height] duration-300 ease-in-out ${
              isDetailMode ? "max-h-44" : "max-h-0"
            }`}
          >
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

        {/* Right panel: course list / detail panel */}
        <div
          className={`${
            isDetailMode
              ? mapCollapsed
                ? "flex-1 min-h-0 bg-t-surface"
                : "shrink-0 bg-t-surface"
              : "flex-1 overflow-y-auto"
          } scrollbar-hidden flex flex-col transition-all duration-300 ease-in-out lg:relative lg:block lg:overflow-hidden border-l border-t-border lg:max-w-md lg:flex-1 lg:h-auto`}
        >
          {/* Course list -- hidden on mobile when detail shown, crossfade on desktop */}
          <div
            className={`shrink-0 lg:absolute lg:inset-0 lg:overflow-y-auto lg:transition-opacity lg:duration-200 lg:ease-in-out ${
              selectedId && selectedCourse
                ? "hidden lg:block lg:opacity-0 lg:pointer-events-none"
                : ""
            }`}
          >
            {/* Sort controls */}
            <div className="border-b border-t-border bg-t-surface px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-t-muted mr-1">
                  {filtered.length === courses.length
                    ? `${courses.length} courses`
                    : `${filtered.length} / ${courses.length}`}
                </span>
                {(
                  [
                    { value: "country", label: "Country" },
                    { value: "distance", label: "Distance" },
                    { value: "elevation", label: "Elevation" },
                    { value: "name", label: "Name" },
                  ] as const
                ).map((opt) => {
                  const active = sortBy === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSortBy(opt.value)}
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        active
                          ? "bg-t-primary text-white"
                          : "bg-t-faint/50 text-t-muted hover:bg-t-hover"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredSorted.length === 0 ? (
              <div className="p-8 text-center text-t-muted">
                <Globe className="mx-auto h-12 w-12 mb-3 opacity-50" />
                <p>No courses found.</p>
                {hasFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={clearAll}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-t-divider">
                {filteredSorted.map((course) => {
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
                          <span className="text-sm font-semibold hover:text-t-link truncate block">
                            <span
                              className="mr-1.5 text-base"
                              title={
                                course.country
                                  ? COUNTRY_NAMES[course.country] ||
                                    course.country
                                  : ""
                              }
                            >
                              {countryFlag(course.country)}
                            </span>
                            {course.courseNumber && (
                              <span className="mr-1 text-t-muted font-normal">
                                {course.courseNumber}
                              </span>
                            )}
                            {course.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {course.category.map((cat) => (
                            <Badge key={cat} className="text-[10px]">
                              {CATEGORY_LABELS[cat] || cat}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="mt-1 flex items-center gap-3 text-xs text-t-sub">
                        <span className="flex items-center gap-0.5">
                          <ArrowRight className="h-3 w-3" />
                          {Math.round(course.distanceKm)} km
                        </span>
                        {course.elevationM > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Mountain className="h-3 w-3" />
                            {course.elevationM.toLocaleString()} m
                          </span>
                        )}
                        {course.region && (
                          <span className="text-t-muted">{course.region}</span>
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-1 text-xs text-t-muted">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {course.startLocation}
                          {course.endLocation !== course.startLocation && (
                            <> &rarr; {course.endLocation}</>
                          )}
                        </span>
                        {course.officialPageUrl && (
                          <a
                            href={course.officialPageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto shrink-0 inline-flex items-center gap-1 text-sky-blue hover:text-sky-orange"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {course.gpxFileKey && (
                          <a
                            href={`/api/courses/${course.id}/gpx`}
                            className={`${course.officialPageUrl ? "" : "ml-auto"} shrink-0 inline-flex items-center gap-1 text-t-accent hover:text-t-accent-x`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Download className="h-3 w-3" />
                            <span className="text-[10px] font-medium">
                              GPX
                            </span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Inline detail -- flow on mobile, crossfade on desktop */}
          <div
            className={`${
              mapCollapsed
                ? "flex-1 min-h-0 flex flex-col overflow-hidden"
                : "shrink-0 overflow-visible"
            } lg:absolute lg:inset-0 lg:overflow-y-auto lg:transition-opacity lg:duration-200 lg:ease-in-out ${
              selectedId && selectedCourse
                ? "lg:opacity-100"
                : "hidden lg:block lg:opacity-0 lg:pointer-events-none"
            }`}
          >
            {selectedId && selectedCourse && (
              <div
                className={`${
                  mapCollapsed
                    ? "flex-1 min-h-0 flex flex-col"
                    : "h-auto min-h-0"
                } lg:h-full`}
              >
                <CourseInlineDetail
                  key={selectedId}
                  courseId={selectedId}
                  courseBasic={{
                    id: selectedCourse.id,
                    name: selectedCourse.name,
                    distanceKm: selectedCourse.distanceKm,
                    elevationM: selectedCourse.elevationM,
                    region: selectedCourse.region,
                    category: selectedCourse.category,
                    courseNumber: selectedCourse.courseNumber,
                  }}
                  onClose={() => setSelectedId(null)}
                  onDataLoaded={handleDetailLoaded}
                  onHeaderHeightChange={handleDetailHeaderHeightChange}
                  mapCollapsed={mapCollapsed}
                  onToggleMap={handleToggleMap}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
