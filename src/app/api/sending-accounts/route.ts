import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const accounts = await prisma.sendingAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      provider: true,
      displayName: true,
      dailyLimit: true,
      isActive: true,
      lastSyncAt: true,
      createdAt: true,
      // Never select accessTokenEnc / refreshTokenEnc — tokens must never
      // reach the client.
    },
  });
  return NextResponse.json({ accounts });
}
