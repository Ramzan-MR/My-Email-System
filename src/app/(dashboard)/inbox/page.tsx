import { prisma } from "@/lib/db";
import { InboxClient } from "@/components/inbox/inbox-client";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const replies = await prisma.reply
    .findMany({
      orderBy: { receivedAt: "desc" },
      take: 50,
      include: { lead: true },
    })
    .catch(() => []);

  const rows = replies.map((r) => ({
    id: r.id,
    fromEmail: r.fromEmail,
    snippet: r.snippet,
    bodyText: r.bodyText,
    receivedAt: r.receivedAt.toISOString(),
    classification: r.classification,
    aiSummary: r.aiSummary,
    isAutoReply: r.isAutoReply,
    lead: {
      id: r.lead.id,
      firstName: r.lead.firstName,
      lastName: r.lead.lastName,
      email: r.lead.email,
      company: r.lead.company,
    },
  }));

  return <InboxClient initialReplies={rows} />;
}
