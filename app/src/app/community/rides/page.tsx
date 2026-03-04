import { auth } from "@/lib/auth";
import { RideRecruitList } from "@/components/community/ride-recruit-list";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "동행 모집 - Audax Korea",
  description: "함께 달릴 동행을 찾아보세요. 라이딩 동행 모집 게시판입니다.",
};

export default async function RidesPage() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">동행 모집</h2>
      </div>
      <RideRecruitList isLoggedIn={isLoggedIn} />
    </div>
  );
}
