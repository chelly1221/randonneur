import { CourseForm } from "@/components/admin/course-form";

export default function NewCoursePage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">새 코스 등록</h1>
      <CourseForm mode="create" />
    </div>
  );
}
