import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const checkpoints = await prisma.checkpoint.findMany({
    where: { courseId: id },
    orderBy: { distanceKm: "asc" },
  });
  return NextResponse.json(checkpoints);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const checkpoint = await prisma.checkpoint.create({
    data: {
      courseId: id,
      name: body.name,
      description: body.description ?? null,
      distanceKm: body.distanceKm,
      imageKey: body.imageKey ?? null,
      sortOrder: body.sortOrder ?? 0,
    },
  });

  return NextResponse.json(checkpoint, { status: 201 });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await params; // consume params
  const body = await request.json();

  if (!body.id) {
    return NextResponse.json({ error: "Missing checkpoint id" }, { status: 400 });
  }

  const checkpoint = await prisma.checkpoint.update({
    where: { id: body.id },
    data: {
      name: body.name,
      description: body.description ?? null,
      distanceKm: body.distanceKm,
      imageKey: body.imageKey ?? null,
      sortOrder: body.sortOrder ?? 0,
    },
  });

  return NextResponse.json(checkpoint);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await params;
  const { searchParams } = new URL(request.url);
  const cpId = searchParams.get("cpId");

  if (!cpId) {
    return NextResponse.json({ error: "Missing cpId" }, { status: 400 });
  }

  await prisma.checkpoint.delete({ where: { id: cpId } });
  return NextResponse.json({ success: true });
}
