"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import type { SendingAccountSummary } from "@/lib/types";

export function SendingAccountsClient({
  initialAccounts,
  oauthConfigured,
}: {
  initialAccounts: SendingAccountSummary[];
  oauthConfigured: boolean;
}) {
  const [accounts, setAccounts] = useState(initialAccounts);

  async function toggleActive(id: string, isActive: boolean) {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, isActive } : a)));
    const res = await fetch(`/api/sending-accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (!res.ok) {
      toast.error("Could not update account.");
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, isActive: !isActive } : a)));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {accounts.length} of 3+ recommended inbox{accounts.length === 1 ? "" : "es"} connected.
        </p>
        <Button asChild disabled={!oauthConfigured} title={oauthConfigured ? undefined : "Set GOOGLE_CLIENT_ID/SECRET first"}>
          <a href="/api/sending-accounts/google">
            <Plus className="mr-2 h-4 w-4" />
            Connect Email Account
          </a>
        </Button>
      </div>

      {!oauthConfigured && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="p-4 text-sm">
            Google OAuth isn&apos;t configured yet. Set <code className="font-mono">GOOGLE_CLIENT_ID</code>,{" "}
            <code className="font-mono">GOOGLE_CLIENT_SECRET</code>, and{" "}
            <code className="font-mono">GOOGLE_REDIRECT_URI</code> in your environment to connect Gmail accounts.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Daily Limit</TableHead>
                <TableHead>Last Sync</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    No sending accounts connected yet.
                  </TableCell>
                </TableRow>
              )}
              {accounts.map((acc) => (
                <TableRow key={acc.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Send className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{acc.email}</p>
                        <p className="text-xs text-muted-foreground">{acc.provider}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{acc.dailyLimit}/day</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {acc.lastSyncAt ? formatDateTime(acc.lastSyncAt) : "Never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={acc.isActive} onCheckedChange={(v) => toggleActive(acc.id, v)} />
                      <Badge variant={acc.isActive ? "success" : "outline"}>{acc.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
