import { NextRequest, NextResponse } from "next/server";
import { downloadGpx } from "@/lib/minio";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

// Allowed key prefixes for the image proxy
const ALLOWED_PREFIXES = [
  "courses/",
  "images/",
  "bikes/",
  "reviews/",
  "journals/",
  "checkpoints/",
  "shared-routes/",
  "completions/",
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const objectKey = key.join("/");

  // Block access to keys that don't start with an allowed prefix
  const isAllowed = ALLOWED_PREFIXES.some((prefix) =>
    objectKey.startsWith(prefix)
  );
  if (!isAllowed) {
    return NextResponse.json(
      { error: "Access denied" },
      { status: 403 }
    );
  }

  // For completions/ prefix (user's personal GPS traces), require authentication
  // and verify the userId in the key matches the session user or the user is admin
  const isPrivate = objectKey.startsWith("completions/");
  if (isPrivate) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const isAdmin = session.user.roles?.includes("admin");
    if (!isAdmin) {
      // completions/ keys are expected to contain the userId, e.g. "completions/{userId}/..."
      const dbUser = await prisma.user.findUnique({
        where: { keycloakId: session.user.id },
        select: { id: true },
      });
      if (!dbUser) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }
      // Check if the key contains the user's ID
      const keyAfterPrefix = objectKey.slice("completions/".length);
      if (!keyAfterPrefix.startsWith(dbUser.id)) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    }
  }

  const ext = objectKey.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

  try {
    const buffer = await downloadGpx(objectKey);
    return new NextResponse(buffer.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": isPrivate
          ? "private, no-cache"
          : "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
