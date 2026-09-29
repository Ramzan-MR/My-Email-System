import Link from "next/link";
import {
  Users,
  Send,
  CalendarClock,
  MessageSquare,
  ThumbsUp,
  PlaneTakeoff,
  Clock,
  Ban,
  UserX,
  AlertTriangle,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  getDashboardStats,
  getRecentReplies,
  getFollowUpsDueToday,
  getActiveCampaigns,
  getSendingAccountsStatus,
} from "@/lib/queries/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [{ stats, dbConnected }, recentReplies, followUpsDue, activeCampaigns, sendingAccounts] =
    await Promise.all([
      getDashboardStats(),
      getRecentReplies(),
      getFollowUpsDueToday(),
      getActiveCampaigns(),
      getSendingAccountsStatus(),
    ]);

  return (
    <div className="space-y-6">
      {!dbConnected && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
            <span>
              Database not connected yet. Set <code className="font-mono">DATABASE_URL</code> and run{" "}
              <code className="font-mono">npm run db:push</code> to see live data here.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total Leads" value={stats.totalLeads} icon={Users} />
        <StatCard label="Emails Sent" value={stats.emailsSent} icon={Send} />
        <StatCard label="Emails Sent Today" value={stats.emailsSentToday} icon={CalendarClock} />
        <StatCard label="Replies" value={stats.replies} icon={MessageSquare} />
        <StatCard label="Positive Replies" value={stats.positiveReplies} icon={ThumbsUp} tone="success" />
        <StatCard label="Auto Replies" value={stats.autoReplies} icon={PlaneTakeoff} />
        <StatCard label="Follow-Ups Due" value={stats.followUpsDue} icon={Clock} tone="warning" />
        <StatCard label="Bounces" value={stats.bounces} icon={Ban} tone="destructive" />
        <StatCard label="Unsubscribes" value={stats.unsubscribes} icon={UserX} tone="destructive" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Replies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentReplies.length === 0 && (
              <p className="text-sm text-muted-foreground">No replies yet.</p>
            )}
            {recentReplies.map((reply) => (
              <div key={reply.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {reply.lead.firstName ?? reply.lead.email} — {reply.lead.company ?? "—"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{reply.snippet ?? reply.bodyText?.slice(0, 80)}</p>
                </div>
                <div className="ml-3 flex shrink-0 flex-col items-end gap-1">
                  {reply.classification && <Badge variant="secondary">{reply.classification}</Badge>}
                  <span className="text-xs text-muted-foreground">{formatDateTime(reply.receivedAt)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Follow-Ups Due Today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {followUpsDue.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing due — you&apos;re caught up.</p>
            )}
            {followUpsDue.map((fu) => (
              <div key={fu.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {fu.lead.firstName ?? fu.lead.email} — Follow-Up #{fu.followUpNumber}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{fu.campaign.name}</p>
                </div>
                <span className="text-xs text-muted-foreground">{formatDateTime(fu.dueDate)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active Campaigns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeCampaigns.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No active campaigns.{" "}
                <Link href="/campaigns" className="text-primary hover:underline">
                  Create one
                </Link>
                .
              </p>
            )}
            {activeCampaigns.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                <p className="text-sm font-medium">{c.name}</p>
                <span className="text-xs text-muted-foreground">{c._count.campaignLeads} leads</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sending Account Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sendingAccounts.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No inboxes connected yet.{" "}
                <Link href="/sending-accounts" className="text-primary hover:underline">
                  Connect one
                </Link>
                .
              </p>
            )}
            {sendingAccounts.map((acc) => (
              <div key={acc.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                <p className="text-sm font-medium">{acc.email}</p>
                <Badge variant={acc.isActive ? "success" : "outline"}>
                  {acc.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
