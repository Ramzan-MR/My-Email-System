import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { campaignInputSchema } from "@/lib/validation/campaign";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      sendingAccounts: { include: { sendingAccount: true } },
      campaignLeads: { include: { lead: true }, orderBy: { createdAt: "desc" } },
      _count: { select: { campaignLeads: true, emailMessages: true } },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ campaign });
}

const statusUpdateSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"]),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);

  // A status-only update (Launch / Pause / Resume / Complete) is a distinct,
  // explicit action from editing campaign content.
  const statusOnly = statusUpdateSchema.safeParse(body);
  if (statusOnly.success && Object.keys(body).length === 1) {
    const campaign = await prisma.campaign.update({
      where: { id: params.id },
      data: { status: statusOnly.data.status },
    });
    await prisma.auditLog.create({
      data: {
        action: `campaign.status.${statusOnly.data.status.toLowerCase()}`,
        entityType: "Campaign",
        entityId: campaign.id,
        campaignId: campaign.id,
      },
    });
    return NextResponse.json({ campaign });
  }

  const parsed = campaignInputSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { sendingAccountIds, followUpTemplates, ...rest } = parsed.data;

  const campaign = await prisma.$transaction(async (tx) => {
    if (sendingAccountIds) {
      await tx.campaignSendingAccount.deleteMany({ where: { campaignId: params.id } });
      await tx.campaignSendingAccount.createMany({
        data: sendingAccountIds.map((id) => ({ campaignId: params.id, sendingAccountId: id })),
      });
    }
    return tx.campaign.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(followUpTemplates ? { followUpTemplates: JSON.stringify(followUpTemplates) } : {}),
      },
    });
  });

  await prisma.auditLog.create({
    data: { action: "campaign.updated", entityType: "Campaign", entityId: campaign.id, campaignId: campaign.id },
  });

  return NextResponse.json({ campaign });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.campaign.delete({ where: { id: params.id } });
  await prisma.auditLog.create({
    data: { action: "campaign.deleted", entityType: "Campaign", entityId: params.id },
  });
  return NextResponse.json({ ok: true });
}
