import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { JournalDetail } from "@/components/community/journal-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const journal = await prisma.journal.findUnique({
    where: { id },
    select: { title: true },
  });
  return {
    title: journal ? `${journal.title} - Audax Korea` : "일지 - Audax Korea",
  };
}

export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const journal = await prisma.journal.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, displayName: true, avatarKey: true } },
      course: { select: { id: true, name: true, distanceKm: true, region: true } },
      photos: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!journal) {
    notFound();
  }

  const session = await auth();
  let currentUserId: string | null = null;
  let isAdmin = false;

  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { keycloakId: session.user.id },
      select: { id: true, role: true },
    });
    if (user) {
      currentUserId = user.id;
      isAdmin = user.role === "admin";
    }
  }

  const isOwner = currentUserId === journal.userId;

  return (
    <JournalDetail
      journal={JSON.parse(JSON.stringify(journal))}
      isOwner={isOwner}
      isAdmin={isAdmin}
    />
  );
}
