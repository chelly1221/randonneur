"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 text-center">
      <h2 className="mb-4 text-xl font-bold text-t-text">
        관리자 페이지 오류
      </h2>
      <p className="mb-6 text-t-muted text-sm">
        페이지를 불러오는 중 오류가 발생했습니다.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-sky-darkblue px-6 py-2 text-white hover:bg-sky-darkblue/90"
      >
        다시 시도
      </button>
    </div>
  );
}
