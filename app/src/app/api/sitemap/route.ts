import { NextResponse } from "next/server";

const SITEMAP_PATH = "/tmp/sitemap.xml";

export async function GET() {
  // eslint-disable-next-line no-eval
  const fs = eval('require')("fs") as typeof import("fs");

  if (!fs.existsSync(SITEMAP_PATH)) {
    try {
      const { generateSitemap } = await import("@/lib/sitemap-generator");
      await generateSitemap();
    } catch (e) {
      console.error("[sitemap] Generation failed:", e);
      return new NextResponse("Sitemap not available", { status: 503 });
    }
  }

  try {
    const xml = fs.readFileSync(SITEMAP_PATH, "utf-8");
    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    return new NextResponse("Sitemap not available", { status: 503 });
  }
}
