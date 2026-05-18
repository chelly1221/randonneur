"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  return (
    <main className="flex min-h-screen items-center justify-center gradient-hero">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-t-surface p-8 shadow-lg">
        <h1 className="mb-2 text-center text-2xl font-bold text-t-text">로그인</h1>
        <p className="mb-6 text-center text-sm text-t-muted">
          한국 랜도너스 퍼머넌트 코스 플랫폼
        </p>
        <div className="space-y-3">
          <button
            onClick={() => signIn("google", { callbackUrl })}
            className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Google로 로그인
          </button>
          <button
            onClick={() => signIn("naver", { callbackUrl })}
            className="w-full rounded-md bg-[#03C75A] px-4 py-3 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            네이버로 로그인
          </button>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
