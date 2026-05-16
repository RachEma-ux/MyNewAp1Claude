/**
 * Graph Quality findings panel — T-F.82 (T-F.4-α).
 *
 * First operator UI for the graph-quality findings stack. Consumes
 * the existing `agentStudio.graphQuality.getStats` tRPC procedure
 * (server-side ladder shipped earlier) — no new server work needed
 * for this α slice.
 *
 * Renders three Cards in sequence:
 *   1. **Totals** — findings / scans / agent runs counts.
 *   2. **Findings by status** — bucketed counts (open, resolved,
 *      dismissed, applied — server's emitted buckets).
 *   3. **Findings by severity** — bucketed counts (critical, major,
 *      minor — server's emitted buckets).
 *
 * Why α-shell now: the `getStats` server procedure has no client
 * consumer despite shipping months ago — this slice closes that gap
 * with a single-fetch dashboard. Follow-up slices can add the
 * findings list / approve+apply / dismiss affordances (existing
 * `convertFindingToProposal`, `dismissFinding`, `bulkDismissFindings`
 * tRPC procedures are already in place).
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";

import { SectionLabel } from "./ui";

interface Bucket {
  readonly value: string;
  readonly count: number;
}

function renderBucketList(buckets: ReadonlyArray<Bucket>, emptyHint: string) {
  if (buckets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">{emptyHint}</p>
    );
  }
  return (
    <ul className="space-y-1 text-sm" data-testid="graph-quality-bucket-list">
      {buckets.map((b) => (
        <li
          key={b.value}
          className="flex items-baseline justify-between"
          data-testid={`graph-quality-bucket-${b.value}`}
        >
          <span className="font-mono text-muted-foreground">{b.value}</span>
          <span className="font-medium">{b.count.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

export function GraphQualityFindingsPanel() {
  const statsQ = trpc.agentStudio.graphQuality.getStats.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  if (statsQ.isLoading) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (statsQ.error) {
    return (
      <p
        className="text-sm text-destructive"
        data-testid="graph-quality-findings-error"
      >
        Failed to load: {statsQ.error.message}
      </p>
    );
  }
  if (!statsQ.data) return null;

  const { totals, findingsByStatus, findingsBySeverity } = statsQ.data;

  return (
    <div className="space-y-4" data-testid="graph-quality-findings-panel">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Totals</SectionLabel>
          <div
            className="grid grid-cols-3 gap-3 text-sm"
            data-testid="graph-quality-totals"
          >
            <div>
              <p className="text-xs text-muted-foreground">findings</p>
              <p
                className="text-lg font-medium"
                data-testid="graph-quality-totals-findings"
              >
                {totals.findings.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">scans</p>
              <p
                className="text-lg font-medium"
                data-testid="graph-quality-totals-scans"
              >
                {totals.scans.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">agent runs</p>
              <p
                className="text-lg font-medium"
                data-testid="graph-quality-totals-agent-runs"
              >
                {totals.agentRuns.toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Findings by status</SectionLabel>
          {renderBucketList(
            findingsByStatus,
            "No findings yet — scans haven't produced any quality alerts.",
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Findings by severity</SectionLabel>
          {renderBucketList(
            findingsBySeverity,
            "No findings yet — scans haven't produced any quality alerts.",
          )}
        </CardContent>
      </Card>
    </div>
  );
}
