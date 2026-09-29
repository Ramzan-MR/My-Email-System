"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, SkipForward, Clock3, Square, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";

export interface FollowUpRow {
  id: string;
  followUpNumber: number;
  dueDate: string;
  draftSubject: string | null;
  draftBody: string | null;
  status: string;
  lead: { firstName: string | null; lastName: string | null; email: string; company: string | null };
  campaign: { name: string };
}

export function FollowUpsClient({ initialFollowUps }: { initialFollowUps: FollowUpRow[] }) {
  const [followUps, setFollowUps] = useState(initialFollowUps);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch(`/api/follow-ups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!res.ok) {
      toast.error("Could not update follow-up.");
      return;
    }
    if (action === "edit") {
      const data = await res.json();
      setFollowUps((prev) => prev.map((f) => (f.id === id ? { ...f, draftBody: data.followUp.draftBody } : f)));
      setEditingId(null);
      toast.success("Draft updated.");
    } else {
      setFollowUps((prev) => prev.filter((f) => f.id !== id));
      toast.success(
        {
          approve: "Follow-up approved.",
          skip: "Follow-up skipped.",
          snooze: "Follow-up snoozed.",
          stop_sequence: "Sequence stopped.",
        }[action] ?? "Updated."
      );
    }
  }

  if (followUps.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          Nothing needs review right now. Follow-ups appear here once they come due for active campaigns.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {followUps.length} follow-up{followUps.length === 1 ? "" : "s"} need review.
      </p>
      {followUps.map((fu) => {
        const overdueDays = Math.floor((Date.now() - new Date(fu.dueDate).getTime()) / 86400000);
        return (
          <Card key={fu.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">
                    {[fu.lead.firstName, fu.lead.lastName].filter(Boolean).join(" ") || fu.lead.email} —{" "}
                    {fu.campaign.name} — Follow-Up #{fu.followUpNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">{fu.lead.email}</p>
                </div>
                <Badge variant={overdueDays > 0 ? "warning" : "secondary"}>
                  {overdueDays > 0 ? `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue` : `Due ${formatDateTime(fu.dueDate)}`}
                </Badge>
              </div>

              {editingId === fu.id ? (
                <div className="space-y-2">
                  <Textarea rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => act(fu.id, "edit", { draftBody: draft })}>
                      Save Draft
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <p className="mb-1 font-medium">{fu.draftSubject ?? "(subject unchanged)"}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {fu.draftBody ?? "AI draft will appear here once generated."}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => act(fu.id, "approve")}>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Approve &amp; Send
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingId(fu.id);
                    setDraft(fu.draftBody ?? "");
                  }}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => act(fu.id, "skip")}>
                  <SkipForward className="mr-1.5 h-3.5 w-3.5" />
                  Skip
                </Button>
                <Button size="sm" variant="outline" onClick={() => act(fu.id, "snooze", { snoozeDays: 2 })}>
                  <Clock3 className="mr-1.5 h-3.5 w-3.5" />
                  Snooze 2d
                </Button>
                <Button size="sm" variant="outline" onClick={() => act(fu.id, "stop_sequence")}>
                  <Square className="mr-1.5 h-3.5 w-3.5" />
                  Stop Sequence
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
