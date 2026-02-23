"use client";

import { signOut, useSession } from "next-auth/react";
import { LoginButton } from "./login-button";
import { useState } from "react";
import { LogOut, User, Shield } from "lucide-react";
import Link from "next/link";

export function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    setOpen(false);
    await signOut({ redirect: false });
    window.location.href = "/api/auth/keycloak-logout";
  };

  if (!session) {
    return <LoginButton />;
  }

  const isAdmin = session.user.roles?.includes("admin");

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors"
      >
        <User className="h-4 w-4" />
        {session.user.name ?? session.user.email}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-1 w-48 rounded-md border border-t-border bg-t-surface py-1 shadow-lg text-t-text">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-t-hover"
            >
              <User className="h-4 w-4" />
              프로필
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-t-hover"
              >
                <Shield className="h-4 w-4" />
                관리자
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-t-hover"
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </button>
          </div>
        </>
      )}
    </div>
  );
}
