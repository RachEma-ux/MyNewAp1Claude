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

import { useState } from "react";

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";

import { SectionLabel } from "./ui";

/**
 * T-F.84 (T-F.4-γ): server-side drill-in filters on the findings
 * list. Mirrors the lens-browser T-F.72/T-F.73 visibility/typeKey
 * filter shape but server-side because the `listFindings` LIMIT cap
 * would silently filter to zero rows under client-side narrowing
 * once the dataset grows past 50.
 */
const SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const;
const STATUS_VALUES = ["open", "triaged", "applied", "dismissed"] as const;
type SeverityFilter = (typeof SEVERITY_VALUES)[number] | null;
type StatusFilter = (typeof STATUS_VALUES)[number] | null;

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

const FINDINGS_LIST_LIMIT = 50;

export function GraphQualityFindingsPanel() {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const hasAnyFilter = severityFilter !== null || statusFilter !== null;
  function clearAllFilters() {
    setSeverityFilter(null);
    setStatusFilter(null);
  }

  const statsQ = trpc.agentStudio.graphQuality.getStats.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const findingsQ = trpc.agentStudio.graphQuality.listFindings.useQuery(
    {
      limit: FINDINGS_LIST_LIMIT,
      ...(severityFilter ? { severity: severityFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    { refetchOnWindowFocus: false },
  );

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

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>
            Recent findings
            {findingsQ.data
              ? findingsQ.data.length === FINDINGS_LIST_LIMIT
                ? hasAnyFilter
                  ? ` (first ${FINDINGS_LIST_LIMIT} matching filters, newest first)`
                  : ` (first ${FINDINGS_LIST_LIMIT}, newest first)`
                : hasAnyFilter
                  ? ` (${findingsQ.data.length} matching filters, newest first)`
                  : ` (${findingsQ.data.length}, newest first)`
              : ""}
          </SectionLabel>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div
              className="flex items-center gap-2"
              data-testid="graph-quality-severity-filter-group"
            >
              <span className="text-muted-foreground">severity:</span>
              {(["all", ...SEVERITY_VALUES] as const).map((mode) => {
                const isActive =
                  mode === "all" ? severityFilter === null : severityFilter === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    data-testid={`graph-quality-severity-filter-${mode}`}
                    onClick={() =>
                      setSeverityFilter(mode === "all" ? null : mode)
                    }
                    className={`rounded px-2 py-0.5 font-mono ${
                      isActive
                        ? "bg-muted/50 text-foreground"
                        : "text-muted-foreground hover:bg-muted/30"
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
            <div
              className="flex items-center gap-2"
              data-testid="graph-quality-status-filter-group"
            >
              <span className="text-muted-foreground">status:</span>
              {(["all", ...STATUS_VALUES] as const).map((mode) => {
                const isActive =
                  mode === "all" ? statusFilter === null : statusFilter === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    data-testid={`graph-quality-status-filter-${mode}`}
                    onClick={() =>
                      setStatusFilter(mode === "all" ? null : mode)
                    }
                    className={`rounded px-2 py-0.5 font-mono ${
                      isActive
                        ? "bg-muted/50 text-foreground"
                        : "text-muted-foreground hover:bg-muted/30"
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
            {hasAnyFilter ? (
              <button
                type="button"
                className="ml-auto underline text-muted-foreground"
                data-testid="graph-quality-clear-all-filters"
                onClick={clearAllFilters}
              >
                Clear all filters
              </button>
            ) : null}
          </div>
          {findingsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading findings…</p>
          ) : findingsQ.error ? (
            <p
              className="text-sm text-destructive"
              data-testid="graph-quality-findings-list-error"
            >
              Failed to load findings: {findingsQ.error.message}
            </p>
          ) : !findingsQ.data || findingsQ.data.length === 0 ? (
            <p
              className="text-sm text-muted-foreground italic"
              data-testid="graph-quality-findings-list-empty"
            >
              {hasAnyFilter ? (
                <>
                  No findings match the active filters.{" "}
                  <button
                    type="button"
                    className="underline not-italic"
                    data-testid="graph-quality-empty-state-clear-all"
                    onClick={clearAllFilters}
                  >
                    Clear all filters
                  </button>
                </>
              ) : (
                <>No findings yet — scans haven&apos;t produced any quality alerts.</>
              )}
            </p>
          ) : (
            <table
              className="w-full text-xs"
              data-testid="graph-quality-findings-list"
            >
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">id</th>
                  <th className="py-1">class</th>
                  <th className="py-1">severity</th>
                  <th className="py-1">status</th>
                  <th className="py-1">source</th>
                </tr>
              </thead>
              <tbody>
                {findingsQ.data.map((f) => (
                  <tr
                    key={f.id}
                    className="border-t border-border"
                    data-testid={`graph-quality-finding-row-${f.id}`}
                  >
                    <td className="py-1 font-mono">{f.id}</td>
                    <td className="py-1 font-mono">{f.findingClass}</td>
                    <td className="py-1 font-mono">{f.severity}</td>
                    <td className="py-1 font-mono">{f.status}</td>
                    <td className="py-1 font-mono text-muted-foreground">
                      {f.sourceTypeKey ?? "—"}
                      {f.sourceId ? `: ${f.sourceId}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
