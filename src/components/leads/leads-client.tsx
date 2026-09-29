"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Upload, Search, Pencil, Trash2 } from "lucide-react";
import type { Lead } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LeadFormDialog } from "./lead-form-dialog";
import { ImportDialog } from "./import-dialog";
import { formatDate, initials } from "@/lib/utils";

export function LeadsClient({ initialLeads }: { initialLeads: Lead[] }) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.firstName, l.lastName, l.email, l.company, l.jobTitle]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    );
  }, [leads, search]);

  function upsertLead(lead: Lead) {
    setLeads((prev) => {
      const idx = prev.findIndex((l) => l.id === lead.id);
      if (idx === -1) return [lead, ...prev];
      const copy = [...prev];
      copy[idx] = lead;
      return copy;
    });
  }

  async function handleDelete(lead: Lead) {
    if (!confirm(`Delete ${lead.email}? This cannot be undone.`)) return;
    const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete lead.");
      return;
    }
    setLeads((prev) => prev.filter((l) => l.id !== lead.id));
    toast.success("Lead deleted.");
  }

  async function refreshFromServer() {
    const res = await fetch("/api/leads");
    const data = await res.json();
    if (res.ok) setLeads(data.leads);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Lead
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No leads yet. Add one or import a CSV to get started.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                        {initials(lead.firstName, lead.lastName)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "—"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{lead.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{lead.company || "—"}</TableCell>
                  <TableCell className="text-sm">{lead.jobTitle || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(lead.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditing(lead);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(lead)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LeadFormDialog open={formOpen} onOpenChange={setFormOpen} lead={editing} onSaved={upsertLead} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={refreshFromServer} />
    </div>
  );
}
