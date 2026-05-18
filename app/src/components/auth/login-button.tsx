"use client";

import { signIn } from "next-auth/react";

export function LoginButton() {
  return (
    <button
      onClick={() => signIn(undefined, { callbackUrl: "/" })}
      className="rounded-md bg-t-accent px-4 py-2 text-sm font-medium text-white hover:bg-t-accent-x transition-colors"
    >
      로그인
    </button>
  );
}
