"use client";

import { useEffect, useState, useCallback } from "react";
import { REGIONS } from "@/types";
import { SharedRouteCard } from "@/components/community/shared-route-card";
import { RouteShareForm } from "@/components/community/route-share-form";
import { Search, Plus, ChevronDown } from "lucide-react";

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

const LIMIT = 20;

export function SharedRouteList({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [routes, setRoutes] = useState<SharedRouteEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [region, setRegion] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showForm, setShowForm] = useState(false);

  const fetchRoutes = useCallback(
    async (offset = 0, append = false) => {
      if (!append) setLoading(true);
      else setLoadingMore(true);

      try {
        const params = new URLSearchParams();
        params.set("limit", String(LIMIT));
        params.set("offset", String(offset));
        if (region) params.set("region", region);
        if (search) params.set("q", search);

        const res = await fetch(`/api/shared-routes?${params}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();

        if (append) {
          setRoutes((prev) => [...prev, ...data.routes]);
        } else {
          setRoutes(data.routes);
        }
        setTotal(data.total);
      } catch {
        // silent
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [region, search]
  );

  useEffect(() => {
    fetchRoutes(0, false);
  }, [fetchRoutes]);

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
  };

  const handleCreated = () => {
    setShowForm(false);
    // Reset filters and reload
    setRegion("");
    setSearch("");
    setSearchInput("");
    fetchRoutes(0, false);
  };

  const hasMore = routes.length < total;

  return (
    <div className="space-y-4">
      {/* Header with create button */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">루트 공유</h2>
        {isLoggedIn && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-sky-darkblue px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-darkblue/90"
          >
            <Plus className="h-4 w-4" />
            루트 공유하기
          </button>
        )}
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

      {/* Route list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-t-subtle" />
          ))}
        </div>
      ) : routes.length === 0 ? (
        <div className="rounded-lg border border-t-border bg-t-surface py-12 text-center text-sm text-t-muted">
          공유된 루트가 없습니다
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {routes.map((route) => (
              <SharedRouteCard
                key={route.id}
                route={route}
                onDelete={handleDelete}
              />
            ))}
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
      )}
    </div>
  );
}
