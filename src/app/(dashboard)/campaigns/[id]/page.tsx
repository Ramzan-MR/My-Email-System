import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignForm, type CampaignFormValue } from "@/components/campaigns/campaign-form";
import { CampaignStatusActions } from "@/components/campaigns/campaign-status-actions";
import { CampaignLeadsPanel } from "@/components/campaigns/campaign-leads-panel";
import type { FollowUpTemplate } from "@/lib/validation/campaign";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "secondary"> = {
  DRAFT: "secondary",
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "default",
};

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const [campaign, allLeads, allSendingAccounts] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        sendingAccounts: { include: { sendingAccount: true } },
        campaignLeads: { include: { lead: true }, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.lead.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.sendingAccount.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
  ]);

  if (!campaign) notFound();

  let followUps: FollowUpTemplate[] = [];
  try {
    followUps = JSON.parse(campaign.followUpTemplates);
  } catch {
    followUps = [];
  }

  const formValue: CampaignFormValue = {
    id: campaign.id,
    name: campaign.name,
    subjectTemplate: campaign.subjectTemplate,
    bodyTemplate: campaign.bodyTemplate,
    followUps: [0, 1, 2].map((i) => {
      const existing = followUps.find((f) => f.order === i + 1);
      return existing
        ? { enabled: true, delayDays: existing.delayDays, instructions: existing.instructions }
        : { enabled: false, delayDays: 3 + i * 2, instructions: "" };
    }),
    aiPersonalizationEnabled: campaign.aiPersonalizationEnabled,
    autoFollowUpEnabled: campaign.autoFollowUpEnabled,
    dailyLimit: campaign.dailyLimit,
    delayMinBetweenSendsSec: campaign.delayMinBetweenSendsSec,
    delayMaxBetweenSendsSec: campaign.delayMaxBetweenSendsSec,
    sendingAccountIds: campaign.sendingAccounts.map((sa) => sa.sendingAccountId),
  };

  const approvedLeadCount = campaign.campaignLeads.filter((cl) => cl.approved).length;

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">{campaign.name}</h2>
          <Badge variant={STATUS_VARIANT[campaign.status] ?? "default"}>{campaign.status}</Badge>
        </div>
        <CampaignStatusActions
          campaignId={campaign.id}
          status={campaign.status}
          approvedLeadCount={approvedLeadCount}
          sendingAccountCount={campaign.sendingAccounts.length}
          dailyLimit={campaign.dailyLimit}
        />
      </div>

      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="leads">
          <CampaignLeadsPanel campaignId={campaign.id} initialCampaignLeads={campaign.campaignLeads} allLeads={allLeads} />
        </TabsContent>
        <TabsContent value="settings">
          <CampaignForm initial={formValue} sendingAccounts={allSendingAccounts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
