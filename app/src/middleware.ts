import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

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

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/profile/:path*"],
};
