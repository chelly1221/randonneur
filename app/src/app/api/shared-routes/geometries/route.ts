import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { downloadGpx } from "@/lib/minio";
import { parseGpx } from "@/lib/gpx";
import { Prisma } from "@prisma/client";

/**
 * In-memory cache for individual route GeoJSON features.
 * Keyed by route ID, stores the computed GeoJSON Feature for each route.
 * Entries are invalidated when updatedAt changes (i.e., route was modified).
 * This avoids re-downloading and re-parsing GPX files from MinIO on every request.
 */
interface CachedFeature {
  feature: GeoJSON.Feature;
  updatedAt: string; // ISO timestamp for cache invalidation
}
const featureCache = new globalThis.Map<string, CachedFeature>();

/**
 * GET /api/shared-routes/geometries
 * Returns simplified GeoJSON geometries for all shared routes.
 * Each feature includes the route id, title, region, distance, and elevation as properties.
 * Coordinates are simplified (every Nth point) to keep the payload manageable.
 *
 * Individual route geometries are cached in memory to avoid re-parsing GPX files
 * from MinIO on every request. Cache is invalidated when a route's updatedAt changes.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const region = searchParams.get("region");
  const q = searchParams.get("q");

  const where: Prisma.SharedRouteWhereInput = {};
  if (region) where.region = region;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const routes = await prisma.sharedRoute.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      region: true,
      distance: true,
      elevation: true,
      gpxFileKey: true,
      updatedAt: true,
    },
  });

  // Prune stale cache entries only when no filters are applied (full dataset).
  // With filters, the query only returns a subset, so we can't determine which
  // cached entries are truly deleted vs. simply filtered out.
  if (!region && !q) {
    const currentRouteIds = new Set(routes.map((r) => r.id));
    for (const cachedId of featureCache.keys()) {
      if (!currentRouteIds.has(cachedId)) {
        featureCache.delete(cachedId);
      }
    }
  }

  const features: GeoJSON.Feature[] = [];

  // Separate routes into cached (hit) and uncached (need GPX parsing)
  const uncachedRoutes: typeof routes = [];
  for (const route of routes) {
    const cached = featureCache.get(route.id);
    if (cached && cached.updatedAt === route.updatedAt.toISOString()) {
      features.push(cached.feature);
    } else {
      uncachedRoutes.push(route);
    }
  }

  // Process uncached routes in parallel with a concurrency limit
  const BATCH_SIZE = 10;
  for (let i = 0; i < uncachedRoutes.length; i += BATCH_SIZE) {
    const batch = uncachedRoutes.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (route) => {
        try {
          const gpxBuffer = await downloadGpx(route.gpxFileKey);
          const gpxString = gpxBuffer.toString("utf-8");
          const parsed = parseGpx(gpxString);

          if (
            parsed.geojson.features.length === 0 ||
            parsed.geojson.features[0].geometry.type !== "LineString"
          ) {
            return null;
          }

          const coords = (
            parsed.geojson.features[0].geometry as GeoJSON.LineString
          ).coordinates;

          // Simplify coordinates: keep every Nth point to reduce payload
          // Target ~100 points per route for overview display
          const maxPoints = 100;
          let simplified: number[][];
          if (coords.length <= maxPoints) {
            // Only keep [lng, lat] (drop elevation)
            simplified = coords.map((c) => [c[0], c[1]]);
          } else {
            const step = (coords.length - 1) / (maxPoints - 1);
            simplified = [];
            for (let j = 0; j < maxPoints; j++) {
              const idx = Math.round(j * step);
              const c = coords[idx];
              simplified.push([c[0], c[1]]);
            }
          }

          // Calculate bounds from simplified coords
          let minLat = Infinity,
            maxLat = -Infinity,
            minLng = Infinity,
            maxLng = -Infinity;
          for (const c of simplified) {
            if (c[1] < minLat) minLat = c[1];
            if (c[1] > maxLat) maxLat = c[1];
            if (c[0] < minLng) minLng = c[0];
            if (c[0] > maxLng) maxLng = c[0];
          }

          const feature: GeoJSON.Feature = {
            type: "Feature",
            properties: {
              id: route.id,
              title: route.title,
              region: route.region,
              distance: route.distance,
              elevation: route.elevation,
              bounds: {
                minLat,
                maxLat,
                minLng,
                maxLng,
              },
            },
            geometry: {
              type: "LineString",
              coordinates: simplified,
            },
          };

          // Cache the computed feature
          featureCache.set(route.id, {
            feature,
            updatedAt: route.updatedAt.toISOString(),
          });

          return feature;
        } catch (e) {
          console.error(
            `Failed to parse GPX for shared route ${route.id}:`,
            e
          );
          return null;
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        features.push(result.value);
      }
    }
  }

  const featureCollection: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  return NextResponse.json(featureCollection, {
    headers: {
      // Cache for 5 minutes to avoid re-parsing GPX files on every request
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
