import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h2 className="mb-2 text-6xl font-bold text-t-muted">404</h2>
      <h3 className="mb-4 text-xl font-semibold text-t-text">
        페이지를 찾을 수 없습니다
      </h3>
      <p className="mb-6 text-t-muted">
        요청하신 페이지가 존재하지 않거나 이동되었습니다.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-sky-darkblue px-6 py-2 text-white hover:bg-sky-darkblue/90"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
