import { prisma } from "@/lib/db";

/**
 * Evaluate and award badges for a user.
 * Called after completions and reviews.
 */
export async function checkAndAwardBadges(userId: string) {
  const badges = await prisma.badge.findMany();
  const existingBadges = await prisma.userBadge.findMany({
    where: { userId },
    select: { badgeId: true },
  });
  const existingBadgeIds = new Set(existingBadges.map((b) => b.badgeId));

  // Fetch user stats
  const [completions, reviews] = await Promise.all([
    prisma.completion.findMany({
      where: { userId },
      include: { course: { select: { distanceKm: true, elevationM: true, region: true, category: true } } },
    }),
    prisma.review.count({ where: { userId } }),
  ]);

  const totalCompletions = completions.length;
  const totalDistance = completions.reduce((sum, c) => sum + (c.course.distanceKm ?? 0), 0);
  const totalElevation = completions.reduce((sum, c) => sum + (c.course.elevationM ?? 0), 0);
  const uniqueRegions = new Set(completions.map((c) => c.course.region).filter(Boolean));
  const categories = new Set(completions.flatMap((c) => c.course.category));

  for (const badge of badges) {
    if (existingBadgeIds.has(badge.id)) continue;

    const criteria = badge.criteria as Record<string, unknown>;
    let earned = false;

    switch (criteria.type) {
      case "completions":
        earned = totalCompletions >= (criteria.count as number);
        break;

      case "distance":
        earned = totalDistance >= (criteria.km as number);
        break;

      case "elevation":
        earned = totalElevation >= (criteria.meters as number);
        break;

      case "regions":
        earned = uniqueRegions.size >= (criteria.count as number);
        break;

      case "category":
        earned = categories.has(criteria.value as string);
        break;

      case "reviews":
        earned = reviews >= (criteria.count as number);
        break;

      case "super-randonneur":
        earned = checkSuperRandonneur(completions);
        break;

      case "r-12":
        earned = checkR12(completions);
        break;
    }

    if (earned) {
      await prisma.userBadge.create({
        data: { userId, badgeId: badge.id },
      }).catch(() => {
        // Ignore unique constraint violations (concurrent calls)
      });
    }
  }
}

interface CompletionWithCourse {
  completedAt: Date;
  course: { distanceKm: number; region: string | null; category: string[]; elevationM: number };
}

function checkSuperRandonneur(completions: CompletionWithCourse[]): boolean {
  // Same year: 200K, 300K, 400K, 600K each at least 1
  const byYear = new Map<number, Set<string>>();
  const thresholds = [200, 300, 400, 600];

  for (const c of completions) {
    const year = new Date(c.completedAt).getFullYear();
    if (!byYear.has(year)) byYear.set(year, new Set());
    const bucket = thresholds.find((t) => c.course.distanceKm >= t && c.course.distanceKm < (thresholds[thresholds.indexOf(t) + 1] ?? Infinity));
    if (bucket) byYear.get(year)!.add(String(bucket));
  }

  for (const brackets of byYear.values()) {
    if (thresholds.every((t) => brackets.has(String(t)))) return true;
  }
  return false;
}

function checkR12(completions: CompletionWithCourse[]): boolean {
  // 12 consecutive months with at least 1 completion
  if (completions.length < 12) return false;

  const months = new Set(
    completions.map((c) => {
      const d = new Date(c.completedAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })
  );

  const sorted = Array.from(months).sort();
  let consecutive = 1;

  for (let i = 1; i < sorted.length; i++) {
    const [prevY, prevM] = sorted[i - 1].split("-").map(Number);
    const [curY, curM] = sorted[i].split("-").map(Number);
    const prevTotal = prevY * 12 + prevM;
    const curTotal = curY * 12 + curM;

    if (curTotal - prevTotal === 1) {
      consecutive++;
      if (consecutive >= 12) return true;
    } else {
      consecutive = 1;
    }
  }

  return false;
}
