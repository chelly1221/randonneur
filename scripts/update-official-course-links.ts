import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCES = [
  "http://www.korearandonneurs.kr:8080/jsp/randonneurs/permanents",
  "http://www.korearandonneurs.kr:8080/jsp/randonneurs/superrando",
] as const;

function normalizeCourseNumber(rawCode: string): string | null {
  const upper = rawCode.toUpperCase();
  const prefix = upper.slice(0, 2);
  const tail = upper.slice(2);

  if (prefix === "PT") {
    const m = tail.match(/^(\d+)(R?)$/);
    if (!m) return null;
    const n = Number.parseInt(m[1], 10);
    if (!Number.isFinite(n)) return null;
    const digits = n < 100 ? String(n).padStart(2, "0") : String(n);
    return `PT-${digits}${m[2]}`;
  }

  if (prefix === "SR") {
    const n = Number.parseInt(tail, 10);
    if (!Number.isFinite(n)) return null;
    const digits = n < 100 ? String(n).padStart(2, "0") : String(n);
    return `SR-${digits}`;
  }

  return null;
}

function collectLinks(html: string, sourceUrl: string): Map<string, string> {
  const result = new Map<string, string>();
  const linkRegex = /(?:href|HREF)\s*=\s*"([^"]*info-(PT\d+R?|SR\d+)\.htm)"/g;

  for (const match of html.matchAll(linkRegex)) {
    const href = match[1];
    const rawCode = match[2];
    const normalized = normalizeCourseNumber(rawCode);
    if (!normalized) continue;

    const absolute = new URL(href, sourceUrl).href;
    if (!result.has(normalized)) {
      result.set(normalized, absolute);
    }
  }

  return result;
}

async function main() {
  const mapping = new Map<string, string>();

  for (const src of SOURCES) {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${src}: ${response.status}`);
    }
    const html = await response.text();
    const links = collectLinks(html, src);
    for (const [courseNumber, url] of links.entries()) {
      mapping.set(courseNumber, url);
    }
  }

  let updated = 0;
  const missing: string[] = [];
  const rows = Array.from(mapping.entries()).sort(([a], [b]) => a.localeCompare(b));

  for (const [courseNumber, officialPageUrl] of rows) {
    const result = await prisma.course.updateMany({
      where: {
        courseNumber,
        name: {
          not: {
            contains: "(구)",
          },
        },
      },
      data: { officialPageUrl },
    });
    if (result.count > 0) {
      updated += result.count;
    } else {
      missing.push(courseNumber);
    }
  }

  console.log(`Total scraped links: ${rows.length}`);
  console.log(`Updated rows: ${updated}`);
  if (missing.length > 0) {
    console.log(`Missing course_number in DB (${missing.length}): ${missing.join(", ")}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
