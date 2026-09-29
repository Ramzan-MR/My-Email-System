import { prisma } from "@/lib/db";
import { CampaignForm, defaultCampaignForm } from "@/components/campaigns/campaign-form";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const sendingAccounts = await prisma.sendingAccount
    .findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } })
    .catch(() => []);

  return (
    <div className="max-w-3xl">
      <CampaignForm initial={defaultCampaignForm()} sendingAccounts={sendingAccounts} />
    </div>
  );
}
