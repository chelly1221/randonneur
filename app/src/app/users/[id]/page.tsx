import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { BadgeDisplay } from "@/components/user/badge-display";
import { UserAvatar } from "@/components/user/user-avatar";
import { FollowButton } from "@/components/user/follow-button";
import { StreakCalendar } from "@/components/user/streak-calendar";
import { BikesSection } from "@/components/user/bikes-section";
import { Bike, Mountain, Map, Trophy, MessageSquare, Users } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [user, session] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        bio: true,
        avatarKey: true,
        createdAt: true,
        userBadges: {
          include: { badge: true },
          orderBy: { earnedAt: "desc" },
        },
      },
    }),
    auth(),
  ]);

  if (!user) notFound();

  // Get current user's DB id to check if viewing own profile and follow status
  let currentUserId: string | null = null;
  let isFollowing = false;
  if (session?.user?.id) {
    const currentUser = await prisma.user.findUnique({
      where: { keycloakId: session.user.id },
      select: { id: true },
    });
    if (currentUser) {
      currentUserId = currentUser.id;
      if (currentUserId !== id) {
        const follow = await prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: currentUserId,
              followingId: id,
            },
          },
        });
        isFollowing = !!follow;
      }
    }
  }

  const isOwnProfile = currentUserId === id;

  const [completions, reviewCount, followerCount, followingCount] = await Promise.all([
    prisma.completion.findMany({
      where: { userId: id },
      include: { course: { select: { distanceKm: true, elevationM: true, region: true } } },
    }),
    prisma.review.count({ where: { userId: id } }),
    prisma.follow.count({ where: { followingId: id } }),
    prisma.follow.count({ where: { followerId: id } }),
  ]);

  const totalDistance = Math.round(completions.reduce((s, c) => s + (c.course.distanceKm ?? 0), 0));
  const totalElevation = completions.reduce((s, c) => s + (c.course.elevationM ?? 0), 0);
  const uniqueRegions = new Set(completions.map((c) => c.course.region).filter(Boolean)).size;

  const recentCompletions = await prisma.completion.findMany({
    where: { userId: id },
    orderBy: { completedAt: "desc" },
    take: 5,
    include: { course: { select: { id: true, name: true, distanceKm: true } } },
  });

  const badges = user.userBadges.map((ub) => ({
    ...ub.badge,
    earnedAt: ub.earnedAt.toISOString(),
  }));

  const stats = [
    { icon: Trophy, label: "완주", value: completions.length },
    { icon: Bike, label: "총 거리", value: `${totalDistance.toLocaleString()} km` },
    { icon: Mountain, label: "획득고도", value: `${totalElevation.toLocaleString()} m` },
    { icon: Map, label: "지역", value: `${uniqueRegions}개` },
    { icon: MessageSquare, label: "후기", value: reviewCount },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Profile header */}
      <div className="mb-8 flex items-start gap-4">
        <UserAvatar
          displayName={user.displayName}
          avatarKey={user.avatarKey}
          size="lg"
        />
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{user.displayName}</h1>
            {!isOwnProfile && currentUserId && (
              <FollowButton userId={id} initialFollowing={isFollowing} />
            )}
          </div>
          {user.bio && <p className="mt-1 text-sm text-t-muted">{user.bio}</p>}
          <div className="mt-2 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-t-muted" />
              <span className="font-medium">{followerCount}</span>
              <span className="text-t-muted">팔로워</span>
            </div>
            <div>
              <span className="font-medium">{followingCount}</span>
              <span className="text-t-muted"> 팔로잉</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-t-faint">
            가입일: {format(new Date(user.createdAt), "yyyy년 M월 d일", { locale: ko })}
          </p>
        </div>
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">뱃지</h2>
          <BadgeDisplay badges={badges} size="md" />
        </div>
      )}

      {/* Streak Calendar */}
      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">완주 기록</h2>
        <Card>
          <CardContent className="py-3 px-4">
            <StreakCalendar userId={id} />
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-3 grid-cols-2 sm:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-2 py-3">
              <stat.icon className="h-4 w-4 text-t-icon" />
              <div>
                <p className="text-[10px] text-t-muted">{stat.label}</p>
                <p className="text-sm font-bold">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bikes */}
      <BikesSection userId={id} />

      {/* Recent completions */}
      {recentCompletions.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold">최근 완주</h2>
          <div className="space-y-2">
            {recentCompletions.map((c) => (
              <Card key={c.id}>
                <CardContent className="flex items-center justify-between py-2">
                  <Link
                    href={`/courses/${c.course.id}`}
                    className="text-sm font-medium hover:text-t-link"
                  >
                    {c.course.name}
                  </Link>
                  <div className="flex items-center gap-2 text-xs text-t-muted">
                    <span>{c.course.distanceKm} km</span>
                    <span>{format(new Date(c.completedAt), "yyyy.MM.dd")}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
