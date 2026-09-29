import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const addLeadsSchema = z.object({
  leadIds: z.array(z.string()).min(1),
});

// Adds leads to a campaign's pipeline (status PENDING, not yet approved to
// send — see CLAUDE.md "only send to rows marked as ready/approved").
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = addLeadsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const suppressed = await prisma.suppressionEntry.findMany({
    where: { lead: { id: { in: parsed.data.leadIds } } },
    select: { leadId: true },
  });
  const suppressedIds = new Set(suppressed.map((s) => s.leadId));

  const toAdd = parsed.data.leadIds.filter((id) => !suppressedIds.has(id));

  await prisma.campaignLead.createMany({
    data: toAdd.map((leadId) => ({ campaignId: params.id, leadId })),
    skipDuplicates: true,
  });

  return NextResponse.json({
    added: toAdd.length,
    skippedSuppressed: parsed.data.leadIds.length - toAdd.length,
  });
}

const approveSchema = z.object({
  campaignLeadIds: z.array(z.string()).min(1),
  approved: z.boolean(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await prisma.campaignLead.updateMany({
    where: { id: { in: parsed.data.campaignLeadIds }, campaignId: params.id },
    data: {
      approved: parsed.data.approved,
      status: parsed.data.approved ? "READY" : "PENDING",
    },
  });

  return NextResponse.json({ updated: result.count });
}
