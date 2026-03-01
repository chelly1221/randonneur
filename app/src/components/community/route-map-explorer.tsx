"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { REGIONS } from "@/types";
import { SharedRouteCard } from "@/components/community/shared-route-card";
import { RouteShareForm } from "@/components/community/route-share-form";
import { Search, Plus, ChevronDown, Map, List, Loader2 } from "lucide-react";

/** Escape HTML special characters to prevent XSS in map popups */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  user: {
    id: string;
    keycloakId: string;
    displayName: string;
    avatarKey: string | null;
  };
}

interface RouteGeometry {
  id: string;
  title: string;
  region: string | null;
  distance: number | null;
  elevation: number | null;
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
}

// Color palette for route lines - one per region
const ROUTE_COLORS = [
  "#1a237e", // dark blue  - 경기
  "#e53935", // red        - 강원
  "#ff9800", // orange     - 충북
  "#4fc3f7", // sky blue   - 충남
  "#43a047", // green      - 경북
  "#8e24aa", // purple     - 경남
  "#f4511e", // deep orange- 전북
  "#00897b", // teal       - 전남
  "#c62828", // dark red   - 제주
  "#1565c0", // blue       - default (no region)
];

const LIMIT = 20;

export function RouteMapExplorer({ isLoggedIn }: { isLoggedIn: boolean }) {
  // Route list state
  const [routes, setRoutes] = useState<SharedRouteEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [region, setRegion] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Map state
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [geometriesLoading, setGeometriesLoading] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  // Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);
  const pendingGeojsonRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const routeGeometriesRef = useRef(new globalThis.Map<string, RouteGeometry>());
  const cardRefsMap = useRef(new globalThis.Map<string, HTMLDivElement>());
  const listContainerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const geometriesAbortRef = useRef<AbortController | null>(null);
  const routesAbortRef = useRef<AbortController | null>(null);

  // Fetch route list
  const fetchRoutes = useCallback(
    async (offset = 0, append = false) => {
      // Abort any in-flight route list request (only for non-append / fresh loads)
      if (!append) {
        routesAbortRef.current?.abort();
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const controller = new AbortController();
      if (!append) routesAbortRef.current = controller;

      try {
        const params = new URLSearchParams();
        params.set("limit", String(LIMIT));
        params.set("offset", String(offset));
        if (region) params.set("region", region);
        if (search) params.set("q", search);

        const res = await fetch(`/api/shared-routes?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();

        if (append) {
          setRoutes((prev) => [...prev, ...data.routes]);
        } else {
          setRoutes(data.routes);
        }
        setTotal(data.total);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        // silent for other errors
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [region, search]
  );

  // Apply geojson data to map source (only if map source is ready)
  const applyGeojsonToMap = useCallback(
    (geojson: GeoJSON.FeatureCollection) => {
      const map = mapRef.current;
      if (map && mapReadyRef.current && map.getSource("routes")) {
        (map.getSource("routes") as maplibregl.GeoJSONSource).setData(geojson);
        pendingGeojsonRef.current = null;
      } else {
        // Map source not ready yet; store for later
        pendingGeojsonRef.current = geojson;
      }
    },
    []
  );

  // Fetch geometries for map display
  const fetchGeometries = useCallback(async () => {
    // Abort any in-flight geometries request to prevent stale data overwriting
    geometriesAbortRef.current?.abort();
    const controller = new AbortController();
    geometriesAbortRef.current = controller;

    setGeometriesLoading(true);
    try {
      const params = new URLSearchParams();
      if (region) params.set("region", region);
      if (search) params.set("q", search);

      const res = await fetch(`/api/shared-routes/geometries?${params}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to fetch geometries");
      const geojson: GeoJSON.FeatureCollection = await res.json();

      // Store geometry metadata for bounds lookups
      const geoMap = new globalThis.Map<string, RouteGeometry>();
      for (const feature of geojson.features) {
        const props = feature.properties as RouteGeometry;
        if (props?.id) {
          geoMap.set(props.id, props);
        }
      }
      routeGeometriesRef.current = geoMap;

      // Update map source
      applyGeojsonToMap(geojson);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.error("Failed to fetch geometries:", e);
    } finally {
      setGeometriesLoading(false);
    }
  }, [region, search, applyGeojsonToMap]);

  // Load routes on filter change; geometries on filter change when in map mode
  useEffect(() => {
    fetchRoutes(0, false);
  }, [fetchRoutes]);

  useEffect(() => {
    if (viewMode === "map") {
      fetchGeometries();
    }
  }, [fetchGeometries, viewMode]);

  // Cleanup abort controllers and cardRefsMap on unmount
  useEffect(() => {
    return () => {
      geometriesAbortRef.current?.abort();
      routesAbortRef.current?.abort();
      cardRefsMap.current.clear();
    };
  }, []);

  // Initialize MapLibre map
  useEffect(() => {
    if (viewMode !== "map" || !mapContainerRef.current) return;

    // If map already exists, just return
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
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
    map.addControl(new maplibregl.NavigationControl(), "top-right");

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
      // Add empty GeoJSON source for all routes
      map.addSource("routes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Base route lines (all routes)
      map.addLayer({
        id: "routes-base",
        type: "line",
        source: "routes",
        paint: {
          "line-color": [
            "match",
            ["get", "region"],
            "경기",
            ROUTE_COLORS[0],
            "강원",
            ROUTE_COLORS[1],
            "충북",
            ROUTE_COLORS[2],
            "충남",
            ROUTE_COLORS[3],
            "경북",
            ROUTE_COLORS[4],
            "경남",
            ROUTE_COLORS[5],
            "전북",
            ROUTE_COLORS[6],
            "전남",
            ROUTE_COLORS[7],
            "제주",
            ROUTE_COLORS[8],
            ROUTE_COLORS[9], // default fallback
          ],
          "line-width": 3,
          "line-opacity": 0.6,
        },
      });

      // Highlight layer for selected route (wider, more opaque)
      map.addLayer({
        id: "routes-highlight",
        type: "line",
        source: "routes",
        paint: {
          "line-color": "#ff9800",
          "line-width": 5,
          "line-opacity": 0.9,
        },
        filter: ["==", ["get", "id"], ""],
      });

      // Invisible wider line for easier click/hover interaction
      map.addLayer({
        id: "routes-interaction",
        type: "line",
        source: "routes",
        paint: {
          "line-color": "transparent",
          "line-width": 16,
          "line-opacity": 0,
        },
      });

      // Click handler on routes
      map.on("click", "routes-interaction", (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const routeId = feature.properties?.id;
        if (routeId) {
          handleMapRouteClick(routeId);
        }
      });

      // Hover cursor
      map.on("mouseenter", "routes-interaction", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "routes-interaction", () => {
        map.getCanvas().style.cursor = "";
        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }
      });

      // Hover popup showing route name
      map.on("mousemove", "routes-interaction", (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const title = feature.properties?.title;
        const distance = feature.properties?.distance;
        const featureRegion = feature.properties?.region;

        if (!title) return;

        let html = `<strong>${escapeHtml(String(title))}</strong>`;
        const details: string[] = [];
        if (featureRegion) details.push(escapeHtml(String(featureRegion)));
        if (distance != null && distance > 0)
          details.push(`${Number(distance).toFixed(1)} km`);
        if (details.length > 0) {
          html += `<br><span style="font-size:11px;color:#666">${details.join(" / ")}</span>`;
        }

        if (popupRef.current) {
          popupRef.current.setLngLat(e.lngLat).setHTML(html);
        } else {
          popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 12,
          })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
        }
      });

      // Mark map as ready and apply any pending geojson
      mapReadyRef.current = true;
      if (pendingGeojsonRef.current) {
        (map.getSource("routes") as maplibregl.GeoJSONSource).setData(
          pendingGeojsonRef.current
        );
        pendingGeojsonRef.current = null;
      }
    });

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // Handle clicking a route on the map -> highlight and scroll to card
  const handleMapRouteClick = useCallback((routeId: string) => {
    setSelectedRouteId(routeId);

    // Highlight on map
    const map = mapRef.current;
    if (map && map.getLayer("routes-highlight")) {
      map.setFilter("routes-highlight", ["==", ["get", "id"], routeId]);
    }

    // Fit bounds to the route
    const geo = routeGeometriesRef.current.get(routeId);
    if (geo?.bounds && map) {
      map.fitBounds(
        [
          [geo.bounds.minLng, geo.bounds.minLat],
          [geo.bounds.maxLng, geo.bounds.maxLat],
        ],
        { padding: 60, maxZoom: 13 }
      );
    }

    // Scroll to card in list
    const cardEl = cardRefsMap.current.get(routeId);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, []);

  // Handle clicking a card -> highlight on map and fit bounds
  const handleCardClick = useCallback((routeId: string) => {
    setSelectedRouteId(routeId);

    const map = mapRef.current;
    if (!map) return;

    // Highlight on map
    if (map.getLayer("routes-highlight")) {
      map.setFilter("routes-highlight", ["==", ["get", "id"], routeId]);
    }

    // Fit bounds to the route
    const geo = routeGeometriesRef.current.get(routeId);
    if (geo?.bounds) {
      map.fitBounds(
        [
          [geo.bounds.minLng, geo.bounds.minLat],
          [geo.bounds.maxLng, geo.bounds.maxLat],
        ],
        { padding: 60, maxZoom: 13 }
      );
    }
  }, []);

  const handleSearch = () => {
    setSearch(searchInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleDelete = (id: string) => {
    setRoutes((prev) => prev.filter((r) => r.id !== id));
    setTotal((prev) => prev - 1);
    if (selectedRouteId === id) {
      setSelectedRouteId(null);
      const map = mapRef.current;
      if (map && map.getLayer("routes-highlight")) {
        map.setFilter("routes-highlight", ["==", ["get", "id"], ""]);
      }
    }
    // Refresh geometries after delete
    fetchGeometries();
  };

  const handleCreated = () => {
    setShowForm(false);
    setRegion("");
    setSearch("");
    setSearchInput("");
    fetchRoutes(0, false);
    fetchGeometries();
  };

  const hasMore = routes.length < total;

  // Render the route list content (reused in both views)
  const renderRouteList = (withMapInteraction: boolean) => {
    if (loading) {
      return (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg bg-t-subtle"
            />
          ))}
        </div>
      );
    }

    if (routes.length === 0) {
      return (
        <div className="rounded-lg border border-t-border bg-t-surface py-12 text-center text-sm text-t-muted">
          공유된 루트가 없습니다
        </div>
      );
    }

    return (
      <>
        <div className="space-y-3">
          {routes.map((route) =>
            withMapInteraction ? (
              <div
                key={route.id}
                ref={(el) => {
                  if (el) {
                    cardRefsMap.current.set(route.id, el);
                  } else {
                    cardRefsMap.current.delete(route.id);
                  }
                }}
                onClick={() => handleCardClick(route.id)}
                className={`cursor-pointer rounded-lg transition-all ${
                  selectedRouteId === route.id
                    ? "ring-2 ring-sky-orange ring-offset-1 ring-offset-t-surface"
                    : "hover:ring-1 hover:ring-t-border"
                }`}
              >
                <SharedRouteCard route={route} onDelete={handleDelete} />
              </div>
            ) : (
              <SharedRouteCard
                key={route.id}
                route={route}
                onDelete={handleDelete}
              />
            )
          )}
        </div>

        {/* Load more */}
        {hasMore && (
          <div className="pt-2 text-center">
            <button
              onClick={() => fetchRoutes(routes.length, true)}
              disabled={loadingMore}
              className="rounded-lg border border-t-border px-4 py-2 text-sm text-t-muted transition-colors hover:bg-t-hover hover:text-t-text disabled:opacity-50"
            >
              {loadingMore ? "불러오는 중..." : "더 보기"}
            </button>
          </div>
        )}

        <p className="text-center text-xs text-t-muted">
          총 {total}개의 루트
        </p>
      </>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header with create button and view toggle */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-t-text">루트 공유</h2>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-t-border overflow-hidden">
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "map"
                  ? "bg-sky-darkblue text-white"
                  : "bg-t-surface text-t-muted hover:bg-t-hover hover:text-t-text"
              }`}
              title="지도 보기"
            >
              <Map className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">지도</span>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-sky-darkblue text-white"
                  : "bg-t-surface text-t-muted hover:bg-t-hover hover:text-t-text"
              }`}
              title="리스트 보기"
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">리스트</span>
            </button>
          </div>

          {isLoggedIn && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg bg-sky-darkblue px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-darkblue/90"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">루트 공유하기</span>
              <span className="sm:hidden">공유</span>
            </button>
          )}
        </div>
      </div>

      {/* Share form (expandable) */}
      {showForm && (
        <RouteShareForm
          onSuccess={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="appearance-none rounded-lg border border-t-border bg-t-surface py-1.5 pl-3 pr-8 text-sm text-t-text focus:border-sky-blue focus:outline-none"
          >
            <option value="">전체 지역</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-t-muted" />
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="루트 검색..."
            className="w-full rounded-lg border border-t-border bg-t-surface py-1.5 pl-3 pr-9 text-sm text-t-text placeholder:text-t-muted focus:border-sky-blue focus:outline-none"
          />
          <button
            onClick={handleSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-t-muted hover:text-t-text"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Map + List split view (map mode) or list-only */}
      {viewMode === "map" ? (
        <div className="flex flex-col md:flex-row gap-4">
          {/* Map panel */}
          <div className="w-full md:w-[60%] relative">
            <div
              ref={mapContainerRef}
              className="h-[300px] md:h-[calc(100vh-260px)] rounded-lg border border-t-border overflow-hidden"
            />
            {geometriesLoading && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-lg bg-t-surface/90 px-3 py-1.5 text-xs text-t-muted shadow-sm border border-t-border">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                루트 로딩 중...
              </div>
            )}
            {/* Region color legend */}
            <div className="absolute bottom-3 left-3 rounded-lg bg-t-surface/90 px-2.5 py-2 text-[10px] shadow-sm border border-t-border hidden md:block">
              <div className="font-medium text-t-text mb-1">지역별 색상</div>
              <div className="grid grid-cols-3 gap-x-3 gap-y-0.5">
                {REGIONS.map((r, i) => (
                  <div key={r} className="flex items-center gap-1">
                    <span
                      className="inline-block w-3 h-[3px] rounded-full"
                      style={{
                        backgroundColor: ROUTE_COLORS[i] || ROUTE_COLORS[9],
                      }}
                    />
                    <span className="text-t-muted">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Route list panel */}
          <div
            ref={listContainerRef}
            className="w-full md:w-[40%] md:h-[calc(100vh-260px)] md:overflow-y-auto space-y-3"
          >
            {renderRouteList(true)}
          </div>
        </div>
      ) : (
        /* List-only view */
        <div>{renderRouteList(false)}</div>
      )}
    </div>
  );
}
