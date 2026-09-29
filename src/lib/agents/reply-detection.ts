import { prisma } from "@/lib/db";
import {
  listRecentMessages,
  getMessage,
  parseGmailMessage,
  extractEmailAddress,
} from "@/lib/email/gmail";
import { isHeaderAutoReply, isHeaderBounce, extractReturnDate } from "@/lib/email/detect-auto-reply";
import { getAIProvider } from "@/lib/ai";
import type { ReplyClassificationLabel } from "@/lib/ai/provider";
import { LEAD_STATUS_FOR_CLASSIFICATION, shouldCancelFollowUps } from "@/lib/email/classification-mapping";

export interface SyncInboxResult {
  accountsChecked: number;
  messagesFound: number;
  repliesCreated: number;
}

/**
 * Reply Intelligence Agent, step 1: pull new inbox messages for each active
 * sending account and record any that belong to a thread we started (see
 * CLAUDE.md "Match replies using: thread ID / message ID / References
 * headers / email address / campaign relationship — do not rely only on
 * subject matching"). Classification happens separately in classifyReplies()
 * so a slow/failed AI call never blocks ingestion.
 */
export async function syncInbox(): Promise<SyncInboxResult> {
  const result: SyncInboxResult = { accountsChecked: 0, messagesFound: 0, repliesCreated: 0 };

  const accounts = await prisma.sendingAccount.findMany({ where: { isActive: true } });

  for (const account of accounts) {
    result.accountsChecked++;
    const sinceDays = account.lastSyncAt
      ? Math.max(1, Math.ceil((Date.now() - account.lastSyncAt.getTime()) / 86400000) + 1)
      : 7;

    let messages: { id?: string | null; threadId?: string | null }[] = [];
    try {
      messages = await listRecentMessages(account.id, `in:inbox newer_than:${sinceDays}d`, 50);
    } catch (err) {
      console.error(`[syncInbox] failed to list messages for ${account.email}`, err);
      continue;
    }
    result.messagesFound += messages.length;

    for (const stub of messages) {
      if (!stub.id || !stub.threadId) continue;

      const [existingReply, ourOutgoing, thread] = await Promise.all([
        prisma.reply.findUnique({ where: { gmailMessageId: stub.id } }),
        prisma.emailMessage.findFirst({ where: { gmailMessageId: stub.id } }),
        prisma.emailThread.findUnique({ where: { gmailThreadId: stub.threadId } }),
      ]);

      // Not a reply to one of our outreach threads, already recorded, or
      // it's our own sent message showing up in the thread listing.
      if (!thread || existingReply || ourOutgoing) continue;

      let full;
      try {
        full = await getMessage(account.id, stub.id);
      } catch (err) {
        console.error(`[syncInbox] failed to fetch message ${stub.id}`, err);
        continue;
      }

      const parsed = parseGmailMessage(full);
      const fromEmail = extractEmailAddress(parsed.from);
      const headerAutoReply = isHeaderAutoReply({ ...parsed.headers, subject: parsed.subject });
      const headerBounce = isHeaderBounce({ ...parsed.headers, subject: parsed.subject });

      await prisma.$transaction(async (tx) => {
        await tx.reply.create({
          data: {
            campaignLeadId: thread.campaignLeadId,
            leadId: thread.leadId,
            emailThreadId: thread.id,
            sendingAccountId: account.id,
            gmailMessageId: stub.id!,
            fromEmail,
            snippet: parsed.snippet,
            bodyText: parsed.bodyText,
            receivedAt: parsed.receivedAt,
            isAutoReply: headerAutoReply,
            // classification is pre-filled for header-detected cases so
            // classifyReplies() can skip the AI call, but processedAt stays
            // null until that pass also updates the lead's status.
            classification: headerBounce ? "BOUNCE" : headerAutoReply ? "AUTO_REPLY" : null,
            autoReplyReturnDate: headerAutoReply ? extractReturnDate(parsed.bodyText) : null,
          },
        });
        await tx.emailThread.update({ where: { id: thread.id }, data: { lastMessageAt: parsed.receivedAt } });
      });

      result.repliesCreated++;
    }

    await prisma.sendingAccount.update({ where: { id: account.id }, data: { lastSyncAt: new Date() } });
  }

  return result;
}

export interface ClassifyRepliesResult {
  processed: number;
}

/**
 * Reply Intelligence Agent, step 2: classify unprocessed replies and update
 * the owning lead's status. Header-detected auto-replies/bounces skip the
 * AI call entirely (cheaper, and headers are more reliable for those two
 * cases specifically — see CLAUDE.md "Auto Reply Handling").
 */
export async function classifyReplies(limit = 25): Promise<ClassifyRepliesResult> {
  const ai = getAIProvider();
  const pending = await prisma.reply.findMany({
    where: { processedAt: null },
    take: limit,
    orderBy: { receivedAt: "asc" },
    include: { emailThread: { include: { messages: { orderBy: { createdAt: "asc" } } } } },
  });

  let processed = 0;

  for (const reply of pending) {
    let classification: ReplyClassificationLabel;
    let isAutoReply = reply.isAutoReply;
    let autoReplyReturnDate = reply.autoReplyReturnDate;
    let aiSummary: string | null = null;

    if (reply.classification === "BOUNCE") {
      classification = "BOUNCE";
    } else if (reply.classification === "AUTO_REPLY") {
      classification = "AUTO_REPLY";
    } else {
      const threadHistory =
        reply.emailThread?.messages.map((m) => ({ from: "us", body: m.body })) ?? [];
      const [classifyResult, summary] = await Promise.all([
        ai.classifyReply({
          subject: reply.emailThread?.subject ?? "",
          bodyText: reply.bodyText ?? "",
          fromEmail: reply.fromEmail,
          threadHistory,
        }),
        ai.summarizeReply({ bodyText: reply.bodyText ?? "" }),
      ]);
      classification = classifyResult.classification;
      isAutoReply = classifyResult.isAutoReply;
      autoReplyReturnDate = classifyResult.autoReplyReturnDate ? new Date(classifyResult.autoReplyReturnDate) : null;
      aiSummary = summary;
    }

    await prisma.$transaction(async (tx) => {
      await tx.reply.update({
        where: { id: reply.id },
        data: { classification, isAutoReply, autoReplyReturnDate, aiSummary, processedAt: new Date() },
      });

      if (reply.campaignLeadId) {
        const newStatus = LEAD_STATUS_FOR_CLASSIFICATION[classification];
        const cancelFollowUps = shouldCancelFollowUps(classification);
        await tx.campaignLead.update({
          where: { id: reply.campaignLeadId },
          data: {
            status: newStatus as never,
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

      await tx.auditLog.create({
        data: {
          action: "reply.classified",
          entityType: "Reply",
          entityId: reply.id,
          leadId: reply.leadId,
          metadata: JSON.stringify({ classification }),
        },
      });
    });

    processed++;
  }

  return { processed };
}
