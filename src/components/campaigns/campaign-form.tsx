"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PERSONALIZATION_VARIABLES } from "@/lib/validation/campaign";
import type { SendingAccountSummary } from "@/lib/types";

interface FollowUpSlot {
  enabled: boolean;
  delayDays: number;
  instructions: string;
}

const EMPTY_SLOT: FollowUpSlot = { enabled: false, delayDays: 3, instructions: "" };

export interface CampaignFormValue {
  id?: string;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  followUps: FollowUpSlot[];
  aiPersonalizationEnabled: boolean;
  autoFollowUpEnabled: boolean;
  dailyLimit: number;
  delayMinBetweenSendsSec: number;
  delayMaxBetweenSendsSec: number;
  sendingAccountIds: string[];
}

export function defaultCampaignForm(): CampaignFormValue {
  return {
    name: "",
    subjectTemplate: "",
    bodyTemplate: "",
    followUps: [
      { ...EMPTY_SLOT, enabled: true, delayDays: 3 },
      { ...EMPTY_SLOT, delayDays: 5 },
      { ...EMPTY_SLOT, delayDays: 7 },
    ],
    aiPersonalizationEnabled: true,
    autoFollowUpEnabled: false,
    dailyLimit: 25,
    delayMinBetweenSendsSec: 60,
    delayMaxBetweenSendsSec: 300,
    sendingAccountIds: [],
  };
}

export function CampaignForm({
  initial,
  sendingAccounts,
}: {
  initial: CampaignFormValue;
  sendingAccounts: SendingAccountSummary[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<CampaignFormValue>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(initial.id);

  function updateFollowUp(index: number, patch: Partial<FollowUpSlot>) {
    setForm((f) => {
      const followUps = [...f.followUps];
      followUps[index] = { ...followUps[index], ...patch };
      return { ...f, followUps };
    });
  }

  function toggleSendingAccount(id: string) {
    setForm((f) => ({
      ...f,
      sendingAccountIds: f.sendingAccountIds.includes(id)
        ? f.sendingAccountIds.filter((x) => x !== id)
        : [...f.sendingAccountIds, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      name: form.name,
      subjectTemplate: form.subjectTemplate,
      bodyTemplate: form.bodyTemplate,
      followUpTemplates: form.followUps
        .map((slot, i) => ({ ...slot, order: i + 1 }))
        .filter((slot) => slot.enabled)
        .map((slot) => ({ order: slot.order, delayDays: slot.delayDays, instructions: slot.instructions })),
      aiPersonalizationEnabled: form.aiPersonalizationEnabled,
      autoFollowUpEnabled: form.autoFollowUpEnabled,
      dailyLimit: form.dailyLimit,
      delayMinBetweenSendsSec: form.delayMinBetweenSendsSec,
      delayMaxBetweenSendsSec: form.delayMaxBetweenSendsSec,
      sendingAccountIds: form.sendingAccountIds,
    };

    try {
      const url = isEdit ? `/api/campaigns/${initial.id}` : "/api/campaigns";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not save campaign.");
        return;
      }

      toast.success(isEdit ? "Campaign updated." : "Campaign created as a draft.");
      router.push(`/campaigns/${data.campaign.id}`);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Campaign Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subjectTemplate">Subject Line</Label>
            <Input
              id="subjectTemplate"
              value={form.subjectTemplate}
              onChange={(e) => setForm((f) => ({ ...f, subjectTemplate: e.target.value }))}
              placeholder="Quick question, {{first_name}}"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bodyTemplate">Initial Email Body</Label>
            <Textarea
              id="bodyTemplate"
              rows={8}
              value={form.bodyTemplate}
              onChange={(e) => setForm((f) => ({ ...f, bodyTemplate: e.target.value }))}
              placeholder={`Hi {{first_name}},\n\n{{custom_line}}\n\n...`}
              required
            />
            <p className="text-xs text-muted-foreground">
              Variables: {PERSONALIZATION_VARIABLES.join("  ")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Follow-Up Sequence</CardTitle>
          <CardDescription>
            AI drafts each follow-up from the thread context; delays are configurable, never hard-coded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {form.followUps.map((slot, i) => (
            <div key={i} className="flex items-start gap-3 rounded-md border border-border p-3">
              <Switch checked={slot.enabled} onCheckedChange={(v) => updateFollowUp(i, { enabled: v })} />
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Follow-Up {i + 1}</span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`delay-${i}`} className="text-xs text-muted-foreground">
                      Wait
                    </Label>
                    <Input
                      id={`delay-${i}`}
                      type="number"
                      min={1}
                      max={60}
                      className="h-8 w-20"
                      value={slot.delayDays}
                      disabled={!slot.enabled}
                      onChange={(e) => updateFollowUp(i, { delayDays: Number(e.target.value) })}
                    />
                    <span className="text-xs text-muted-foreground">days</span>
                  </div>
                </div>
                <Textarea
                  rows={2}
                  placeholder="Instructions for the AI draft (tone, angle, what to reference)…"
                  value={slot.instructions}
                  disabled={!slot.enabled}
                  onChange={(e) => updateFollowUp(i, { instructions: e.target.value })}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sending Accounts</CardTitle>
          <CardDescription>Select one or more inboxes to rotate sends between.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {sendingAccounts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No sending accounts connected yet. Connect one on the Sending Accounts page first.
            </p>
          )}
          {sendingAccounts.map((acc) => (
            <label key={acc.id} className="flex items-center gap-3 rounded-md border border-border p-2.5 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={form.sendingAccountIds.includes(acc.id)}
                onChange={() => toggleSendingAccount(acc.id)}
              />
              <span className="font-medium">{acc.email}</span>
              <span className="ml-auto text-xs text-muted-foreground">{acc.dailyLimit}/day</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sending Rules</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="dailyLimit">Daily Send Limit</Label>
            <Input
              id="dailyLimit"
              type="number"
              min={1}
              max={500}
              value={form.dailyLimit}
              onChange={(e) => setForm((f) => ({ ...f, dailyLimit: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delayMin">Min Delay (sec)</Label>
            <Input
              id="delayMin"
              type="number"
              min={0}
              value={form.delayMinBetweenSendsSec}
              onChange={(e) => setForm((f) => ({ ...f, delayMinBetweenSendsSec: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delayMax">Max Delay (sec)</Label>
            <Input
              id="delayMax"
              type="number"
              min={0}
              value={form.delayMaxBetweenSendsSec}
              onChange={(e) => setForm((f) => ({ ...f, delayMaxBetweenSendsSec: Number(e.target.value) }))}
            />
          </div>
          <div className="col-span-2 flex items-center justify-between rounded-md border border-border p-3 sm:col-span-3">
            <div>
              <p className="text-sm font-medium">AI Personalization</p>
              <p className="text-xs text-muted-foreground">Let AI fill {"{{custom_line}}"} per lead.</p>
            </div>
            <Switch
              checked={form.aiPersonalizationEnabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, aiPersonalizationEnabled: v }))}
            />
          </div>
          <div className="col-span-2 flex items-center justify-between rounded-md border border-border p-3 sm:col-span-3">
            <div>
              <p className="text-sm font-medium">Automatic Follow-Up Mode</p>
              <p className="text-xs text-muted-foreground">
                Send approved follow-ups automatically. Always stops on a real reply.
              </p>
            </div>
            <Switch
              checked={form.autoFollowUpEnabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, autoFollowUpEnabled: v }))}
            />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/campaigns")}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Draft Campaign"}
        </Button>
      </div>
    </form>
  );
}
