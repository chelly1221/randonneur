import { Leaderboard } from "@/components/community/leaderboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "리더보드 - Audax Korea",
  description: "완주 횟수, 총 거리, 총 고도 기준 라이더 리더보드를 확인하세요.",
};

export default function LeaderboardPage() {
  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-t-text">리더보드</h2>
      <Leaderboard />
    </div>
  );
}
