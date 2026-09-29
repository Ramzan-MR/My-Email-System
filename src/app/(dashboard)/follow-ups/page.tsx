import { prisma } from "@/lib/db";
import { FollowUpsClient } from "@/components/follow-ups/follow-ups-client";

export const dynamic = "force-dynamic";

export default async function FollowUpsPage() {
  const followUps = await prisma.followUp
    .findMany({
      where: { status: { in: ["PENDING_REVIEW"] } },
      orderBy: { dueDate: "asc" },
      include: { lead: true, campaign: true },
    })
    .catch(() => []);

  const rows = followUps.map((fu) => ({
    id: fu.id,
    followUpNumber: fu.followUpNumber,
    dueDate: fu.dueDate.toISOString(),
    draftSubject: fu.draftSubject,
    draftBody: fu.draftBody,
    status: fu.status,
    lead: {
      firstName: fu.lead.firstName,
      lastName: fu.lead.lastName,
      email: fu.lead.email,
      company: fu.lead.company,
    },
    campaign: { name: fu.campaign.name },
  }));

  return <FollowUpsClient initialFollowUps={rows} />;
}
