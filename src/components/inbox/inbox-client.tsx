"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ThumbsUp, ThumbsDown, PlaneTakeoff, Pause, Play, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

export interface ReplyRow {
  id: string;
  fromEmail: string;
  snippet: string | null;
  bodyText: string | null;
  receivedAt: string;
  classification: string | null;
  aiSummary: string | null;
  isAutoReply: boolean;
  lead: { id: string; firstName: string | null; lastName: string | null; email: string; company: string | null };
}

export function InboxClient({ initialReplies }: { initialReplies: ReplyRow[] }) {
  const [replies, setReplies] = useState(initialReplies);

  async function act(id: string, payload: Record<string, unknown>, successMessage: string) {
    const res = await fetch(`/api/replies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      toast.error("Could not update reply.");
      return;
    }
    const data = await res.json();
    setReplies((prev) => prev.map((r) => (r.id === id ? { ...r, classification: data.reply.classification } : r)));
    toast.success(successMessage);
  }

  function addNote(id: string) {
    const note = prompt("Add a note for this lead:");
    if (!note) return;
    act(id, { note }, "Note added.");
  }

  if (replies.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          No replies yet. Once the Reply Intelligence Agent is connected (Sending Accounts → Gmail), incoming
          replies will appear here for review.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {replies.map((reply) => (
        <Card key={reply.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">
                    {[reply.lead.firstName, reply.lead.lastName].filter(Boolean).join(" ") || reply.lead.email}
                  </p>
                  {reply.lead.company && <span className="text-sm text-muted-foreground">· {reply.lead.company}</span>}
                </div>
                <p className="text-xs text-muted-foreground">{reply.fromEmail}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {reply.classification && <Badge variant="secondary">{reply.classification}</Badge>}
                <span className="text-xs text-muted-foreground">{formatDateTime(reply.receivedAt)}</span>
              </div>
            </div>

            {reply.aiSummary && <p className="text-sm">{reply.aiSummary}</p>}
            <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              {reply.snippet ?? reply.bodyText?.slice(0, 300)}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => act(reply.id, { classification: "INTERESTED" }, "Marked interested.")}>
                <ThumbsUp className="mr-1.5 h-3.5 w-3.5" />
                Mark Interested
              </Button>
              <Button size="sm" variant="outline" onClick={() => act(reply.id, { classification: "NOT_INTERESTED" }, "Marked not interested.")}>
                <ThumbsDown className="mr-1.5 h-3.5 w-3.5" />
                Mark Not Interested
              </Button>
              <Button size="sm" variant="outline" onClick={() => act(reply.id, { classification: "AUTO_REPLY" }, "Marked auto reply.")}>
                <PlaneTakeoff className="mr-1.5 h-3.5 w-3.5" />
                Mark Auto Reply
              </Button>
              <Button size="sm" variant="outline" onClick={() => act(reply.id, { pauseFollowUps: true }, "Follow-ups paused.")}>
                <Pause className="mr-1.5 h-3.5 w-3.5" />
                Pause Follow-Ups
              </Button>
              <Button size="sm" variant="outline" onClick={() => act(reply.id, { pauseFollowUps: false }, "Follow-ups resumed.")}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Resume Follow-Ups
              </Button>
              <Button size="sm" variant="outline" onClick={() => addNote(reply.id)}>
                <StickyNote className="mr-1.5 h-3.5 w-3.5" />
                Add Note
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
