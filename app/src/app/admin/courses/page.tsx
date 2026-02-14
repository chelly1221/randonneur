import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Plus, Pencil } from "lucide-react";
import Link from "next/link";
import { DeleteCourseButton } from "@/components/admin/delete-course-button";
import { ArchiveToggleButton } from "@/components/admin/archive-toggle-button";

export const dynamic = "force-dynamic";

export default async function AdminCoursesPage() {
  const courses = await prisma.course.findMany({
    orderBy: { courseNumber: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">코스 관리</h1>
        <Link href="/admin/courses/new">
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            새 코스
          </Button>
        </Link>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-t-border bg-t-subtle">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  코스번호
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  이름
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  거리
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  고도
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  지역
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  GPX
                </th>
                <th className="px-4 py-3 text-left font-medium text-t-muted">
                  상태
                </th>
                <th className="px-4 py-3 text-right font-medium text-t-muted">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-t-divider">
              {courses.map((course) => (
                <tr key={course.id} className="hover:bg-t-hover">
                  <td className="px-4 py-3 text-t-muted text-xs whitespace-nowrap">
                    {course.courseNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/courses/${course.id}`}
                      className="font-medium hover:text-t-link"
                    >
                      {course.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{course.distanceKm} km</td>
                  <td className="px-4 py-3">{course.elevationM} m</td>
                  <td className="px-4 py-3">
                    <Badge variant="primary">{course.region}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {course.gpxFileKey ? (
                      <Badge variant="success">있음</Badge>
                    ) : (
                      <Badge variant="default">없음</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {course.archived ? (
                      <Badge variant="default">보관</Badge>
                    ) : (
                      <Badge variant="success">공개</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <ArchiveToggleButton
                        courseId={course.id}
                        archived={course.archived}
                      />
                      <Link href={`/admin/courses/${course.id}/edit`}>
                        <Button variant="ghost" size="sm">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <DeleteCourseButton courseId={course.id} />
                    </div>
                  </td>
                </tr>
              ))}
              {courses.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-t-faint"
                  >
                    등록된 코스가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
