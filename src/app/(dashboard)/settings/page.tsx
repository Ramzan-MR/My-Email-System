import { CheckCircle2, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

async function checkDb() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function StatusRow({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {ok ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-destructive" />}
    </div>
  );
}

export default async function SettingsPage() {
  const dbOk = await checkDb();

  const checks = [
    { label: "Database", ok: dbOk, hint: "DATABASE_URL" },
    { label: "Auth secret", ok: Boolean(process.env.AUTH_SECRET), hint: "AUTH_SECRET" },
    {
      label: "Google OAuth (Gmail sending accounts)",
      ok: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI),
      hint: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI",
    },
    { label: "Token encryption key", ok: Boolean(process.env.TOKEN_ENCRYPTION_KEY), hint: "TOKEN_ENCRYPTION_KEY" },
    {
      label: "AI provider (Gemini)",
      ok: Boolean(process.env.GEMINI_API_KEY),
      hint: `AI_PROVIDER=${process.env.AI_PROVIDER ?? "gemini"} · GEMINI_API_KEY`,
    },
    { label: "Cron secret", ok: Boolean(process.env.CRON_SECRET), hint: "CRON_SECRET" },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
          <CardDescription>Environment configuration required for each part of the app to work.</CardDescription>
        </CardHeader>
        <CardContent>
          {checks.map((c) => (
            <StatusRow key={c.label} {...c} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>My-Email-System — AI-powered outbound email operations.</p>
          <p>Outreach Agent · Follow-Up Agent · Reply Intelligence Agent</p>
        </CardContent>
      </Card>
    </div>
  );
}
