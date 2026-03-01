import { prisma } from "@/lib/db";
import { WorldCoursesClient } from "./world-courses-client";
import { getCourseColor, getPastelCourseColor } from "@/lib/course-colors";

export const dynamic = "force-dynamic";

interface WorldCourseRow {
  id: string;
  name: string;
  course_number: string | null;
  distance_km: number;
  elevation_m: number;
  region: string | null;
  category: string[];
  start_location: string;
  end_location: string;
  gpx_file_key: string | null;
  tags: string[];
  country: string | null;
  official_page_url: string | null;
  geojson: string | null;
}

export default async function WorldCoursesPage() {
  const rows: WorldCourseRow[] = await prisma.$queryRawUnsafe(`
    SELECT
      id, name, course_number, distance_km, elevation_m, region, category,
      start_location, end_location, gpx_file_key, tags, country,
      official_page_url,
      ST_AsGeoJSON(ST_Simplify(geom, 0.001)) as geojson
    FROM courses
    WHERE archived = false
    ORDER BY country ASC, distance_km ASC
  `);

  const courses = rows.map((r) => ({
    id: r.id,
    name: r.name,
    courseNumber: r.course_number,
    distanceKm: r.distance_km,
    elevationM: r.elevation_m,
    region: r.region,
    category: r.category,
    startLocation: r.start_location,
    endLocation: r.end_location,
    gpxFileKey: r.gpx_file_key,
    tags: r.tags ?? [],
    country: r.country,
    officialPageUrl: r.official_page_url,
    hasGeometry: !!r.geojson,
  }));

  // Build GeoJSON for map
  const features = rows
    .map((r) => {
      if (!r.geojson) return null;
      try {
        const geometry = JSON.parse(r.geojson);
        return {
          type: "Feature" as const,
          properties: {
            id: r.id,
            name: r.name,
            region: r.region,
            distanceKm: r.distance_km,
            courseNumber: r.course_number,
            country: r.country,
            color: getCourseColor(r.id),
            pastelColor: getPastelCourseColor(r.id),
          },
          geometry,
        };
      } catch {
        return null;
      }
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  const featureCollection: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  // Collect unique regions and countries
  const regions = [...new Set(courses.map((c) => c.region).filter(Boolean))] as string[];
  const countries = [...new Set(courses.map((c) => c.country).filter(Boolean))] as string[];

  return (
    <WorldCoursesClient
      courses={courses}
      featureCollection={featureCollection}
      regions={regions}
      countries={countries}
    />
  );
}
