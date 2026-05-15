/**
 * Graph Health admin panel — PR-V1-190.
 *
 * Operator surface for the graph-health alert cron (J-1-β, #758).
 * The graphHealth router (`getAlertCronStatus` + `listOpen`) has
 * existed since J-1-β with no UI consumer; this slice closes that
 * gap end-to-end, mirroring the ApprovalBusAdminPanel (#935) /
 * PublishTargetsAdminPanel (#937) shape.
 *
 * Read-only. Resolving alerts is operator-supplied via the existing
 * `health-alert.ts:resolveHealthAlert` server-side helper; surface
 * comes later.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";

import { SectionLabel } from "./ui";

function fmtTs(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").replace(/\..+$/, "Z");
}

function severityClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "text-destructive";
    case "warning":
      return "text-amber-600 dark:text-amber-400";
    case "info":
      return "text-muted-foreground";
    default:
      return "";
  }
}

export function GraphHealthAdminPanel() {
  const cronQ = trpc.agentStudio.graphHealth.getAlertCronStatus.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );
  const openQ = trpc.agentStudio.graphHealth.listOpen.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  // PR-V1-191: pair the alert cron with the projection drift cron
  // since operators check both at the same time. Same `{ lastRunAt,
  // lastResult, lastError }` shape; rendered with the same card.
  const driftCronQ =
    trpc.agentStudio.graphProjection.getDriftCronStatus.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Alert cron status</SectionLabel>
          {cronQ.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading cron status…
            </p>
          ) : cronQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load cron status: {cronQ.error.message}
            </p>
          ) : cronQ.data == null ? (
            <p className="text-sm text-muted-foreground">No cron status.</p>
          ) : (
            <div
              className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm"
              data-testid="graph-health-cron-grid"
            >
              <div>
                <span className="font-medium">lastRunAt:</span>{" "}
                <span className="font-mono">
                  {fmtTs(cronQ.data.lastRunAt)}
                </span>
              </div>
              <div>
                <span className="font-medium">lastError:</span>{" "}
                <span
                  className={`font-mono ${cronQ.data.lastError ? "text-destructive" : ""}`}
                >
                  {cronQ.data.lastError?.message ?? "—"}
                </span>
              </div>
              {cronQ.data.lastResult ? (
                <>
                  {/* PR-V1-200: corrected field name (was `scanned`,
                      actual server-side field is `decisionCount`).
                      Plus added scope + scannedAt + status +
                      latencyMs which were available but unrendered. */}
                  <div>
                    <span className="font-medium">decisionCount:</span>{" "}
                    <span className="font-mono">
                      {cronQ.data.lastResult.decisionCount}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">raised:</span>{" "}
                    <span className="font-mono">
                      {cronQ.data.lastResult.raised}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">resolved:</span>{" "}
                    <span className="font-mono">
                      {cronQ.data.lastResult.resolved}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">scope:</span>{" "}
                    <span className="font-mono">
                      {cronQ.data.lastResult.scope}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">status:</span>{" "}
                    <span className="font-mono">
                      {cronQ.data.lastResult.status}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">latencyMs:</span>{" "}
                    <span className="font-mono">
                      {cronQ.data.lastResult.latencyMs ?? "—"}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">scannedAt:</span>{" "}
                    <span className="font-mono">
                      {cronQ.data.lastResult.scannedAt}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Projection drift cron status</SectionLabel>
          {driftCronQ.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading drift cron status…
            </p>
          ) : driftCronQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load drift cron: {driftCronQ.error.message}
            </p>
          ) : driftCronQ.data == null ? (
            <p className="text-sm text-muted-foreground">
              No drift cron status.
            </p>
          ) : (
            <div
              className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm"
              data-testid="graph-projection-drift-cron-grid"
            >
              <div>
                <span className="font-medium">lastRunAt:</span>{" "}
                <span className="font-mono">
                  {fmtTs(driftCronQ.data.lastRunAt)}
                </span>
              </div>
              <div>
                <span className="font-medium">lastError:</span>{" "}
                <span
                  className={`font-mono ${driftCronQ.data.lastError ? "text-destructive" : ""}`}
                >
                  {driftCronQ.data.lastError?.message ?? "—"}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Open alerts</SectionLabel>
          {openQ.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading open alerts…
            </p>
          ) : openQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load open alerts: {openQ.error.message}
            </p>
          ) : !openQ.data || openQ.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open alerts.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm border-collapse"
                data-testid="graph-health-open-alerts-table"
              >
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3">Raised</th>
                    <th className="py-1 pr-3">Key</th>
                    <th className="py-1 pr-3">Severity</th>
                    <th className="py-1 pr-3">Observed</th>
                    <th className="py-1 pr-3">Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {openQ.data.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="py-1 pr-3 font-mono text-xs whitespace-nowrap">
                        {fmtTs(a.raisedAt)}
                      </td>
                      <td className="py-1 pr-3 font-mono text-xs">
                        {a.alertKey}
                      </td>
                      <td
                        className={`py-1 pr-3 font-mono text-xs ${severityClass(a.severity)}`}
                      >
                        {a.severity}
                      </td>
                      <td className="py-1 pr-3 font-mono text-xs truncate max-w-[30ch]">
                        {JSON.stringify(a.observedValue)}
                      </td>
                      <td className="py-1 pr-3 font-mono text-xs truncate max-w-[30ch]">
                        {JSON.stringify(a.threshold)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
