"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/auth/user-menu";
import { ThemeSelector } from "@/components/layout/theme-selector";
import { SearchBar } from "@/components/layout/search-bar";
import { Menu, X, Shield } from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/", label: "홈" },
  { href: "/courses", label: "한국" },
  { href: "/courses/world", label: "세계" },
  { href: "/community", label: "커뮤니티" },
];

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/courses") {
    return pathname === "/courses" || (pathname.startsWith("/courses/") && !pathname.startsWith("/courses/world"));
  }
  return pathname.startsWith(href);
}

export function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.roles?.includes("admin");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-t-header text-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center px-4">
        {/* Left */}
        <div className="flex flex-1 items-center">
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="3chan" className="h-8 w-auto" />
          </Link>
        </div>

        {/* Center — Desktop nav */}
        <nav className="hidden md:flex items-center justify-center gap-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-sm font-medium transition-colors whitespace-nowrap",
                isNavActive(pathname, item.href)
                  ? "text-t-accent"
                  : "text-white/70 hover:text-white"
              )}
            >
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-1 text-sm font-medium transition-colors whitespace-nowrap",
                pathname.startsWith("/admin")
                  ? "text-t-accent"
                  : "text-white/70 hover:text-white"
              )}
            >
              <Shield className="h-3.5 w-3.5" />
              관리
            </Link>
          )}
        </nav>

        {/* Right */}
        <div className="flex flex-1 items-center justify-end gap-2">
          <SearchBar />
          <ThemeSelector />
          <UserMenu />
          <button
            className="md:hidden rounded-md p-2 hover:bg-white/10"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {menuOpen && (
        <nav className="md:hidden border-t border-white/10 bg-t-header-x px-4 py-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                "block rounded-md px-3 py-2 text-sm font-medium",
                isNavActive(pathname, item.href)
                  ? "bg-white/10 text-t-accent"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setMenuOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                pathname.startsWith("/admin")
                  ? "bg-white/10 text-t-accent"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <Shield className="h-4 w-4" />
              관리
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
