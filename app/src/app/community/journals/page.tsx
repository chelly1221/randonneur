import { auth } from "@/lib/auth";
import { JournalList } from "@/components/community/journal-list";
import Link from "next/link";
import { PenLine } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "라이드 일지 - Audax Korea",
  description: "라이드 경험을 기록하고 공유하세요.",
};

export default async function JournalsPage() {
  const session = await auth();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">라이드 일지</h2>
        {session?.user && (
          <Link
            href="/community/journals/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-darkblue px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-darkblue/90 transition-colors"
          >
            <PenLine className="h-3.5 w-3.5" />
            글쓰기
          </Link>
        )}
      </div>
      <JournalList />
    </div>
  );
}
