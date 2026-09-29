import { prisma } from "@/lib/db";
import { LeadsClient } from "@/components/leads/leads-client";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } }).catch(() => []);

  return <LeadsClient initialLeads={leads} />;
}
