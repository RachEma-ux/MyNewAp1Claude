/**
 * Dashboard summary cards — Data Acquisition.
 *
 * Reads `dataAnalysis.dataAcquisition.summary` and renders the
 * dashboard metrics enumerated in the spec: registered/active sources,
 * runs, items, processing failures, average confidence, output runs,
 * worker health, governance denials.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface MetricTileProps {
  label: string;
  value: string | number;
  hint?: string;
}

function MetricTile({ label, value, hint }: MetricTileProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function DataAcquisitionSummaryCards() {
  const summary = trpc.dataAnalysis.dataAcquisition.summary.useQuery({});
  if (summary.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading summary…</p>;
  }
  const s: any = summary.data;
  if (!s) return <p className="text-sm text-muted-foreground">No summary available.</p>;

  return (
    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
      <MetricTile label="Registered sources" value={s.sources?.registered ?? 0} />
      <MetricTile label="Active sources" value={s.sources?.active ?? 0} />
      <MetricTile label="Acquisition runs" value={s.runs?.total ?? 0} />
      <MetricTile label="Items discovered" value={s.items?.discovered ?? 0} />
      <MetricTile label="Items processed" value={s.items?.processed ?? 0} />
      <MetricTile
        label="Failed processing runs"
        value={s.processing?.failed ?? 0}
      />
      <MetricTile
        label="Avg confidence"
        value={`${s.processing?.averageConfidence ?? 0}%`}
      />
      <MetricTile label="Canonical records" value={s.canonicalRecords?.total ?? 0} />
      <MetricTile label="Output runs (total)" value={s.outputs?.total ?? 0} />
      <MetricTile
        label="Worker health"
        value={
          <Badge variant={s.worker?.healthy ? "default" : "destructive"}>
            {s.worker?.healthy ? "healthy" : "degraded"}
          </Badge> as unknown as string
        }
        hint={s.worker?.url}
      />
      <MetricTile label="Governance denials" value={s.governance?.denials ?? 0} />
    </div>
  );
}
