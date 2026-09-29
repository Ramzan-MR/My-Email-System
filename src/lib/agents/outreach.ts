import { startOfDay } from "date-fns";
import { addDays } from "date-fns";
import { prisma } from "@/lib/db";
import { sendGmailMessage } from "@/lib/email/gmail";
import { getAIProvider } from "@/lib/ai";
import { canSendEmail, buildIdempotencyKey } from "@/lib/email/safety";
import { renderTemplate } from "./template";
import type { FollowUpTemplate } from "@/lib/validation/campaign";

export interface OutreachRunResult {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Outreach Agent: sends the initial email for approved, eligible leads on
 * ACTIVE campaigns. Called by /api/cron/send-campaigns. Bounded by
 * maxTotal per invocation — Vercel functions can't sleep for the full
 * configured inter-send delay, so pacing comes from cron frequency plus a
 * short in-process delay, not a long in-memory sleep.
 */
export async function sendOutreachBatch(maxTotal = 10): Promise<OutreachRunResult> {
  const result: OutreachRunResult = { attempted: 0, sent: 0, failed: 0, skipped: 0 };
  const todayStart = startOfDay(new Date());
  const ai = getAIProvider();

  const campaigns = await prisma.campaign.findMany({
    where: { status: "ACTIVE" },
    include: {
      sendingAccounts: { include: { sendingAccount: true } },
      campaignLeads: {
        where: { approved: true, status: "READY", initialEmailSent: false },
        include: { lead: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  for (const campaign of campaigns) {
    if (result.attempted >= maxTotal) break;

    const activeAccounts = campaign.sendingAccounts
      .map((sa) => sa.sendingAccount)
      .filter((acc) => acc.isActive);
    if (activeAccounts.length === 0) continue;

    // Track sends-so-far per account this run, seeded from today's count.
    const sentTodayByAccount = new Map<string, number>();
    for (const acc of activeAccounts) {
      const count = await prisma.emailMessage.count({
        where: { sendingAccountId: acc.id, status: "SENT", sentAt: { gte: todayStart } },
      });
      sentTodayByAccount.set(acc.id, count);
    }

    let rotationIndex = 0;
    let followUpTemplates: FollowUpTemplate[] = [];
    try {
      followUpTemplates = JSON.parse(campaign.followUpTemplates);
    } catch {
      followUpTemplates = [];
    }
    const firstFollowUp = followUpTemplates.find((f) => f.order === 1);

    for (const campaignLead of campaign.campaignLeads) {
      if (result.attempted >= maxTotal) break;

      // Find the next account in rotation with remaining daily capacity.
      let chosenAccount = null;
      for (let i = 0; i < activeAccounts.length; i++) {
        const candidate = activeAccounts[(rotationIndex + i) % activeAccounts.length];
        const sentToday = sentTodayByAccount.get(candidate.id) ?? 0;
        if (sentToday < candidate.dailyLimit && sentToday < campaign.dailyLimit) {
          chosenAccount = candidate;
          rotationIndex = (rotationIndex + i + 1) % activeAccounts.length;
          break;
        }
      }
      if (!chosenAccount) break; // every account is at capacity for now

      result.attempted++;

      const suppressed = await prisma.suppressionEntry.findUnique({
        where: { email: campaignLead.lead.email },
      });
      const idempotencyKey = buildIdempotencyKey({ campaignLeadId: campaignLead.id, type: "INITIAL" });
      const alreadyRecorded = await prisma.emailMessage.findUnique({ where: { idempotencyKey } });

      const eligibility = canSendEmail({
        campaignStatus: campaign.status,
        campaignLeadApproved: campaignLead.approved,
        leadStatus: campaignLead.status,
        isSuppressed: Boolean(suppressed),
        sendingAccountActive: chosenAccount.isActive,
        sendingAccountSentToday: sentTodayByAccount.get(chosenAccount.id) ?? 0,
        sendingAccountDailyLimit: Math.min(chosenAccount.dailyLimit, campaign.dailyLimit),
        alreadyRecorded: Boolean(alreadyRecorded),
      });

      if (!eligibility.allowed) {
        result.skipped++;
        continue;
      }

      try {
        let customLine = "";
        if (campaign.aiPersonalizationEnabled) {
          customLine = await ai.generatePersonalization({ lead: campaignLead.lead });
        }
        const subject = renderTemplate(campaign.subjectTemplate, campaignLead.lead, customLine);
        const body = renderTemplate(campaign.bodyTemplate, campaignLead.lead, customLine);

        const sendResult = await sendGmailMessage({
          sendingAccountId: chosenAccount.id,
          to: campaignLead.lead.email,
          subject,
          body,
        });

        await prisma.$transaction(async (tx) => {
          const thread = await tx.emailThread.create({
            data: {
              campaignLeadId: campaignLead.id,
              leadId: campaignLead.leadId,
              sendingAccountId: chosenAccount.id,
              gmailThreadId: sendResult.gmailThreadId,
              subject,
              lastMessageAt: new Date(),
            },
          });

          await tx.emailMessage.create({
            data: {
              campaignId: campaign.id,
              campaignLeadId: campaignLead.id,
              leadId: campaignLead.leadId,
              sendingAccountId: chosenAccount.id,
              emailThreadId: thread.id,
              type: "INITIAL",
              subject,
              body,
              gmailMessageId: sendResult.gmailMessageId,
              gmailThreadId: sendResult.gmailThreadId,
              status: "SENT",
              idempotencyKey,
              sentAt: new Date(),
            },
          });

          await tx.campaignLead.update({
            where: { id: campaignLead.id },
            data: {
              initialEmailSent: true,
              initialEmailDate: new Date(),
              lastContactedAt: new Date(),
              status: "SENT",
              senderAccountId: chosenAccount.id,
              nextFollowUpDate: firstFollowUp ? addDays(new Date(), firstFollowUp.delayDays) : null,
            },
          });

          await tx.auditLog.create({
            data: {
              action: "email.sent",
              entityType: "EmailMessage",
              leadId: campaignLead.leadId,
              campaignId: campaign.id,
              metadata: JSON.stringify({ type: "INITIAL", sendingAccountId: chosenAccount.id }),
            },
          });
        });

        sentTodayByAccount.set(chosenAccount.id, (sentTodayByAccount.get(chosenAccount.id) ?? 0) + 1);
        result.sent++;
      } catch (err) {
        console.error("[outreach] send failed", { campaignLeadId: campaignLead.id, err });
        result.failed++;
      }
    }
  }

  return result;
}
