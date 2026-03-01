import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow banned page itself
  if (pathname === "/banned") {
    return NextResponse.next();
  }

  // Check banned status for all authenticated users
  if (req.auth?.user?.status === "banned") {
    return NextResponse.redirect(new URL("/banned", req.url));
  }

  // Protect admin routes
  if (pathname.startsWith("/admin")) {
    if (!req.auth) {
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }
    const roles = req.auth.user?.roles ?? [];
    if (!roles.includes("admin")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Protect profile routes
  if (pathname.startsWith("/profile")) {
    if (!req.auth) {
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }
  }

  // Protect settings routes
  if (pathname.startsWith("/settings")) {
    if (!req.auth) {
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/profile/:path*", "/settings/:path*", "/banned"],
};
