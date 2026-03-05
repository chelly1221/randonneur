import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireActiveUser } from "@/lib/user-guard";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") ?? "20") || 20), 50);
  const includeEnded = searchParams.get("includeEnded") === "true";

  // Get current user for vote info
  const session = await auth();
  let currentUserId: string | null = null;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { keycloakId: session.user.id },
      select: { id: true },
    });
    currentUserId = user?.id ?? null;
  }

  const now = new Date();
  const where: Record<string, unknown> = {
    isActive: true,
  };

  if (!includeEnded) {
    where.OR = [
      { endsAt: null },
      { endsAt: { gt: now } },
    ];
  }

  const polls = await prisma.poll.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
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

  // Get user's votes for these polls
  let userVotes: Record<string, string> = {};
  if (currentUserId) {
    const pollIds = polls.map((p) => p.id);
    const votes = await prisma.pollVote.findMany({
      where: {
        userId: currentUserId,
        option: { pollId: { in: pollIds } },
      },
      select: { optionId: true, option: { select: { pollId: true } } },
    });
    userVotes = Object.fromEntries(
      votes.map((v) => [v.option.pollId, v.optionId])
    );
  }

  const result = polls.map((poll) => {
    const totalVotes = poll.options.reduce(
      (sum, opt) => sum + opt._count.votes,
      0
    );
    const hasEnded = poll.endsAt ? new Date(poll.endsAt) <= now : false;

    return {
      id: poll.id,
      title: poll.title,
      description: poll.description,
      endsAt: poll.endsAt,
      isActive: poll.isActive,
      hasEnded,
      createdAt: poll.createdAt,
      user: poll.user,
      totalVotes,
      userVotedOptionId: userVotes[poll.id] ?? null,
      options: poll.options.map((opt) => ({
        id: opt.id,
        label: opt.label,
        sortOrder: opt.sortOrder,
        voteCount: opt._count.votes,
      })),
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await request.json();
  const { title, description, options, endsAt } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  if (!Array.isArray(options) || options.length < 2) {
    return NextResponse.json(
      { error: "At least 2 options required" },
      { status: 400 }
    );
  }

  if (options.length > 6) {
    return NextResponse.json(
      { error: "Maximum 6 options allowed" },
      { status: 400 }
    );
  }

  const cleanedOptions = options
    .map((o: unknown) => (typeof o === "string" ? o.trim() : ""))
    .filter((o: string) => o.length > 0);

  if (cleanedOptions.length < 2) {
    return NextResponse.json(
      { error: "At least 2 non-empty options required" },
      { status: 400 }
    );
  }

  let parsedEndsAt: Date | null = null;
  if (endsAt) {
    parsedEndsAt = new Date(endsAt);
    if (isNaN(parsedEndsAt.getTime())) {
      return NextResponse.json({ error: "Invalid endsAt" }, { status: 400 });
    }
  }

  const poll = await prisma.poll.create({
    data: {
      userId: user!.id,
      title: title.trim(),
      description: description?.trim() || null,
      endsAt: parsedEndsAt,
      options: {
        create: cleanedOptions.map((label: string, index: number) => ({
          label,
          sortOrder: index,
        })),
      },
    },
    include: {
      user: { select: { id: true, displayName: true, avatarKey: true } },
      options: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return NextResponse.json(poll, { status: 201 });
}
