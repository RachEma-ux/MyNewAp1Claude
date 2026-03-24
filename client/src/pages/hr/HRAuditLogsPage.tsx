/**
 * HR Audit Logs Page — View HR system audit trail and access logs
 */

import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ListOrdered } from "lucide-react";

export default function HRAuditLogsPage() {
  const [actionPrefix, setActionPrefix] = useState<string>("");

  const logs = trpc.hr.analytics.listAuditLog.useQuery({
    limit: 100,
    ...(actionPrefix ? { actionPrefix } : {}),
  });

  if (logs.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><div className="animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-44" /><div className="h-40 bg-muted rounded" /></div></div>;
  }

  const prefixFilters = [
    { label: "All", value: "" },
    { label: "Directory", value: "hr.worker" },
    { label: "Organization", value: "hr.org" },
    { label: "Compliance", value: "hr.compliance" },
    { label: "Incidents", value: "hr.incident" },
    { label: "Letters", value: "hr.letter" },
    { label: "Roles", value: "hr.role" },
    { label: "Analytics", value: "hr.analytics" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr/security-access"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ListOrdered className="w-6 h-6" /> Audit Logs</h1>
          <p className="text-muted-foreground">HR system audit trail and access logs</p>
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        {prefixFilters.map((f) => (
          <Button key={f.value} size="sm" variant={actionPrefix === f.value ? "default" : "outline"} onClick={() => setActionPrefix(f.value)}>
            {f.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-2">
        {logs.data?.length === 0 && (
          <Card><CardContent className="p-4 text-muted-foreground">No audit log entries found.</CardContent></Card>
        )}
        {logs.data?.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-mono">{entry.action}</Badge>
                  {entry.targetWorkerId && <span className="text-xs text-muted-foreground">Worker #{entry.targetWorkerId}</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {entry.actorId && <span>Actor #{entry.actorId} | </span>}
                  {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ""}
                </div>
              </div>
              {entry.metadata && (
                <div className="text-xs text-muted-foreground mt-1 font-mono truncate">
                  {JSON.stringify(entry.metadata)}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
