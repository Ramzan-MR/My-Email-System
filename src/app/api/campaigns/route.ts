import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { campaignInputSchema } from "@/lib/validation/campaign";

export const dynamic = "force-dynamic";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { campaignLeads: true } },
      sendingAccounts: { include: { sendingAccount: true } },
    },
  });
  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = campaignInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { sendingAccountIds, followUpTemplates, ...rest } = parsed.data;

  const campaign = await prisma.campaign.create({
    data: {
      ...rest,
      followUpTemplates: JSON.stringify(followUpTemplates),
      sendingAccounts: {
        create: sendingAccountIds.map((id) => ({ sendingAccountId: id })),
      },
    },
  });

  await prisma.auditLog.create({
    data: { action: "campaign.created", entityType: "Campaign", entityId: campaign.id, campaignId: campaign.id },
  });

  return NextResponse.json({ campaign }, { status: 201 });
}
