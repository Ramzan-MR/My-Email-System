import { NextRequest, NextResponse } from "next/server";

/**
 * Vercel Cron requests carry `Authorization: Bearer $CRON_SECRET`
 * automatically when CRON_SECRET is set as an env var. This also allows a
 * manual trigger from an authenticated admin session for testing.
 */
export function requireCronSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured on the server." }, { status: 500 });
  }
  const header = req.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
