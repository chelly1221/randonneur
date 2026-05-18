import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { RideRecruitDetail } from "@/components/community/ride-recruit-detail";

export const dynamic = "force-dynamic";

export default async function RideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  let currentUserId: string | null = null;
  let isAdmin = false;

  if (session?.user?.id) {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });
    currentUserId = dbUser?.id ?? null;
    isAdmin = (session.user.roles ?? []).includes("admin");
  }

  const recruit = await prisma.rideRecruit.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, displayName: true, avatarKey: true },
      },
      course: {
        select: { id: true, slug: true, name: true, distanceKm: true, region: true },
      },
      participants: {
        where: { status: "joined" },
        include: {
          user: {
            select: { id: true, displayName: true, avatarKey: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!recruit) {
    notFound();
  }

  const isOwner = currentUserId === recruit.userId;
  const currentUserJoined = recruit.participants.some(
    (p) => p.userId === currentUserId
  );

  return (
    <RideRecruitDetail
      recruit={{
        ...recruit,
        rideDate: recruit.rideDate.toISOString(),
        createdAt: recruit.createdAt.toISOString(),
        updatedAt: recruit.updatedAt.toISOString(),
        participantCount: recruit.participants.length,
        participants: recruit.participants.map((p) => ({
          id: p.id,
          message: p.message,
          createdAt: p.createdAt.toISOString(),
          user: p.user,
        })),
        course: recruit.course,
      }}
      currentUserId={currentUserId}
      isOwner={isOwner}
      isAdmin={isAdmin}
      isLoggedIn={!!session?.user}
      currentUserJoined={currentUserJoined}
    />
  );
}
