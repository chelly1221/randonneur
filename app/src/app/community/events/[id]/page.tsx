import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EventDetailClient } from "@/components/community/event-detail-client";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    select: { title: true },
  });
  return {
    title: event ? `${event.title} - Audax Korea` : "이벤트 - Audax Korea",
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  let currentDbUserId: string | null = null;
  let isAdmin = false;

  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { keycloakId: session.user.id },
      select: { id: true },
    });
    currentDbUserId = user?.id ?? null;
    isAdmin = (session.user.roles ?? []).includes("admin");
  }

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, displayName: true, avatarKey: true },
      },
      course: {
        select: { id: true, name: true, distanceKm: true, region: true },
      },
      participants: {
        where: { status: { not: "cancelled" } },
        include: {
          user: {
            select: { id: true, displayName: true, avatarKey: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!event) {
    notFound();
  }

  const currentUserParticipation = currentDbUserId
    ? event.participants.find((p) => p.user.id === currentDbUserId)
    : null;

  const goingCount = event.participants.filter((p) => p.status === "going").length;
  const interestedCount = event.participants.filter((p) => p.status === "interested").length;

  return (
    <EventDetailClient
      event={{
        id: event.id,
        title: event.title,
        description: event.description,
        eventType: event.eventType,
        location: event.location,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate?.toISOString() ?? null,
        maxParticipants: event.maxParticipants,
        createdAt: event.createdAt.toISOString(),
        user: event.user,
        course: event.course,
        participants: event.participants.map((p) => ({
          id: p.id,
          status: p.status,
          user: p.user,
        })),
        goingCount,
        interestedCount,
      }}
      currentUserId={currentDbUserId}
      currentUserStatus={currentUserParticipation?.status ?? null}
      isOwner={currentDbUserId === event.user.id}
      isAdmin={isAdmin}
      isLoggedIn={!!session?.user}
    />
  );
}
