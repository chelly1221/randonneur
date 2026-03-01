import { auth } from "@/lib/auth";
import { PollList } from "@/components/community/poll-list";
import { PollForm } from "@/components/community/poll-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "투표 - Audax Korea",
  description: "커뮤니티 투표에 참여하세요.",
};

export default async function PollsPage() {
  const session = await auth();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">투표</h2>
      </div>
      {session?.user && (
        <div className="mb-6">
          <PollForm />
        </div>
      )}
      <PollList />
    </div>
  );
}
