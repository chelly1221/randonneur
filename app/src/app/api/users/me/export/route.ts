import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

const COMPLETION_STATUS_LABELS: Record<string, string> = {
  success: "완주",
  dnf: "DNF",
  dnq: "DNQ",
  dns: "DNS",
  partial: "부분완주",
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { keycloakId: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "json" ? "json" : "csv";

  const completions = await prisma.completion.findMany({
    where: { userId: user.id },
    include: {
      course: {
        select: {
          name: true,
          distanceKm: true,
          elevationM: true,
          region: true,
          country: true,
        },
      },
    },
    orderBy: { completedAt: "desc" },
  });

  const rows = completions.map((c) => ({
    courseName: c.course.name,
    distanceKm: c.course.distanceKm,
    elevationM: c.course.elevationM,
    completedAt: new Date(c.completedAt).toISOString().split("T")[0],
    status: COMPLETION_STATUS_LABELS[c.completionStatus] ?? c.completionStatus,
    notes: c.notes ?? "",
    region: c.course.region ?? "",
    country: c.course.country ?? "",
  }));

  const today = new Date().toISOString().split("T")[0];

  if (format === "json") {
    return new NextResponse(JSON.stringify(rows, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="riding-history-${today}.json"`,
      },
    });
  }

  // CSV with BOM for Excel Korean support
  const BOM = "\uFEFF";
  const headers = ["코스명", "거리(km)", "고도(m)", "완주일", "상태", "메모", "지역", "국가"];

  function escapeCsvField(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  const csvLines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        escapeCsvField(r.courseName),
        r.distanceKm,
        r.elevationM,
        r.completedAt,
        escapeCsvField(r.status),
        escapeCsvField(r.notes),
        escapeCsvField(r.region),
        escapeCsvField(r.country),
      ].join(",")
    ),
  ];

  const csvContent = BOM + csvLines.join("\r\n") + "\r\n";

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="riding-history-${today}.csv"`,
    },
  });
}
