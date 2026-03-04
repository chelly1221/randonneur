import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function formatICalDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      startDate: true,
      endDate: true,
      sourceUrl: true,
      createdAt: true,
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const now = new Date();
  const dtStamp = formatICalDate(now);
  const dtStart = formatICalDate(new Date(event.startDate));
  // If no end date, default to start + 12 hours (typical brevet duration)
  const endDate = event.endDate
    ? new Date(event.endDate)
    : new Date(new Date(event.startDate).getTime() + 12 * 60 * 60 * 1000);
  const dtEnd = formatICalDate(endDate);

  const descriptionParts: string[] = [];
  if (event.description) {
    descriptionParts.push(event.description);
  }
  if (event.sourceUrl) {
    descriptionParts.push(`\n공식 페이지: ${event.sourceUrl}`);
  }
  const description = descriptionParts.join("\n");

  const uid = `${event.id}@audax.3chan.kr`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Randonneur//audax.3chan.kr//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICalText(event.title)}`,
  ];

  if (event.location) {
    lines.push(`LOCATION:${escapeICalText(event.location)}`);
  }
  if (description) {
    lines.push(`DESCRIPTION:${escapeICalText(description)}`);
  }
  if (event.sourceUrl) {
    lines.push(`URL:${event.sourceUrl}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  const icsContent = lines.join("\r\n") + "\r\n";
  const filename = sanitizeFilename(event.title) || "event";

  return new NextResponse(icsContent, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.ics"`,
    },
  });
}
