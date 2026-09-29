"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Pause, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED";

export function CampaignStatusActions({
  campaignId,
  status,
  approvedLeadCount,
  sendingAccountCount,
  dailyLimit,
}: {
  campaignId: string;
  status: CampaignStatus;
  approvedLeadCount: number;
  sendingAccountCount: number;
  dailyLimit: number;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function setStatus(newStatus: CampaignStatus) {
    setPending(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        toast.error("Could not update campaign status.");
        return;
      }
      toast.success(`Campaign ${newStatus.toLowerCase()}.`);
      setConfirmOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (status === "DRAFT" || status === "PAUSED") {
    return (
      <>
        <Button onClick={() => setConfirmOpen(true)}>
          <Play className="mr-2 h-4 w-4" />
          {status === "DRAFT" ? "Launch Campaign" : "Resume Campaign"}
        </Button>
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm campaign launch</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 pt-2 text-sm text-foreground">
                  <p>Before this campaign starts sending, review exactly what will happen:</p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>
                      <strong>{approvedLeadCount}</strong> approved lead{approvedLeadCount === 1 ? "" : "s"} are
                      eligible to receive the initial email.
                    </li>
                    <li>
                      Sending rotates across <strong>{sendingAccountCount}</strong> connected inbox
                      {sendingAccountCount === 1 ? "" : "es"}, up to <strong>{dailyLimit}</strong> emails/day.
                    </li>
                    <li>Leads who already replied, unsubscribed, bounced, or are paused are automatically skipped.</li>
                  </ul>
                  {approvedLeadCount === 0 && (
                    <p className="font-medium text-warning">
                      No leads are approved yet — nothing will send until you approve leads on the Leads tab.
                    </p>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStatus("ACTIVE")} disabled={pending}>
                {pending ? "Launching…" : "Confirm & Launch"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (status === "ACTIVE") {
    return (
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStatus("PAUSED")} disabled={pending}>
          <Pause className="mr-2 h-4 w-4" />
          Pause
        </Button>
        <Button variant="outline" onClick={() => setStatus("COMPLETED")} disabled={pending}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Mark Completed
        </Button>
      </div>
    );
  }

  return null;
}
