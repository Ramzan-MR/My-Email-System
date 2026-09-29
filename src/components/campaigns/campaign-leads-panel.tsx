"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { CampaignLead, Lead } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CampaignLeadWithLead = CampaignLead & { lead: Lead };

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "secondary" | "destructive"> = {
  PENDING: "secondary",
  READY: "default",
  QUEUED: "secondary",
  SENT: "default",
  FOLLOWUP_DUE: "warning",
  REPLIED: "success",
  AUTO_REPLY: "secondary",
  BOUNCED: "destructive",
  UNSUBSCRIBED: "destructive",
  PAUSED: "warning",
  INTERESTED: "success",
  NOT_INTERESTED: "secondary",
  NEEDS_HUMAN_REVIEW: "warning",
  COMPLETED: "default",
};

export function CampaignLeadsPanel({
  campaignId,
  initialCampaignLeads,
  allLeads,
}: {
  campaignId: string;
  initialCampaignLeads: CampaignLeadWithLead[];
  allLeads: Lead[];
}) {
  const [campaignLeads, setCampaignLeads] = useState(initialCampaignLeads);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const existingIds = useMemo(() => new Set(campaignLeads.map((cl) => cl.leadId)), [campaignLeads]);
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allLeads.filter((l) => {
      if (existingIds.has(l.id)) return false;
      if (!q) return true;
      return [l.firstName, l.lastName, l.email, l.company].filter(Boolean).some((v) => v!.toLowerCase().includes(q));
    });
  }, [allLeads, existingIds, search]);

  async function refresh() {
    const res = await fetch(`/api/campaigns/${campaignId}`);
    const data = await res.json();
    if (res.ok) setCampaignLeads(data.campaign.campaignLeads);
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Could not add leads.");
        return;
      }
      toast.success(`Added ${data.added} lead(s) to campaign.${data.skippedSuppressed ? ` ${data.skippedSuppressed} skipped (suppressed).` : ""}`);
      setSelected(new Set());
      setAddOpen(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleApprove(campaignLeadId: string, approved: boolean) {
    setCampaignLeads((prev) =>
      prev.map((cl) => (cl.id === campaignLeadId ? { ...cl, approved, status: approved ? "READY" : "PENDING" } : cl))
    );
    const res = await fetch(`/api/campaigns/${campaignId}/leads`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignLeadIds: [campaignLeadId], approved }),
    });
    if (!res.ok) {
      toast.error("Could not update approval.");
      await refresh();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {campaignLeads.length} lead{campaignLeads.length === 1 ? "" : "s"} in this campaign ·{" "}
          {campaignLeads.filter((cl) => cl.approved).length} approved
        </p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Leads
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lead</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Approved</TableHead>
            <TableHead>Follow-Up #</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaignLeads.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                No leads added yet.
              </TableCell>
            </TableRow>
          )}
          {campaignLeads.map((cl) => (
            <TableRow key={cl.id}>
              <TableCell>
                <p className="text-sm font-medium">
                  {[cl.lead.firstName, cl.lead.lastName].filter(Boolean).join(" ") || cl.lead.email}
                </p>
                <p className="text-xs text-muted-foreground">{cl.lead.email}</p>
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[cl.status] ?? "default"}>{cl.status}</Badge>
              </TableCell>
              <TableCell>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={cl.approved}
                  onChange={(e) => toggleApprove(cl.id, e.target.checked)}
                />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{cl.followUpNumber}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Leads to Campaign</DialogTitle>
          </DialogHeader>
          <Input placeholder="Search leads…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {candidates.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No matching leads.</p>
            )}
            {candidates.map((lead) => (
              <label key={lead.id} className="flex items-center gap-3 rounded-md border border-border p-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={selected.has(lead.id)}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(lead.id)) next.delete(lead.id);
                      else next.add(lead.id);
                      return next;
                    })
                  }
                />
                <span className="font-medium">{[lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email}</span>
                <span className="ml-auto text-xs text-muted-foreground">{lead.email}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={busy || selected.size === 0}>
              {busy ? "Adding…" : `Add ${selected.size || ""} Lead${selected.size === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
