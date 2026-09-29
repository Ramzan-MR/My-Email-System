import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { SendingAccountsClient } from "@/components/sending-accounts/sending-accounts-client";

export const dynamic = "force-dynamic";

export default async function SendingAccountsPage({
  searchParams,
}: {
  searchParams: { error?: string; connected?: string };
}) {
  const accounts = await prisma.sendingAccount
    .findMany({
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
      },
    })
    .catch(() => []);

  const oauthConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI
  );

  return (
    <div className="space-y-4">
      {searchParams.error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            {searchParams.error}
          </CardContent>
        </Card>
      )}
      {searchParams.connected && (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
            Account connected successfully.
          </CardContent>
        </Card>
      )}
      <SendingAccountsClient initialAccounts={accounts} oauthConfigured={oauthConfigured} />
    </div>
  );
}
