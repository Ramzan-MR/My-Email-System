import { prisma } from "@/lib/db";
import { startOfDay } from "date-fns";

export interface DashboardStats {
  totalLeads: number;
  emailsSent: number;
  emailsSentToday: number;
  replies: number;
  positiveReplies: number;
  autoReplies: number;
  followUpsDue: number;
  bounces: number;
  unsubscribes: number;
}

const EMPTY_STATS: DashboardStats = {
  totalLeads: 0,
  emailsSent: 0,
  emailsSentToday: 0,
  replies: 0,
  positiveReplies: 0,
  autoReplies: 0,
  followUpsDue: 0,
  bounces: 0,
  unsubscribes: 0,
};

/**
 * Returns dashboard counts, or a zeroed-out result with dbConnected=false if
 * the database isn't reachable yet (e.g. DATABASE_URL not configured), so
 * the dashboard still renders with a helpful setup prompt instead of a 500.
 */
export async function getDashboardStats(): Promise<{ stats: DashboardStats; dbConnected: boolean }> {
  try {
    const todayStart = startOfDay(new Date());

    const [
      totalLeads,
      emailsSent,
      emailsSentToday,
      replies,
      positiveReplies,
      autoReplies,
      followUpsDue,
      bounces,
      unsubscribes,
    ] = await Promise.all([
      prisma.lead.count(),
      prisma.emailMessage.count({ where: { status: "SENT" } }),
      prisma.emailMessage.count({ where: { status: "SENT", sentAt: { gte: todayStart } } }),
      prisma.reply.count(),
      prisma.reply.count({
        where: { classification: { in: ["INTERESTED", "POSITIVE_REPLY", "MEETING_REQUEST"] } },
      }),
      prisma.reply.count({ where: { isAutoReply: true } }),
      prisma.followUp.count({ where: { status: "PENDING_REVIEW", dueDate: { lte: new Date() } } }),
      prisma.campaignLead.count({ where: { status: "BOUNCED" } }),
      prisma.campaignLead.count({ where: { status: "UNSUBSCRIBED" } }),
    ]);

    return {
      dbConnected: true,
      stats: {
        totalLeads,
        emailsSent,
        emailsSentToday,
        replies,
        positiveReplies,
        autoReplies,
        followUpsDue,
        bounces,
        unsubscribes,
      },
    };
  } catch (err) {
    console.error("[dashboard] failed to load stats — is DATABASE_URL configured and migrated?", err);
    return { dbConnected: false, stats: EMPTY_STATS };
  }
}

export async function getRecentReplies(limit = 5) {
  try {
    return await prisma.reply.findMany({
      take: limit,
      orderBy: { receivedAt: "desc" },
      include: { lead: true },
    });
  } catch {
    return [];
  }
}

export async function getFollowUpsDueToday(limit = 5) {
  try {
    return await prisma.followUp.findMany({
      where: { status: "PENDING_REVIEW", dueDate: { lte: new Date() } },
      take: limit,
      orderBy: { dueDate: "asc" },
      include: { lead: true, campaign: true },
    });
  } catch {
    return [];
  }
}

export async function getActiveCampaigns(limit = 5) {
  try {
    return await prisma.campaign.findMany({
      where: { status: "ACTIVE" },
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { campaignLeads: true } } },
    });
  } catch {
    return [];
  }
}

export async function getSendingAccountsStatus() {
  try {
    return await prisma.sendingAccount.findMany({
      orderBy: { createdAt: "asc" },
    });
  } catch {
    return [];
  }
}
