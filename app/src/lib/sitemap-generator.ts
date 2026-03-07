const SITEMAP_PATH = "/tmp/sitemap.xml";

export async function generateSitemap(): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  // eslint-disable-next-line no-eval
  const { writeFileSync } = eval('require')("fs") as typeof import("fs");
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://audax.3chan.kr";
  const prisma = new PrismaClient();

  try {
    const courses = await prisma.course.findMany({
      where: { archived: false },
      select: { slug: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    });

    const now = new Date().toISOString();

    const staticPages = [
      { url: baseUrl, changefreq: "daily", priority: "1.0" },
      { url: `${baseUrl}/courses`, changefreq: "daily", priority: "0.9" },
      { url: `${baseUrl}/courses/world`, changefreq: "daily", priority: "0.8" },
      { url: `${baseUrl}/community`, changefreq: "weekly", priority: "0.6" },
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    for (const page of staticPages) {
      xml += `  <url>\n`;
      xml += `    <loc>${page.url}</loc>\n`;
      xml += `    <lastmod>${now}</lastmod>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += `  </url>\n`;
    }

    for (const course of courses) {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/courses/${course.slug}</loc>\n`;
      xml += `    <lastmod>${course.updatedAt.toISOString()}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.8</priority>\n`;
      xml += `  </url>\n`;
    }

    xml += `</urlset>\n`;

    writeFileSync(SITEMAP_PATH, xml, "utf-8");
    console.log(
      `[sitemap] Generated sitemap.xml with ${staticPages.length + courses.length} URLs`
    );
  } finally {
    await prisma.$disconnect();
  }
}
