import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CourseForm } from "@/components/admin/course-form";
import { CheckpointForm } from "@/components/admin/checkpoint-form";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditCoursePage({ params }: Props) {
  const { id } = await params;
  const course = await prisma.course.findUnique({ where: { id } });

  if (!course) notFound();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">코스 수정</h1>
      <CourseForm
        mode="edit"
        initialData={{
          id: course.id,
          name: course.name,
          distanceKm: course.distanceKm,
          elevationM: course.elevationM,
          estimatedTime: course.estimatedTime ?? "",
          startLocation: course.startLocation,
          endLocation: course.endLocation,
          region: course.region ?? "",
          category: course.category ?? [],
          tags: course.tags,
          description: course.description ?? "",
          designer: course.designer ?? "",
          gpxFileKey: course.gpxFileKey,
          archived: course.archived,
        }}
      />

      <div className="mt-8 max-w-2xl border-t border-t-border pt-8">
        <CheckpointForm courseId={id} />
      </div>
    </div>
  );
}
