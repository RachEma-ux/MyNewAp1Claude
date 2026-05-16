/**
 * Graph Health admin panel — PR-V1-190 + T-I.55 + T-I.56.
 *
 * Operator surface for the graph-health alert cron (J-1-β, #758).
 * The graphHealth router (`getAlertCronStatus` + `listOpen`) has
 * existed since J-1-β with no UI consumer; PR-V1-190 closed that
 * gap end-to-end, mirroring the ApprovalBusAdminPanel (#935) /
 * PublishTargetsAdminPanel (#937) shape.
 *
 * T-I.55 added a Run-now button for the projection-staleness cron
 * (admin tRPC `agentStudio.graphProjection.runStalenessCheck`).
 *
 * T-I.56 added a per-row "Resolve" button on the open-alerts table
 * (admin tRPC `agentStudio.graphHealth.resolveAlert`). Distinct from
 * the auto-resolution path in `persistHealthAlertDecisions` (which
 * resolves alerts when the next scan no longer observes the breach
 * key); the operator path dismisses a specific alert id without
 * waiting for the next scan.
 */

import { useState } from "react";
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
  const utils = trpc.useUtils();
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
  // T-I.50 (#1226): projection staleness cron status. Shipped end-to-
  // end via the 5-PR sub-arc (#1218-#1222) + boot wiring (#1224); this
  // panel surface lets operators see staleness counts in the same
  // location as drift and alert crons.
  const stalenessCronQ =
    trpc.agentStudio.graphProjection.getStalenessCronStatus.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });

  // T-I.55: operator-triggered ad-hoc staleness check. Mirrors the
  // `forceRewarm` pattern on RegionAdminPanel — button + mutation +
  // invalidation + feedback line. Useful for triaging a suspected
  // stuck projection without waiting for the daily 04:15 UTC cron.
  const [stalenessRunFeedback, setStalenessRunFeedback] = useState<
    string | null
  >(null);
  const runStalenessCheckMutation =
    trpc.agentStudio.graphProjection.runStalenessCheck.useMutation({
      onSuccess: (data) => {
        setStalenessRunFeedback(
          `Scan complete: ${data.distinctProjectionCount} projections / ${data.staleCount} stale / ${data.neverSucceededCount} never-succeeded / ${data.freshCount} fresh.`,
        );
        void utils.agentStudio.graphProjection.getStalenessCronStatus.invalidate();
      },
      onError: (err) =>
        setStalenessRunFeedback(`Staleness scan failed: ${err.message}`),
    });

  // T-I.56: operator-triggered single-alert resolution. Distinct from
  // the auto-resolution path in `persistHealthAlertDecisions` (which
  // resolves alerts when the next scan no longer observes the breach
  // key); this lets operators dismiss a specific alert id without
  // waiting for the next scan. Tracks the in-flight alert id so the
  // per-row button can flip between idle and pending without blocking
  // sibling rows.
  const [resolvingAlertId, setResolvingAlertId] = useState<number | null>(
    null,
  );
  const [resolveAlertFeedback, setResolveAlertFeedback] = useState<
    string | null
  >(null);
  const resolveAlertMutation =
    trpc.agentStudio.graphHealth.resolveAlert.useMutation({
      onSuccess: (data, vars) => {
        setResolveAlertFeedback(
          data.resolved
            ? `Resolved alert #${vars.alertId}.`
            : `Alert #${vars.alertId} was already resolved or not found.`,
        );
        setResolvingAlertId(null);
        void utils.agentStudio.graphHealth.listOpen.invalidate();
      },
      onError: (err) => {
        setResolveAlertFeedback(`Resolve failed: ${err.message}`);
        setResolvingAlertId(null);
      },
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
          <SectionLabel>Projection staleness cron status</SectionLabel>
          {stalenessCronQ.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading staleness cron status…
            </p>
          ) : stalenessCronQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load staleness cron: {stalenessCronQ.error.message}
            </p>
          ) : stalenessCronQ.data == null ? (
            <p className="text-sm text-muted-foreground">
              No staleness cron status.
            </p>
          ) : (
            <div
              className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm"
              data-testid="graph-projection-staleness-cron-grid"
            >
              <div>
                <span className="font-medium">lastRunAt:</span>{" "}
                <span className="font-mono">
                  {fmtTs(stalenessCronQ.data.lastRunAt)}
                </span>
              </div>
              <div>
                <span className="font-medium">lastError:</span>{" "}
                <span
                  className={`font-mono ${stalenessCronQ.data.lastError ? "text-destructive" : ""}`}
                >
                  {stalenessCronQ.data.lastError?.message ?? "—"}
                </span>
              </div>
              {stalenessCronQ.data.lastResult ? (
                <>
                  <div>
                    <span className="font-medium">
                      distinctProjectionCount:
                    </span>{" "}
                    <span className="font-mono">
                      {stalenessCronQ.data.lastResult.distinctProjectionCount}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">staleCount:</span>{" "}
                    <span
                      className={`font-mono ${stalenessCronQ.data.lastResult.staleCount > 0 ? "text-destructive" : ""}`}
                    >
                      {stalenessCronQ.data.lastResult.staleCount}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">
                      neverSucceededCount:
                    </span>{" "}
                    <span
                      className={`font-mono ${stalenessCronQ.data.lastResult.neverSucceededCount > 0 ? "text-destructive" : ""}`}
                    >
                      {stalenessCronQ.data.lastResult.neverSucceededCount}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">freshCount:</span>{" "}
                    <span className="font-mono">
                      {stalenessCronQ.data.lastResult.freshCount}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">scannedAt:</span>{" "}
                    <span className="font-mono">
                      {stalenessCronQ.data.lastResult.scannedAt}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          )}
          <div className="flex items-center gap-2 pt-2 border-t">
            <button
              type="button"
              className="text-sm underline"
              disabled={runStalenessCheckMutation.isPending}
              onClick={() => runStalenessCheckMutation.mutate({})}
              data-testid="graph-projection-staleness-run-now-button"
            >
              {runStalenessCheckMutation.isPending
                ? "Scanning…"
                : "Run staleness check now"}
            </button>
            {stalenessRunFeedback ? (
              <span
                className="text-xs text-muted-foreground"
                data-testid="graph-projection-staleness-run-now-feedback"
              >
                {stalenessRunFeedback}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Open alerts</SectionLabel>
          {/* PR-V1-226: oldest open alert summary using the fmtAge
              helper added in #976. Surfaces "how stale is the
              longest-open alert?" — a 7-day-old warning is a
              languishing-signal independent of severity. Render
              gated on openQ.data.length > 0 so a quiet workspace
              doesn't show a stale "—" line. */}
          {openQ.data && openQ.data.length > 0 ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="graph-health-oldest-alert-summary"
            >
              {(() => {
                let oldest = openQ.data[0];
                for (const a of openQ.data) {
                  const aMs = new Date(a.raisedAt).getTime();
                  const oldestMs = new Date(oldest.raisedAt).getTime();
                  if (
                    Number.isFinite(aMs) &&
                    Number.isFinite(oldestMs) &&
                    aMs < oldestMs
                  ) {
                    oldest = a;
                  }
                }
                return (
                  <>
                    <span className="font-medium">Oldest open:</span>{" "}
                    <span className="font-mono">{oldest.alertKey}</span>{" "}
                    (<span
                      className={severityClass(oldest.severity)}
                    >
                      {oldest.severity}
                    </span>
                    ){" "}
                    — raised{" "}
                    <span className="font-mono">{fmtAge(oldest.raisedAt)}</span>{" "}
                    ago
                  </>
                );
              })()}
            </p>
          ) : null}
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
                    <th className="py-1 pr-3">Action</th>
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
                      <td className="py-1 pr-3 text-xs">
                        <button
                          type="button"
                          className="text-xs underline"
                          disabled={resolvingAlertId === a.id}
                          onClick={() => {
                            setResolvingAlertId(a.id);
                            resolveAlertMutation.mutate({ alertId: a.id });
                          }}
                          data-testid={`graph-health-alert-resolve-button-${a.id}`}
                        >
                          {resolvingAlertId === a.id ? "Resolving…" : "Resolve"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {resolveAlertFeedback ? (
                <p
                  className="mt-2 text-xs text-muted-foreground"
                  data-testid="graph-health-alert-resolve-feedback"
                >
                  {resolveAlertFeedback}
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
