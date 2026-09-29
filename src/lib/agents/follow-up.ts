import { addDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { sendGmailMessage } from "@/lib/email/gmail";
import { getAIProvider } from "@/lib/ai";
import { canSendEmail, buildIdempotencyKey } from "@/lib/email/safety";
import type { FollowUpTemplate } from "@/lib/validation/campaign";

function parseFollowUpTemplates(json: string): FollowUpTemplate[] {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export interface FindDueFollowUpsResult {
  evaluated: number;
  drafted: number;
  autoSent: number;
  completed: number;
}

/**
 * Follow-Up Agent, "due date" pass. For each campaign lead whose
 * nextFollowUpDate has arrived: re-checks the thread hasn't just received a
 * reply (CLAUDE.md: "Before sending a follow-up, check the mailbox/thread
 * again"), drafts the next follow-up with AI, and either queues it for human
 * review (default) or sends it immediately when the campaign has
 * autoFollowUpEnabled.
 */
export async function findDueFollowUps(maxTotal = 20): Promise<FindDueFollowUpsResult> {
  const result: FindDueFollowUpsResult = { evaluated: 0, drafted: 0, autoSent: 0, completed: 0 };
  const ai = getAIProvider();

  const due = await prisma.campaignLead.findMany({
    where: {
      status: "SENT",
      approved: true,
      nextFollowUpDate: { lte: new Date() },
      campaign: { status: "ACTIVE" },
    },
    take: maxTotal,
    include: {
      campaign: true,
      lead: true,
      emailThread: { include: { messages: { orderBy: { createdAt: "asc" } } } },
    },
  });

  for (const campaignLead of due) {
    result.evaluated++;

    // Re-check for an unprocessed reply that arrived since the last sync —
    // never send a follow-up over a reply we just haven't classified yet.
    const unprocessedReply = await prisma.reply.findFirst({
      where: { campaignLeadId: campaignLead.id, processedAt: null },
    });
    if (unprocessedReply) continue;

    const templates = parseFollowUpTemplates(campaignLead.campaign.followUpTemplates);
    const targetNumber = campaignLead.followUpNumber + 1;
    const template = templates.find((t) => t.order === targetNumber);

    if (!template) {
      await prisma.campaignLead.update({
        where: { id: campaignLead.id },
        data: { nextFollowUpDate: null, status: "COMPLETED" },
      });
      result.completed++;
      continue;
    }

    const existing = await prisma.followUp.findFirst({
      where: { campaignLeadId: campaignLead.id, followUpNumber: targetNumber },
    });
    if (existing && existing.status !== "SKIPPED" && existing.status !== "CANCELLED") {
      continue; // already drafted/approved/snoozed/sent — nothing to do this pass
    }

    const threadHistory = campaignLead.emailThread?.messages.map((m) => ({ from: "us", body: m.body })) ?? [];
    const draft = await ai.generateFollowUp({
      lead: { firstName: campaignLead.lead.firstName, company: campaignLead.lead.company },
      previousSubject: campaignLead.emailThread?.subject ?? campaignLead.campaign.subjectTemplate,
      previousBody: threadHistory.at(-1)?.body ?? campaignLead.campaign.bodyTemplate,
      threadHistory,
      followUpNumber: targetNumber,
      instructions: template.instructions,
    });

    const followUp = await prisma.followUp.upsert({
      where: { id: existing?.id ?? "__none__" },
      create: {
        campaignId: campaignLead.campaignId,
        campaignLeadId: campaignLead.id,
        leadId: campaignLead.leadId,
        followUpNumber: targetNumber,
        dueDate: campaignLead.nextFollowUpDate ?? new Date(),
        draftSubject: draft.subject,
        draftBody: draft.body,
        status: "PENDING_REVIEW",
      },
      update: {
        draftSubject: draft.subject,
        draftBody: draft.body,
        status: "PENDING_REVIEW",
      },
    });
    result.drafted++;

    if (campaignLead.campaign.autoFollowUpEnabled) {
      const sent = await sendFollowUpEmail(followUp.id);
      if (sent) result.autoSent++;
    }
  }

  return result;
}

/**
 * Sends an approved (or auto-mode) follow-up in-thread, advances the
 * campaign lead's sequence position, and marks the FollowUp SENT. Returns
 * false (without throwing) if the send was correctly blocked by a safety
 * rule — callers should treat that as "not sent yet", not an error.
 */
export async function sendFollowUpEmail(followUpId: string): Promise<boolean> {
  const followUp = await prisma.followUp.findUniqueOrThrow({
    where: { id: followUpId },
    include: {
      campaignLead: {
        include: { campaign: true, lead: true, senderAccount: true, emailThread: { include: { messages: true } } },
      },
    },
  });

  const { campaignLead } = followUp;
  const account = campaignLead.senderAccount;
  const thread = campaignLead.emailThread;
  if (!account || !thread) {
    console.error(`[followUp] cannot send ${followUpId} — missing sending account or thread`);
    return false;
  }

  const todayStart = startOfDay(new Date());
  const sentToday = await prisma.emailMessage.count({
    where: { sendingAccountId: account.id, status: "SENT", sentAt: { gte: todayStart } },
  });

  const suppressed = await prisma.suppressionEntry.findUnique({ where: { email: campaignLead.lead.email } });
  const idempotencyKey = buildIdempotencyKey({
    campaignLeadId: campaignLead.id,
    type: "FOLLOW_UP",
    followUpNumber: followUp.followUpNumber,
  });
  const alreadyRecorded = await prisma.emailMessage.findUnique({ where: { idempotencyKey } });

  const eligibility = canSendEmail({
    campaignStatus: campaignLead.campaign.status,
    campaignLeadApproved: campaignLead.approved,
    leadStatus: campaignLead.status,
    isSuppressed: Boolean(suppressed),
    sendingAccountActive: account.isActive,
    sendingAccountSentToday: sentToday,
    sendingAccountDailyLimit: Math.min(account.dailyLimit, campaignLead.campaign.dailyLimit),
    alreadyRecorded: Boolean(alreadyRecorded),
  });

  if (!eligibility.allowed) {
    console.warn(`[followUp] blocked sending ${followUpId}: ${eligibility.reason}`);
    return false;
  }

  const lastMessage = campaignLead.emailThread?.messages.at(-1);
  const subject = followUp.draftSubject || `Re: ${thread.subject ?? ""}`;
  const body = followUp.draftBody || "";

  const sendResult = await sendGmailMessage({
    sendingAccountId: account.id,
    to: campaignLead.lead.email,
    subject,
    body,
    threadId: thread.gmailThreadId ?? undefined,
    inReplyToMessageId: lastMessage?.gmailMessageId ?? undefined,
    referencesHeader: lastMessage?.gmailMessageId ?? undefined,
  });

  const templates = parseFollowUpTemplates(campaignLead.campaign.followUpTemplates);
  const nextTemplate = templates.find((t) => t.order === followUp.followUpNumber + 1);

  await prisma.$transaction(async (tx) => {
    await tx.emailMessage.create({
      data: {
        campaignId: campaignLead.campaignId,
        campaignLeadId: campaignLead.id,
        leadId: campaignLead.leadId,
        sendingAccountId: account.id,
        emailThreadId: thread.id,
        type: "FOLLOW_UP",
        followUpNumber: followUp.followUpNumber,
        subject,
        body,
        gmailMessageId: sendResult.gmailMessageId,
        gmailThreadId: sendResult.gmailThreadId,
        status: "SENT",
        idempotencyKey,
        sentAt: new Date(),
      },
    });

    await tx.followUp.update({
      where: { id: followUp.id },
      data: { status: "SENT", sentEmailMessageId: sendResult.gmailMessageId },
    });

    await tx.campaignLead.update({
      where: { id: campaignLead.id },
      data: {
        followUpNumber: followUp.followUpNumber,
        lastContactedAt: new Date(),
        nextFollowUpDate: nextTemplate ? addDays(new Date(), nextTemplate.delayDays) : null,
        status: nextTemplate ? "SENT" : "COMPLETED",
      },
    });

    await tx.auditLog.create({
      data: {
        action: "email.sent",
        entityType: "EmailMessage",
        leadId: campaignLead.leadId,
        campaignId: campaignLead.campaignId,
        metadata: JSON.stringify({ type: "FOLLOW_UP", followUpNumber: followUp.followUpNumber }),
      },
    });
  });

  return true;
}
