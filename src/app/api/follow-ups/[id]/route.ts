import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addDays } from "date-fns";
import { prisma } from "@/lib/db";
import { sendFollowUpEmail } from "@/lib/agents/follow-up";

const actionSchema = z.object({
  action: z.enum(["approve", "skip", "snooze", "stop_sequence", "edit"]),
  snoozeDays: z.number().int().min(1).max(30).optional(),
  draftSubject: z.string().trim().max(300).optional(),
  draftBody: z.string().trim().max(10000).optional(),
});

// Follow-Up review queue actions (see CLAUDE.md "Follow-Up Review UI" and
// "Human Approval"). "Approve & Send" sends immediately through Gmail in the
// existing thread — approval IS the human-in-the-loop gate for Review Mode;
// Automatic Mode sends the same way from the findDueFollowUps job instead.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const followUp = await prisma.followUp.findUnique({ where: { id: params.id } });
  if (!followUp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.action === "approve") {
    await prisma.followUp.update({ where: { id: params.id }, data: { status: "APPROVED", approvedAt: new Date() } });
    const sent = await sendFollowUpEmail(params.id).catch((err) => {
      console.error("[follow-up] send failed", err);
      return false;
    });
    if (!sent) {
      // Approval is recorded but the send was blocked (e.g. a reply just
      // came in) or failed — revert to PENDING_REVIEW so it surfaces again
      // rather than silently vanishing from the queue.
      const reverted = await prisma.followUp.update({
        where: { id: params.id },
        data: { status: "PENDING_REVIEW" },
      });
      return NextResponse.json(
        { error: "Could not send — the lead may have just replied or become ineligible. Refresh to check.", followUp: reverted },
        { status: 409 }
      );
    }
    const updated = await prisma.followUp.findUniqueOrThrow({ where: { id: params.id } });
    await prisma.auditLog.create({
      data: { action: "followup.approve", entityType: "FollowUp", entityId: params.id, leadId: followUp.leadId, campaignId: followUp.campaignId },
    });
    return NextResponse.json({ followUp: updated });
  }

  const data: Record<string, unknown> = {};
  switch (parsed.data.action) {
    case "skip":
      data.status = "SKIPPED";
      break;
    case "stop_sequence":
      data.status = "CANCELLED";
      break;
    case "snooze":
      data.status = "SNOOZED";
      data.snoozedUntil = addDays(new Date(), parsed.data.snoozeDays ?? 1);
      break;
    case "edit":
      if (parsed.data.draftSubject !== undefined) data.draftSubject = parsed.data.draftSubject;
      if (parsed.data.draftBody !== undefined) data.draftBody = parsed.data.draftBody;
      break;
  }

  const updated = await prisma.followUp.update({ where: { id: params.id }, data });

  if (parsed.data.action === "stop_sequence") {
    await prisma.campaignLead.update({
      where: { id: followUp.campaignLeadId },
      data: { nextFollowUpDate: null },
    });
  }

  await prisma.auditLog.create({
    data: {
      action: `followup.${parsed.data.action}`,
      entityType: "FollowUp",
      entityId: params.id,
      leadId: followUp.leadId,
      campaignId: followUp.campaignId,
    },
  });

  return NextResponse.json({ followUp: updated });
}
