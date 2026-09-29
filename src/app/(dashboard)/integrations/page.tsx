import { Sheet } from "lucide-react";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const integrations = await prisma.integration.findMany({ orderBy: { createdAt: "desc" } }).catch(() => []);
  const sheetsEnabled = process.env.GOOGLE_SHEETS_ENABLED === "true";

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sheet className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Google Sheets</CardTitle>
              <CardDescription>
                Import leads from a sheet and keep reply/status changes synced back automatically.
              </CardDescription>
            </div>
            <Badge variant={sheetsEnabled ? "success" : "outline"} className="ml-auto">
              {sheetsEnabled ? "Enabled" : "Not Configured"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {integrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Google Sheets connected yet. The internal Leads table works out of the box — connect a sheet
              here once you want two-way sync (set <code className="font-mono">GOOGLE_SHEETS_ENABLED=true</code>{" "}
              and reuse your Google OAuth credentials with the Sheets scope).
            </p>
          ) : (
            <ul className="space-y-2">
              {integrations.map((i) => (
                <li key={i.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                  <span className="font-medium">{i.name}</span>
                  <Badge variant={i.isActive ? "success" : "outline"}>{i.isActive ? "Active" : "Inactive"}</Badge>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" disabled>
            Connect Google Sheet (coming soon)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
