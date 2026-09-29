import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { REPLY_CLASSIFICATION_LABELS, type ReplyClassificationLabel } from "@/lib/ai/provider";
import { LEAD_STATUS_FOR_CLASSIFICATION, shouldCancelFollowUps } from "@/lib/email/classification-mapping";

const updateSchema = z.object({
  classification: z.enum(REPLY_CLASSIFICATION_LABELS as [string, ...string[]]).optional(),
  note: z.string().trim().max(2000).optional(),
  pauseFollowUps: z.boolean().optional(),
});

// Manual reply review actions (see CLAUDE.md "Reply Review UI"). The
// Reply Intelligence Agent (Phase 4) will call the same lead-status
// transitions automatically; this route is the human-in-the-loop path.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const reply = await prisma.reply.findUnique({ where: { id: params.id } });
  if (!reply) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    if (parsed.data.classification) {
      await tx.reply.update({
        where: { id: params.id },
        data: { classification: parsed.data.classification as never, processedAt: new Date() },
      });

      if (reply.campaignLeadId) {
        const classification = parsed.data.classification as ReplyClassificationLabel;
        const newStatus = LEAD_STATUS_FOR_CLASSIFICATION[classification];
        const cancelFollowUps = shouldCancelFollowUps(classification);
        await tx.campaignLead.update({
          where: { id: reply.campaignLeadId },
          data: {
            status: newStatus as never,
            // A real reply (anything but AUTO_REPLY) permanently cancels
            // future follow-ups for this lead — see CLAUDE.md "IMPORTANT:
            // Never send another follow-up when a real reply has been
            // received."
            ...(cancelFollowUps ? { nextFollowUpDate: null } : {}),
          },
        });
        if (cancelFollowUps) {
          await tx.followUp.updateMany({
            where: { campaignLeadId: reply.campaignLeadId, status: "PENDING_REVIEW" },
            data: { status: "CANCELLED" },
          });
        }
        if (classification === "UNSUBSCRIBE" || classification === "BOUNCE") {
          await tx.suppressionEntry.upsert({
            where: { email: reply.fromEmail },
            create: {
              email: reply.fromEmail,
              leadId: reply.leadId,
              reason: classification === "UNSUBSCRIBE" ? "UNSUBSCRIBED" : "BOUNCED",
            },
            update: {},
          });
        }
      }
    }

    if (parsed.data.note) {
      const lead = await tx.lead.findUnique({ where: { id: reply.leadId } });
      const combined = lead?.notes ? `${lead.notes}\n\n${parsed.data.note}` : parsed.data.note;
      await tx.lead.update({ where: { id: reply.leadId }, data: { notes: combined } });
    }

    if (parsed.data.pauseFollowUps !== undefined && reply.campaignLeadId) {
      await tx.campaignLead.update({
        where: { id: reply.campaignLeadId },
        data: {
          status: parsed.data.pauseFollowUps ? "PAUSED" : "REPLIED",
          pausedAt: parsed.data.pauseFollowUps ? new Date() : null,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        action: "reply.reviewed",
        entityType: "Reply",
        entityId: params.id,
        leadId: reply.leadId,
        metadata: JSON.stringify(parsed.data),
      },
    });
  });

  const updated = await prisma.reply.findUnique({ where: { id: params.id }, include: { lead: true } });
  return NextResponse.json({ reply: updated });
}
