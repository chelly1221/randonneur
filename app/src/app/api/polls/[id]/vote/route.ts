import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveUser } from "@/lib/user-guard";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const { id: pollId } = await params;

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      options: { select: { id: true } },
    },
  });

  if (!poll) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }

  if (!poll.isActive) {
    return NextResponse.json({ error: "투표가 비활성화되었습니다." }, { status: 400 });
  }

  if (poll.endsAt && new Date(poll.endsAt) <= new Date()) {
    return NextResponse.json({ error: "투표가 종료되었습니다." }, { status: 400 });
  }

  const body = await request.json();
  const { optionId } = body;

  if (!optionId) {
    return NextResponse.json({ error: "optionId is required" }, { status: 400 });
  }

  // Verify option belongs to this poll
  const validOptionIds = poll.options.map((o) => o.id);
  if (!validOptionIds.includes(optionId)) {
    return NextResponse.json({ error: "Invalid optionId for this poll" }, { status: 400 });
  }

  // Delete any existing vote for this user on this poll
  const existingVotes = await prisma.pollVote.findMany({
    where: {
      userId: user!.id,
      option: { pollId },
    },
  });

  if (existingVotes.length > 0) {
    await prisma.pollVote.deleteMany({
      where: {
        id: { in: existingVotes.map((v) => v.id) },
      },
    });
  }

  // Create new vote
  await prisma.pollVote.create({
    data: {
      optionId,
      userId: user!.id,
    },
  });

  // Return updated vote counts
  const updatedOptions = await prisma.pollOption.findMany({
    where: { pollId },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { votes: true } },
    },
  });

  const totalVotes = updatedOptions.reduce(
    (sum, opt) => sum + opt._count.votes,
    0
  );

  return NextResponse.json({
    userVotedOptionId: optionId,
    totalVotes,
    options: updatedOptions.map((opt) => ({
      id: opt.id,
      label: opt.label,
      sortOrder: opt.sortOrder,
      voteCount: opt._count.votes,
    })),
  });
}
