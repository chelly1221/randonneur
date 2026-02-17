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
        <button
          onClick={() => signIn("keycloak", { callbackUrl })}
          className="w-full rounded-md bg-t-primary px-4 py-3 text-sm font-medium text-white hover:bg-t-primary-x transition-colors"
        >
          Keycloak으로 로그인
        </button>
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
