"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Lead } from "@prisma/client";

const FIELDS: { name: keyof FormState; label: string; placeholder?: string }[] = [
  { name: "firstName", label: "First Name" },
  { name: "lastName", label: "Last Name" },
  { name: "email", label: "Email", placeholder: "lead@company.com" },
  { name: "company", label: "Company" },
  { name: "website", label: "Website", placeholder: "https://company.com" },
  { name: "jobTitle", label: "Job Title" },
  { name: "linkedinUrl", label: "LinkedIn URL" },
  { name: "phone", label: "Phone" },
];

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  website: string;
  jobTitle: string;
  linkedinUrl: string;
  phone: string;
  customPersonalization: string;
  notes: string;
}

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  company: "",
  website: "",
  jobTitle: "",
  linkedinUrl: "",
  phone: "",
  customPersonalization: "",
  notes: "",
};

export function LeadFormDialog({
  open,
  onOpenChange,
  lead,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onSaved: (lead: Lead) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lead) {
      setForm({
        firstName: lead.firstName ?? "",
        lastName: lead.lastName ?? "",
        email: lead.email,
        company: lead.company ?? "",
        website: lead.website ?? "",
        jobTitle: lead.jobTitle ?? "",
        linkedinUrl: lead.linkedinUrl ?? "",
        phone: lead.phone ?? "",
        customPersonalization: lead.customPersonalization ?? "",
        notes: lead.notes ?? "",
      });
    } else {
      setForm(EMPTY);
    }
    setError(null);
  }, [lead, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const url = lead ? `/api/leads/${lead.id}` : "/api/leads";
      const method = lead ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not save lead.");
        return;
      }

      toast.success(lead ? "Lead updated." : "Lead added.");
      onSaved(data.lead);
      onOpenChange(false);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lead ? "Edit Lead" : "Add Lead"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((field) => (
              <div key={field.name} className={field.name === "email" ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
                <Label htmlFor={field.name}>{field.label}</Label>
                <Input
                  id={field.name}
                  placeholder={field.placeholder}
                  value={form[field.name]}
                  required={field.name === "email"}
                  type={field.name === "email" ? "email" : "text"}
                  onChange={(e) => setForm((f) => ({ ...f, [field.name]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customPersonalization">Custom Personalization</Label>
            <Textarea
              id="customPersonalization"
              rows={2}
              value={form.customPersonalization}
              onChange={(e) => setForm((f) => ({ ...f, customPersonalization: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : lead ? "Save Changes" : "Add Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
