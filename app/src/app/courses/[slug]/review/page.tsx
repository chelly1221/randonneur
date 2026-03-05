import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ReviewWriteClient } from "./review-write-client";

export const dynamic = "force-dynamic";

export default async function ReviewWritePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin");
  }

  const { slug } = await params;
  const course = await prisma.course.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      distanceKm: true,
      elevationM: true,
      region: true,
      startLocation: true,
      endLocation: true,
    },
  });

  if (!course) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <ReviewWriteClient course={course} />
    </div>
  );
}
