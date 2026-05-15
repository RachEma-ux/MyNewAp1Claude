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

/**
 * PR-V1-225: render alert age as a coarse-grained operator-friendly
 * duration. "<1m" / "Xm" / "Xh Ym" / "Xd Yh". `now` is parameterized
 * so tests don't depend on Date.now().
 */
function fmtAge(
  raisedAt: Date | string | null | undefined,
  now: number = Date.now(),
): string {
  if (!raisedAt) return "—";
  const d = typeof raisedAt === "string" ? new Date(raisedAt) : raisedAt;
  if (Number.isNaN(d.getTime())) return "—";
  const ms = now - d.getTime();
  if (ms < 0) return "—";
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "<1m";
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return `${hours}h ${minutes}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
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
              {/* PR-V1-201: surface the previously-unrendered drift
                  result aggregates. driftCount + permissionLeakCount
                  get destructive highlight when > 0 since they
                  represent integrity violations the operator should
                  notice. */}
              {driftCronQ.data.lastResult ? (
                <>
                  <div>
                    <span className="font-medium">totalScanned:</span>{" "}
                    <span className="font-mono">
                      {driftCronQ.data.lastResult.totalScanned}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">driftCount:</span>{" "}
                    <span
                      className={`font-mono ${driftCronQ.data.lastResult.driftCount > 0 ? "text-destructive" : ""}`}
                    >
                      {driftCronQ.data.lastResult.driftCount}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">
                      permissionLeakCount:
                    </span>{" "}
                    <span
                      className={`font-mono ${driftCronQ.data.lastResult.permissionLeakCount > 0 ? "text-destructive" : ""}`}
                    >
                      {driftCronQ.data.lastResult.permissionLeakCount}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">persistedEvents:</span>{" "}
                    <span className="font-mono">
                      {driftCronQ.data.lastResult.persistedEvents}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">scope:</span>{" "}
                    <span className="font-mono">
                      {driftCronQ.data.lastResult.scope}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">scannedAt:</span>{" "}
                    <span className="font-mono">
                      {driftCronQ.data.lastResult.scannedAt}
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
          <SectionLabel>Open alerts</SectionLabel>
          {/* PR-V1-208: open-alerts severity breakdown line above
              the table — same pattern as the publish + extensions
              aggregates (#957/#958). critical > 0 → text-destructive,
              warning > 0 → amber, info → muted. */}
          {openQ.data && openQ.data.length > 0 ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="graph-health-alerts-aggregate-summary"
            >
              {(() => {
                let critical = 0;
                let warning = 0;
                let info = 0;
                for (const a of openQ.data) {
                  if (a.severity === "critical") critical += 1;
                  else if (a.severity === "warning") warning += 1;
                  else if (a.severity === "info") info += 1;
                }
                return (
                  <>
                    <span className="font-medium">Open alerts:</span>{" "}
                    <span className="font-mono">{openQ.data.length}</span>{" "}
                    total —{" "}
                    <span
                      className={critical > 0 ? "text-destructive" : ""}
                    >
                      <span className="font-mono">{critical}</span> critical
                    </span>
                    {" / "}
                    <span
                      className={
                        warning > 0 ? "text-amber-600 dark:text-amber-400" : ""
                      }
                    >
                      <span className="font-mono">{warning}</span> warning
                    </span>
                    {" / "}
                    <span className="font-mono">{info}</span> info
                  </>
                );
              })()}
            </p>
          ) : null}
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
                    <th
                      className="py-1 pr-3"
                      title="Time since raisedAt — coarse-grained (m/h/d). Languishing-alert signal."
                    >
                      Age
                    </th>
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
                      <td
                        className="py-1 pr-3 font-mono text-xs whitespace-nowrap"
                        data-testid={`graph-health-alert-age-${a.id}`}
                      >
                        {fmtAge(a.raisedAt)}
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
