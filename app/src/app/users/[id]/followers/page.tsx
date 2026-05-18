import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { FollowerList } from "@/components/user/follower-list";

export const dynamic = "force-dynamic";

export default async function FollowersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [user, session] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: { id: true, displayName: true },
    }),
    auth(),
  ]);

  if (!user) notFound();

  // Get current user's DB id and their following list for FollowButton initial state
  let currentUserId: string | null = null;
  let followingIds: string[] = [];

  if (session?.user?.id) {
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });
    if (currentUser) {
      currentUserId = currentUser.id;
      const myFollows = await prisma.follow.findMany({
        where: { followerId: currentUser.id },
        select: { followingId: true },
      });
      followingIds = myFollows.map((f) => f.followingId);
    }
  }

  return (
    <Suspense>
      <FollowerList
        userId={user.id}
        displayName={user.displayName}
        currentUserId={currentUserId}
        initialFollowingIds={followingIds}
      />
    </Suspense>
  );
}
