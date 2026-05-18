import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await auth();
  let currentUserId: string | null = null;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });
    currentUserId = user?.id ?? null;
  }

  const poll = await prisma.poll.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, displayName: true, avatarKey: true },
      },
      options: {
        orderBy: { sortOrder: "asc" },
        include: {
          _count: { select: { votes: true } },
        },
      },
    },
  });

  if (!poll) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }

  let userVotedOptionId: string | null = null;
  if (currentUserId) {
    const vote = await prisma.pollVote.findFirst({
      where: {
        userId: currentUserId,
        option: { pollId: id },
      },
      select: { optionId: true },
    });
    userVotedOptionId = vote?.optionId ?? null;
  }

  const now = new Date();
  const totalVotes = poll.options.reduce(
    (sum, opt) => sum + opt._count.votes,
    0
  );
  const hasEnded = poll.endsAt ? new Date(poll.endsAt) <= now : false;

  return NextResponse.json({
    id: poll.id,
    title: poll.title,
    description: poll.description,
    endsAt: poll.endsAt,
    isActive: poll.isActive,
    hasEnded,
    createdAt: poll.createdAt,
    user: poll.user,
    totalVotes,
    userVotedOptionId,
    options: poll.options.map((opt) => ({
      id: opt.id,
      label: opt.label,
      sortOrder: opt.sortOrder,
      voteCount: opt._count.votes,
    })),
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { id } = await params;
  const poll = await prisma.poll.findUnique({ where: { id } });
  if (!poll) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }

  const isAdmin = (session.user.roles ?? []).includes("admin");
  if (poll.userId !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.poll.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
