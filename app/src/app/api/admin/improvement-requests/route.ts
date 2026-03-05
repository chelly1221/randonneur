import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getPresignedUrl } from "@/lib/minio";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (status && (status === "pending" || status === "resolved")) {
    where.status = status;
  }

  const requests = await prisma.improvementRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, displayName: true, email: true } },
      course: { select: { id: true, name: true, courseNumber: true } },
    },
  });

  const withUrls = await Promise.all(
    requests.map(async (req) => {
      const imageUrls: string[] = [];
      for (const key of req.images) {
        try {
          imageUrls.push(await getPresignedUrl(key));
        } catch {
          imageUrls.push("");
        }
      }
      return { ...req, imageUrls };
    })
  );

  return NextResponse.json(withUrls);
}
