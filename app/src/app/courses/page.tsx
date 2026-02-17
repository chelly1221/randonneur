import { prisma } from "@/lib/db";
import { CourseExplorer } from "@/components/course/course-explorer-v2";
import { getCourseColor, getPastelCourseColor } from "@/lib/course-colors";

export const dynamic = "force-dynamic";

interface CourseRow {
  id: string;
  name: string;
  distance_km: number;
  elevation_m: number;
  region: string;
  category: string[];
  start_location: string;
  end_location: string;
  course_number: string | null;
  gpx_file_key: string | null;
  tags: string[];
  archived: boolean;
  geojson: string | null;
}

export default async function CoursesPage() {
  // Fetch courses with simplified geometries
  const rows: CourseRow[] = await prisma.$queryRawUnsafe(`
    SELECT
      id, name, distance_km, elevation_m, region, category,
      start_location, end_location, course_number, gpx_file_key, tags, archived,
      ST_AsGeoJSON(ST_Simplify(geom, 0.001)) as geojson
    FROM courses
    ORDER BY distance_km ASC
  `);

  const courses = rows.map((r) => ({
    id: r.id,
    name: r.name,
    distanceKm: r.distance_km,
    elevationM: r.elevation_m,
    region: r.region,
    category: r.category,
    startLocation: r.start_location,
    endLocation: r.end_location,
    courseNumber: r.course_number,
    gpxFileKey: r.gpx_file_key,
    tags: r.tags ?? [],
    archived: r.archived,
  }));

  // Build GeoJSON FeatureCollection
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
            archived: r.archived,
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

  // Compute min/max for range sliders
  const distances = courses.map((c) => c.distanceKm);
  const elevations = courses.map((c) => c.elevationM);

  const distanceRange: [number, number] = [
    Math.floor(Math.min(...distances) / 10) * 10,
    Math.ceil(Math.max(...distances) / 10) * 10,
  ];

  const elevationRange: [number, number] = [
    Math.floor(Math.min(...elevations) / 100) * 100,
    Math.ceil(Math.max(...elevations) / 100) * 100,
  ];

  return (
    <CourseExplorer
      courses={courses}
      featureCollection={featureCollection}
      distanceRange={distanceRange}
      elevationRange={elevationRange}
    />
  );
}
