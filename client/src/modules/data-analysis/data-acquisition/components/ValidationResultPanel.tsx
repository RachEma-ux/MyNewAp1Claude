/**
 * ValidationResultPanel — quality results per item.
 *
 * Shows confidence score + issue codes from
 * `data_acquisition_quality_results`. The Data Acquisition spec
 * requires every parsed item to have a quality verdict; this panel is
 * the operator audit surface.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface IssueShape {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
}

const SEVERITY: Record<IssueShape["severity"], "default" | "secondary" | "destructive"> = {
  low: "secondary",
  medium: "default",
  high: "destructive",
};

export function ValidationResultPanel() {
  // Quality results aren't exposed as their own list endpoint; the
  // CanonicalRecord list carries `confidenceScore` and the
  // ProcessingRun list carries the per-run failure messages. This
  // component combines both into a per-item validation summary.
  const records =
    trpc.dataAnalysis.dataAcquisition.listCanonicalRecords.useQuery({});
  const runs =
    trpc.dataAnalysis.dataAcquisition.listProcessingRuns.useQuery({});

  if (records.isLoading || runs.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  const recordRows = records.data ?? [];
  const runRows = runs.data ?? [];
  const failedRunsByItem = new Map<number, any[]>();
  for (const r of runRows) {
    if ((r as any).status === "failed" || (r as any).status === "degraded") {
      const arr = failedRunsByItem.get((r as any).itemId) ?? [];
      arr.push(r);
      failedRunsByItem.set((r as any).itemId, arr);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Validation Results</CardTitle>
      </CardHeader>
      <CardContent>
        {recordRows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No validated items yet.
          </p>
        ) : (
          <div className="space-y-2">
            {recordRows.map((r: any) => {
              const failed = failedRunsByItem.get(r.itemId) ?? [];
              const conf = r.confidenceScore ?? null;
              const sev: IssueShape["severity"] =
                conf === null
                  ? "medium"
                  : conf >= 75
                    ? "low"
                    : conf >= 50
                      ? "medium"
                      : "high";
              return (
                <div key={r.id} className="border rounded p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      Item #{r.itemId} · {r.recordType}
                    </span>
                    <Badge variant={SEVERITY[sev]}>conf {conf ?? "—"}</Badge>
                  </div>
                  {failed.length > 0 ? (
                    <p className="text-xs text-destructive mt-1">
                      {failed.length} failed/degraded run(s) recorded for this item
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
