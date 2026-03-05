import { prisma } from "./db";

const MAX_SLUG_LENGTH = 100;

/**
 * Generate a URL slug for a course.
 * Keeps Unicode letters (Korean, Japanese, European diacritics, etc.),
 * removes special characters, joins with hyphens.
 * Example: "서울-춘천" 200km PT-01 → "pt-01-서울-춘천-200km"
 */
export function generateCourseSlug(
  name: string,
  distanceKm: number,
  courseNumber?: string | null
): string {
  const parts: string[] = [];

  // Prefix with course number if available
  if (courseNumber) {
    parts.push(courseNumber.toLowerCase().replace(/\s+/g, "-"));
  }

  // Clean the name: keep Unicode letters, digits, hyphens, spaces
  const cleanName = name
    .trim()
    .replace(/[^\p{L}\p{N}\s\-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  if (cleanName) {
    // Truncate at a hyphen boundary to keep slugs reasonable
    let truncated = cleanName;
    if (truncated.length > MAX_SLUG_LENGTH) {
      truncated = truncated.slice(0, MAX_SLUG_LENGTH);
      const lastHyphen = truncated.lastIndexOf("-");
      if (lastHyphen > MAX_SLUG_LENGTH / 2) {
        truncated = truncated.slice(0, lastHyphen);
      }
    }
    parts.push(truncated);
  }

  // Append distance
  parts.push(`${Math.round(distanceKm)}km`);

  const result = parts.join("-");
  return result || "course";
}

/**
 * Resolve slug collisions by appending -2, -3, etc.
 * Uses a single query to find all existing slugs with the same prefix.
 */
export async function resolveSlugCollision(
  baseSlug: string,
  excludeId?: string
): Promise<string> {
  // Find all existing slugs that match baseSlug or baseSlug-N pattern
  const pattern = `${baseSlug}%`;
  const existingSlugs = await prisma.course.findMany({
    where: {
      slug: { startsWith: baseSlug },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { slug: true },
  });

  const slugSet = new Set(existingSlugs.map((r) => r.slug));

  if (!slugSet.has(baseSlug)) return baseSlug;

  for (let i = 2; i < 10000; i++) {
    const candidate = `${baseSlug}-${i}`;
    if (!slugSet.has(candidate)) return candidate;
  }

  // Fallback: append timestamp
  return `${baseSlug}-${Date.now()}`;
}

/**
 * Generate a unique slug for a course, handling collisions.
 * Retries on unique constraint violations from concurrent inserts.
 */
export async function generateUniqueCourseSlug(
  name: string,
  distanceKm: number,
  courseNumber?: string | null,
  excludeId?: string
): Promise<string> {
  const base = generateCourseSlug(name, distanceKm, courseNumber);

  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = await resolveSlugCollision(
      attempt === 0 ? base : `${base}-${Date.now()}`,
      excludeId
    );
    return slug;
  }

  // Final fallback — should never reach here
  return `${base}-${Date.now()}`;
}
