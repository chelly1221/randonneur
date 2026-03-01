import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { EventForm } from "@/components/community/event-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "이벤트 수정 - Audax Korea",
};

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/login");
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { keycloakId: session.user.id },
    select: { id: true },
  });

  if (!user) {
    redirect("/auth/login");
  }

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    notFound();
  }

  const isAdmin = (session.user.roles ?? []).includes("admin");
  if (!isAdmin) {
    redirect(`/community/events/${id}`);
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">이벤트 수정</h2>
      <EventForm
        initialData={{
          id: event.id,
          title: event.title,
          description: event.description,
          eventType: event.eventType,
          courseId: event.courseId,
          location: event.location,
          startDate: event.startDate.toISOString(),
          endDate: event.endDate?.toISOString() ?? null,
          maxParticipants: event.maxParticipants,
        }}
      />
    </div>
  );
}
