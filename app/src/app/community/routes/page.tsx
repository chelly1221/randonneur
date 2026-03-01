import { RouteMapExplorer } from "@/components/community/route-map-explorer";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "루트 공유 - Audax Korea",
  description: "라이더들이 공유한 자전거 루트를 탐색하고 GPX 파일을 다운로드하세요.",
};

export default async function SharedRoutesPage() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <div>
      <RouteMapExplorer isLoggedIn={isLoggedIn} />
    </div>
  );
}
