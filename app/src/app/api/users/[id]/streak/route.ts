import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Get completions from the past 12 months
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  twelveMonthsAgo.setHours(0, 0, 0, 0);

  const completions = await prisma.completion.findMany({
    where: {
      userId: id,
      completedAt: { gte: twelveMonthsAgo },
    },
    select: { completedAt: true },
    orderBy: { completedAt: "desc" },
  });

  // Extract unique date strings (YYYY-MM-DD)
  const dateSet = new Set<string>();
  for (const c of completions) {
    const d = new Date(c.completedAt);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dateSet.add(dateStr);
  }

  const dates = Array.from(dateSet).sort();

  // Calculate streaks based on consecutive weeks with at least one completion
  // A "week" is Mon-Sun. Get the week number for each completion date.
  function getWeekKey(dateStr: string): string {
    const d = new Date(dateStr);
    // Get Monday of this week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  }

  const weekKeys = new Set(dates.map(getWeekKey));
  const sortedWeeks = Array.from(weekKeys).sort();

  // Calculate current streak (consecutive weeks ending at current week or last week)
  let currentStreak = 0;
  let longestStreak = 0;
  let streak = 0;

  const now = new Date();
  const currentWeekKey = getWeekKey(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  );

  // Get all weeks in range and check consecutive
  for (let i = 0; i < sortedWeeks.length; i++) {
    if (i === 0) {
      streak = 1;
    } else {
      // Check if this week is exactly 7 days after the previous
      const prevMonday = new Date(sortedWeeks[i - 1]);
      const thisMonday = new Date(sortedWeeks[i]);
      const diffDays = (thisMonday.getTime() - prevMonday.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays === 7) {
        streak++;
      } else {
        streak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, streak);
  }

  // Current streak: count backwards from current week
  currentStreak = 0;
  if (sortedWeeks.length > 0) {
    const lastWeek = sortedWeeks[sortedWeeks.length - 1];
    const lastWeekDate = new Date(lastWeek);
    const currentWeekDate = new Date(currentWeekKey);
    const weeksDiff = (currentWeekDate.getTime() - lastWeekDate.getTime()) / (1000 * 60 * 60 * 24 * 7);

    // Current streak counts if last active week is this week or last week
    if (weeksDiff <= 1) {
      currentStreak = 1;
      for (let i = sortedWeeks.length - 2; i >= 0; i--) {
        const prevMonday = new Date(sortedWeeks[i]);
        const thisMonday = new Date(sortedWeeks[i + 1]);
        const diffDays = (thisMonday.getTime() - prevMonday.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays === 7) {
          currentStreak++;
        } else {
          break;
        }
      }
    }
  }

  return NextResponse.json({
    dates,
    currentStreak,
    longestStreak,
  });
}
