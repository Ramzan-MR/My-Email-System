import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { buildGoogleAuthUrl } from "@/lib/email/gmail";

// Starts the Gmail OAuth flow for connecting a new sending account. Requires
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI to be set —
// see .env.example.
export async function GET(req: NextRequest) {
  try {
    const state = crypto.randomBytes(16).toString("hex");
    const url = buildGoogleAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google OAuth is not configured.";
    return NextResponse.redirect(new URL(`/sending-accounts?error=${encodeURIComponent(message)}`, req.nextUrl.origin));
  }
}
