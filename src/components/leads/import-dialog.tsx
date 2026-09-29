"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);

  async function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose a CSV file first.");
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/leads/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Import failed.");
        return;
      }
      setResult(data);
      toast.success(`Imported: ${data.created} added, ${data.updated} updated.`);
      onImported();
    } catch {
      toast.error("Import failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Leads from CSV</DialogTitle>
          <DialogDescription>
            Header row required. Recognized columns: First Name, Last Name, Email (required), Company,
            Website, Job Title, LinkedIn URL, Phone, Custom Personalization, Notes. Existing leads are
            matched and updated by email — nothing is duplicated.
          </DialogDescription>
        </DialogHeader>
        <Input ref={fileRef} type="file" accept=".csv,text/csv" />
        {result && (
          <p className="text-sm text-muted-foreground">
            {result.created} added, {result.updated} updated, {result.skipped} skipped.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleImport} disabled={uploading}>
            {uploading ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
