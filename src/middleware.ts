import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Protects every route except /login, NextAuth's own routes, and the cron
// endpoints (which authenticate via CRON_SECRET instead of a session).
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isApiRoute = req.nextUrl.pathname.startsWith("/api/");

  if (isLoggedIn) return NextResponse.next();

  if (isApiRoute) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.nextUrl.origin);
  loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: [
    "/((?!api/auth|api/cron|login|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
