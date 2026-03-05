"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h2 className="mb-4 text-2xl font-bold text-t-text">
        문제가 발생했습니다
      </h2>
      <p className="mb-6 text-t-muted">
        페이지를 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.
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
