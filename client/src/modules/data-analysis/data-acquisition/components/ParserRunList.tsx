/**
 * ParserRunList — per-item processing run list.
 *
 * Worker-bound runs that fail or hit a degraded worker are recorded
 * here with the worker error preserved — the UI renders them as
 * destructive badges so operators can audit the failure path.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  running: "outline",
  pending: "outline",
  failed: "destructive",
  degraded: "destructive",
};

export function ParserRunList() {
  const runs =
    trpc.dataAnalysis.dataAcquisition.listProcessingRuns.useQuery({});
  if (runs.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  const rows = runs.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Processing Runs</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No processing runs yet. Worker-bound runs are recorded as
            failed/degraded when the worker is offline — they are never
            silently dropped.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r: any) => (
              <div key={r.id} className="border rounded p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    Item #{r.itemId} · {r.pipeline}/{r.processorName}
                  </span>
                  <Badge variant={STATUS_BADGE[r.status] ?? "secondary"}>
                    {r.status}
                  </Badge>
                </div>
                {r.errorMessage ? (
                  <p className="text-xs text-destructive mt-1">{r.errorMessage}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
