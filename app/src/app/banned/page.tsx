import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function BannedPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <Card>
        <CardContent className="py-12">
          <h1 className="mb-4 text-2xl font-bold text-sky-red">계정 정지</h1>
          <p className="mb-2 text-t-text">
            귀하의 계정은 커뮤니티 규정 위반으로 인해 활동이 정지되었습니다.
          </p>
          <p className="mb-6 text-sm text-t-muted">
            문의 사항이 있으시면 관리자에게 연락해주세요.
          </p>
          <Link
            href="/"
            className="text-sm text-sky-blue hover:underline"
          >
            홈으로 돌아가기
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
