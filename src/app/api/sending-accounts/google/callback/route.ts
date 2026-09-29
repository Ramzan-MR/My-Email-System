import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { exchangeCodeForTokens } from "@/lib/email/gmail";
import { encryptToken } from "@/lib/crypto";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const oauthError = req.nextUrl.searchParams.get("error");
  const redirectBase = req.nextUrl.origin;

  if (oauthError || !code) {
    return NextResponse.redirect(
      new URL(`/sending-accounts?error=${encodeURIComponent(oauthError ?? "Missing authorization code.")}`, redirectBase)
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.access_token) {
      throw new Error("Google did not return an access token.");
    }

    const authedClient = new google.auth.OAuth2();
    authedClient.setCredentials(tokens);
    const userInfoRes = await google.oauth2({ version: "v2", auth: authedClient }).userinfo.get();

    const email = userInfoRes.data.email;
    if (!email) {
      throw new Error("Could not determine the Google account's email address.");
    }

    await prisma.sendingAccount.upsert({
      where: { email },
      create: {
        email,
        provider: "GOOGLE",
        displayName: userInfoRes.data.name ?? null,
        accessTokenEnc: encryptToken(tokens.access_token),
        refreshTokenEnc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scope: tokens.scope ?? null,
        isActive: true,
      },
      update: {
        accessTokenEnc: encryptToken(tokens.access_token),
        // Google only returns a refresh_token on the first consent; keep the
        // existing one if this is a re-connect without a new refresh token.
        ...(tokens.refresh_token ? { refreshTokenEnc: encryptToken(tokens.refresh_token) } : {}),
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scope: tokens.scope ?? null,
        isActive: true,
      },
    });

    await prisma.auditLog.create({
      data: { action: "sending_account.connected", entityType: "SendingAccount", metadata: JSON.stringify({ email }) },
    });

    return NextResponse.redirect(new URL("/sending-accounts?connected=1", redirectBase));
  } catch (err) {
    console.error("[gmail oauth] callback failed", err);
    const message = err instanceof Error ? err.message : "Could not connect Gmail account.";
    return NextResponse.redirect(new URL(`/sending-accounts?error=${encodeURIComponent(message)}`, redirectBase));
  }
}
