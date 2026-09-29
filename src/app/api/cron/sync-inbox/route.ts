import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { runJob } from "@/lib/agents/job-runner";
import { syncInbox } from "@/lib/agents/reply-detection";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const result = await runJob("syncInbox", () => syncInbox());
  return NextResponse.json({ ok: true, result });
}
