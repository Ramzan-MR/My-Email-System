import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { runJob } from "@/lib/agents/job-runner";
import { findDueFollowUps } from "@/lib/agents/follow-up";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const result = await runJob("findDueFollowUps", () => findDueFollowUps());
  return NextResponse.json({ ok: true, result });
}
