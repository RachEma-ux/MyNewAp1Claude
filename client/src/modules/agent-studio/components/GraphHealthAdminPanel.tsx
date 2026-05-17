/**
 * Graph Health admin panel — PR-V1-190 + T-I.55 + T-I.56 + T-I.57.
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
 *
 * T-I.57 added a Run-now button for the health-alert scan itself
 * (admin tRPC `agentStudio.graphHealth.runAlertScan`). Mirrors
 * T-I.55's shape — runs the same `runHealthAlertScan` the cron
 * wrapper invokes, useful for confirming threshold changes or
 * triaging backend issues without waiting for the 5-min cron tick.
 *
 * T-I.58 added a Run-now button for the projection-drift scan
 * (admin tRPC `agentStudio.graphProjection.runDriftScan`). The
 * inline `runSweep` body was factored into a standalone
 * `runProjectionDriftScan()` so the operator path bypasses the cron-
 * expression + minute-dedupe gate that `tickProjectionDriftCron`
 * enforces. Useful for confirming a Neo4j re-projection after
 * promotion / post-migration smoke-tests without waiting for the
 * 04:30 UTC daily cron tick.
 *
 * T-I.60 added a "Recent failure-state events" Card — first UI
 * consumer of T-I.59's `listRecentFailureStateEvents` admin tRPC.
 * Renders the summary rollup + per-kind breakdown over the closed-
 * taxonomy event stream. Placement here is intentional: closed-
 * taxonomy events skew graph-health adjacent (#4, #5, #7, #8, #9,
 * #10, #12, plus retrieval/agent kinds).
 *
 * T-I.61 extended the T-I.60 card with a per-source-kind breakdown
 * table aggregated client-side from `rows` (no server change).
 * Answers "which emitter is loudest right now" alongside the
 * "which kind is most common" question the by-kind table answers.
 *
 * T-I.62 added a "Latest rows" table to the T-I.60 card rendering
 * the most-recent 15 rows of the 50-row sample from T-I.59. The
 * `failure_state:` prefix is stripped from the errorClass for
 * readability so operators see the closed kind directly. Closes
 * the gap that left the raw rows unrendered after T-I.60 + T-I.61
 * surfaced summary + drilldowns but not the individual events.
 *
 * T-I.64 added a kind-filter <select> consumer of T-I.63's
 * optional `kind` narrower on `listRecentFailureStateEvents`.
 * Lets operators investigating a quieter kind escape the 50-row
 * buffer being dominated by a louder neighbor (the canonical
 * incident pattern is `graph_query_timeout` flooding while a
 * smaller kind like `text2cypher_rejected` triages in parallel).
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";

import { SectionLabel } from "./ui";

/**
 * Closed-taxonomy kinds, mirrored from
 * `server/agent-studio/services/failure-states/contracts.ts`
 * `FAILURE_STATES`. Inlined here to avoid a server-import boundary
 * crossing for the kind-filter dropdown options. Drift would be
 * caught by the server's `z.enum(FAILURE_STATES)` validator on
 * `listRecentFailureStateEvents` — sending an unknown kind would
 * 400, surfacing the drift loudly rather than silently filtering
 * to zero rows.
 *
 * T-I.64.
 */
const FAILURE_STATE_KIND_OPTIONS = [
  "promotion_failed",
  "note_conflict",
  "entity_resolution_conflict",
  "neo4j_unavailable",
  "neo4j_degraded",
  "neo4j_query_timeout",
  "neo4j_projection_stale",
  "neo4j_projection_drift_detected",
  "projection_sync_failed",
  "graph_query_timeout",
  "backlink_refresh_failed",
  "runtime_reference_hidden_by_permission",
  "cag_reference_invalidated",
  "graph_skill_reference_invalidated",
  "tool_schema_changed",
  "search_index_stale",
  "query_cache_stale",
  "text2cypher_rejected",
  "cypher_query_template_failed",
  "retrieval_safety_filter_blocked_content",
  "graph_agent_answer_incomplete",
  "golden_question_failed",
  "graph_correction_rejected",
  "semantic_enrichment_rejected",
  "background_job_failed",
] as const;

/**
 * T-F.133 — per-kind severity mirror, sourced from
 * `server/agent-studio/services/failure-states/contracts.ts`
 * `FAILURE_STATE_METADATA[kind].defaultSeverity`. Inlined here for
 * the same boundary-crossing reason as `FAILURE_STATE_KIND_OPTIONS`
 * (T-I.64) — the events list needs at-a-glance severity coloring
 * without booting a server-side metadata fetch.
 *
 * Drift is loudly detectable: if the server adds a new
 * FAILURE_STATE that's missing from this map, the lookup returns
 * `undefined` and the row falls through to the neutral tone — the
 * panel still renders, but the operator sees an uncolored row that
 * signals "new kind, mirror needs updating." Same lesson-45
 * future-extensibility shape T-F.131 / T-F.132 used.
 *
 * The 25 entries match the 25 kinds in FAILURE_STATES verbatim.
 * Source-scan test locks the row count + spot-checks 3 mappings
 * across the 3 severity tiers.
 */
const FAILURE_STATE_SEVERITY: Readonly<
  Record<string, "info" | "warning" | "critical">
> = {
  promotion_failed: "critical",
  note_conflict: "warning",
  entity_resolution_conflict: "warning",
  neo4j_unavailable: "critical",
  neo4j_degraded: "warning",
  neo4j_query_timeout: "warning",
  neo4j_projection_stale: "info",
  neo4j_projection_drift_detected: "warning",
  projection_sync_failed: "critical",
  graph_query_timeout: "warning",
  backlink_refresh_failed: "info",
  runtime_reference_hidden_by_permission: "info",
  cag_reference_invalidated: "warning",
  graph_skill_reference_invalidated: "warning",
  tool_schema_changed: "warning",
  search_index_stale: "info",
  query_cache_stale: "info",
  text2cypher_rejected: "info",
  cypher_query_template_failed: "warning",
  retrieval_safety_filter_blocked_content: "info",
  graph_agent_answer_incomplete: "warning",
  golden_question_failed: "warning",
  graph_correction_rejected: "info",
  semantic_enrichment_rejected: "info",
  background_job_failed: "warning",
};

function failureStateKindClass(kind: string): string {
  const sev = FAILURE_STATE_SEVERITY[kind];
  if (sev === "critical") return "text-destructive";
  if (sev === "warning") return "text-amber-600 dark:text-amber-400";
  if (sev === "info") return "text-muted-foreground";
  return "";
}

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

  // T-I.60 — first UI consumer of T-I.59's `listRecentFailureStateEvents`.
  // Closed-taxonomy events skew graph-health adjacent (kinds
  // #4 neo4j_unavailable, #5 neo4j_degraded, #7 projection_stale,
  // #8 drift_detected, #9 projection_sync_failed, #10 query_timeout,
  // #12 reference_hidden, plus retrieval/agent kinds), so this panel
  // is the natural placement. Default limit 50 (smaller than the
  // tRPC's 200 default — keeps the inline table sized for an
  // overview without separate pagination).
  //
  // T-I.64 — `kindFilter === null` requests the full 25-kind stream
  // (default behavior). When the operator picks a specific kind,
  // we pass `kind: [kindFilter]` so the server pre-filters the
  // errorClass IN list, dedicating the 50-row buffer to that kind.
  //
  // T-I.66 — `sourceKindFilter` mirrors the same shape on the
  // sourceKind axis. Open-ended (no fixed enum) so the UI affords
  // selection via clicks on the by-source-kind rollup table rather
  // than a dropdown. Both filters compose — operator can ask "show
  // me all `text2cypher_rejected` from `rac-retrieval-executor`".
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [sourceKindFilter, setSourceKindFilter] = useState<string | null>(
    null,
  );
  // T-I.67 — time-window filter. `null` = no `createdSince` (full
  // buffer = whatever the server's 50-row tail yields). Specific
  // window = milliseconds before "now" at render time, computed in
  // the useQuery arg so it picks up the current time on each
  // refetch (not frozen at component-mount).
  const [createdSinceWindowMs, setCreatedSinceWindowMs] = useState<
    number | null
  >(null);
  const failureStateEventsQ =
    trpc.agentStudio.workspaceObservability.listRecentFailureStateEvents.useQuery(
      {
        limit: 50,
        kind: kindFilter !== null ? [kindFilter as never] : undefined,
        sourceKind: sourceKindFilter ?? undefined,
        createdSince:
          createdSinceWindowMs !== null
            ? new Date(Date.now() - createdSinceWindowMs)
            : undefined,
      },
      { refetchOnWindowFocus: false },
    );

  // T-I.57: operator-triggered ad-hoc health alert scan. Mirrors
  // the T-I.55 staleness Run-now button shape. Useful for confirming
  // a freshly-deployed threshold change or triaging a suspected
  // backend issue without waiting for the next 5-minute cron tick.
  const [alertScanFeedback, setAlertScanFeedback] = useState<string | null>(
    null,
  );
  const runAlertScanMutation =
    trpc.agentStudio.graphHealth.runAlertScan.useMutation({
      onSuccess: (data) => {
        setAlertScanFeedback(
          `Scan complete: status=${data.status}, decisions=${data.decisions.length}, raised=${data.persisted.raised}, resolved=${data.persisted.resolved}.`,
        );
        void utils.agentStudio.graphHealth.getAlertCronStatus.invalidate();
        void utils.agentStudio.graphHealth.listOpen.invalidate();
      },
      onError: (err) =>
        setAlertScanFeedback(`Alert scan failed: ${err.message}`),
    });

  // T-I.58: operator-triggered ad-hoc projection-drift scan. Mirrors
  // T-I.55 (staleness) + T-I.57 (alert) Run-now shapes. Useful for
  // confirming a Neo4j re-projection after promotion / post-migration
  // smoke-tests without waiting for the 04:30 UTC daily cron tick.
  const [driftScanFeedback, setDriftScanFeedback] = useState<string | null>(
    null,
  );
  const runDriftScanMutation =
    trpc.agentStudio.graphProjection.runDriftScan.useMutation({
      onSuccess: (data) => {
        setDriftScanFeedback(
          `Scan complete: ${data.totalScanned} scanned / ${data.driftCount} drifts / ${data.permissionLeakCount} permission-leaks / ${data.persistedEvents} persisted.`,
        );
        void utils.agentStudio.graphProjection.getDriftCronStatus.invalidate();
      },
      onError: (err) =>
        setDriftScanFeedback(`Drift scan failed: ${err.message}`),
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
          <div className="flex items-center gap-2 pt-2 border-t">
            <button
              type="button"
              className="text-sm underline"
              disabled={runAlertScanMutation.isPending}
              onClick={() => runAlertScanMutation.mutate()}
              data-testid="graph-health-alert-scan-run-now-button"
            >
              {runAlertScanMutation.isPending ? "Scanning…" : "Run alert scan now"}
            </button>
            {alertScanFeedback ? (
              <span
                className="text-xs text-muted-foreground"
                data-testid="graph-health-alert-scan-run-now-feedback"
              >
                {alertScanFeedback}
              </span>
            ) : null}
          </div>
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
          <div className="flex items-center gap-2 pt-2 border-t">
            <button
              type="button"
              className="text-sm underline"
              disabled={runDriftScanMutation.isPending}
              onClick={() => runDriftScanMutation.mutate()}
              data-testid="graph-projection-drift-scan-run-now-button"
            >
              {runDriftScanMutation.isPending ? "Scanning…" : "Run drift scan now"}
            </button>
            {driftScanFeedback ? (
              <span
                className="text-xs text-muted-foreground"
                data-testid="graph-projection-drift-scan-run-now-feedback"
              >
                {driftScanFeedback}
              </span>
            ) : null}
          </div>
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

      {/* T-I.60: Recent closed-taxonomy failure-state events. Reads
          via T-I.59's `listRecentFailureStateEvents` admin tRPC;
          renders summary header (total / closed-taxonomy /
          free-form / distinct sources) + the per-kind breakdown
          from `occurrenceSummary.byKind` + the most-recent rows. */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Recent failure-state events</SectionLabel>
          {/* T-I.64: kind-filter dropdown. Sits outside the
              data-conditional rendering so the operator can change
              filter during loading without losing the control.
              Selecting "All kinds" sends `kind: undefined` (full
              25-kind stream); any specific selection narrows to
              that kind's IN list. */}
          <div className="flex items-center gap-2 text-xs">
            <label
              htmlFor="graph-health-failure-state-events-kind-filter"
              className="text-muted-foreground"
            >
              Filter by kind:
            </label>
            <select
              id="graph-health-failure-state-events-kind-filter"
              data-testid="graph-health-failure-state-events-kind-filter"
              className="rounded border bg-background px-2 py-1 font-mono text-xs"
              value={kindFilter ?? ""}
              onChange={(e) =>
                setKindFilter(e.target.value === "" ? null : e.target.value)
              }
            >
              <option value="">All kinds</option>
              {FAILURE_STATE_KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            {kindFilter !== null ? (
              <button
                type="button"
                onClick={() => setKindFilter(null)}
                className="text-xs text-muted-foreground underline"
                data-testid="graph-health-failure-state-events-kind-filter-clear"
              >
                Clear
              </button>
            ) : null}
          </div>
          {/* T-I.67: time-window filter. Operator-friendly preset
              buttons (1h / 24h / 7d) that drive `createdSince` on
              the useQuery. "All time" clears back to no
              `createdSince`. Time-window is the third axis in the
              events-card drill-in (after kind + sourceKind);
              naturally bounded by the server's existing
              `createdSince` filter on `listErrorEvents`. */}
          <div
            className="flex items-center gap-2 text-xs"
            data-testid="graph-health-failure-state-events-time-window-filter"
          >
            <span className="text-muted-foreground">Time window:</span>
            {(
              [
                { label: "1h", ms: 60 * 60 * 1000 },
                { label: "24h", ms: 24 * 60 * 60 * 1000 },
                { label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
              ] as const
            ).map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() =>
                  setCreatedSinceWindowMs(
                    createdSinceWindowMs === opt.ms ? null : opt.ms,
                  )
                }
                className={`rounded border px-2 py-0.5 font-mono ${createdSinceWindowMs === opt.ms ? "bg-muted" : "bg-background"}`}
                data-testid={`graph-health-failure-state-events-time-window-${opt.label}`}
              >
                {opt.label}
              </button>
            ))}
            {createdSinceWindowMs !== null ? (
              <button
                type="button"
                onClick={() => setCreatedSinceWindowMs(null)}
                className="text-xs text-muted-foreground underline"
                data-testid="graph-health-failure-state-events-time-window-clear"
              >
                All time
              </button>
            ) : null}
          </div>
          {/* T-I.66: source-kind filter indicator. Open-ended axis
              with no fixed enum, so the affordance is "click a row
              in the by-source-kind table to filter". This chip shows
              the active filter + lets the operator clear it without
              scrolling back to the row (which may be off-screen
              after the filter narrows the buffer). Renders only when
              a filter is active — silent at rest. */}
          {sourceKindFilter !== null ? (
            <div
              className="flex items-center gap-2 text-xs"
              data-testid="graph-health-failure-state-events-source-kind-filter-chip"
            >
              <span className="text-muted-foreground">
                Source kind:
              </span>
              <span className="rounded bg-muted px-2 py-0.5 font-mono">
                {sourceKindFilter}
              </span>
              <button
                type="button"
                onClick={() => setSourceKindFilter(null)}
                className="text-xs text-muted-foreground underline"
                data-testid="graph-health-failure-state-events-source-kind-filter-clear"
              >
                Clear
              </button>
            </div>
          ) : null}
          {failureStateEventsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading recent failure-state events…
            </p>
          ) : failureStateEventsQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load failure-state events: {failureStateEventsQ.error.message}
            </p>
          ) : failureStateEventsQ.data == null ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            <>
              {/* T-I.68: empty-state messaging. When the buffer is
                  empty (rows.length === 0), distinguish two cases:
                  filters narrowed to nothing (clearable) vs. the
                  workspace simply hasn't recorded any closed-
                  taxonomy events yet (informational). Without this,
                  operators staring at totalEvents:0 can't tell
                  whether their filter worked or whether they
                  triaged into a true empty. */}
              {failureStateEventsQ.data.rows.length === 0 ? (
                <div
                  className="rounded border bg-muted/30 p-3 text-sm"
                  data-testid="graph-health-failure-state-events-empty"
                >
                  {kindFilter !== null ||
                  sourceKindFilter !== null ||
                  createdSinceWindowMs !== null ? (
                    <div className="flex items-center justify-between gap-2">
                      <p>
                        No closed-taxonomy events match the active
                        filter(s).
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setKindFilter(null);
                          setSourceKindFilter(null);
                          setCreatedSinceWindowMs(null);
                        }}
                        className="text-xs text-muted-foreground underline"
                        data-testid="graph-health-failure-state-events-empty-clear-all"
                      >
                        Clear all filters
                      </button>
                    </div>
                  ) : (
                    <p>
                      No closed-taxonomy failure-state events recorded
                      yet.
                    </p>
                  )}
                </div>
              ) : null}
              <div
                className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm"
                data-testid="graph-health-failure-state-events-summary"
              >
                <div>
                  <span className="font-medium">totalEvents:</span>{" "}
                  <span className="font-mono">
                    {failureStateEventsQ.data.summary.totalEvents}
                  </span>
                </div>
                <div>
                  <span className="font-medium">closedTaxonomyEvents:</span>{" "}
                  <span className="font-mono">
                    {failureStateEventsQ.data.summary.closedTaxonomyEvents}
                  </span>
                </div>
                <div>
                  <span className="font-medium">freeFormEvents:</span>{" "}
                  <span
                    className={`font-mono ${failureStateEventsQ.data.summary.freeFormEvents > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}
                  >
                    {failureStateEventsQ.data.summary.freeFormEvents}
                  </span>
                </div>
                <div>
                  <span className="font-medium">distinctSourceKinds:</span>{" "}
                  <span className="font-mono">
                    {failureStateEventsQ.data.summary.distinctSourceKinds}
                  </span>
                </div>
                <div>
                  <span className="font-medium">oldestAt:</span>{" "}
                  <span className="font-mono text-xs">
                    {fmtTs(failureStateEventsQ.data.summary.oldestAt)}
                  </span>
                </div>
                <div>
                  <span className="font-medium">newestAt:</span>{" "}
                  <span className="font-mono text-xs">
                    {fmtTs(failureStateEventsQ.data.summary.newestAt)}
                  </span>
                </div>
              </div>
              {failureStateEventsQ.data.summary.closedTaxonomyEvents > 0 ? (
                <div className="overflow-x-auto pt-2 border-t">
                  <table
                    className="w-full text-sm border-collapse"
                    data-testid="graph-health-failure-state-events-by-kind-table"
                  >
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-3">Kind</th>
                        <th className="py-1 pr-3">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(
                        failureStateEventsQ.data.summary.occurrenceSummary
                          .byKind,
                      )
                        .filter(([, n]) => (n as number) > 0)
                        .sort(
                          ([, a], [, b]) =>
                            (b as number) - (a as number),
                        )
                        .map(([kind, n]) => (
                          <tr
                            key={kind}
                            className={`border-t ${kindFilter === kind ? "bg-muted/50" : ""}`}
                            data-testid={`graph-health-failure-state-events-by-kind-row-${kind}`}
                          >
                            <td className="py-1 pr-3 font-mono text-xs">
                              {/* T-I.65: clickable kind cell — sets
                                  the T-I.64 kindFilter so the operator
                                  can drill from the rollup table into
                                  the kind-narrowed buffer with one
                                  click. Selecting the already-active
                                  kind toggles it off. */}
                              <button
                                type="button"
                                className="underline decoration-dotted hover:decoration-solid"
                                onClick={() =>
                                  setKindFilter(
                                    kindFilter === kind ? null : kind,
                                  )
                                }
                                data-testid={`graph-health-failure-state-events-by-kind-filter-${kind}`}
                              >
                                {kind}
                              </button>
                            </td>
                            <td className="py-1 pr-3 font-mono text-xs">
                              {n as number}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {/* T-I.62: latest rows table. T-I.59 fetches up to 50
                  rows; this section renders the most-recent 15 so
                  operators can investigate specific failures
                  without a separate "see all events" page. Sort
                  is server-side descending-by-id (matches
                  listErrorEvents default), so we just slice the
                  prefix here.

                  Truncation note: 15 is empirically the row count
                  that fits a typical operator monitor without
                  scrolling; the underlying tRPC limit is operator-
                  tunable (default 50, max 500) so heavier triage
                  can re-query with a higher limit. */}
              {failureStateEventsQ.data.rows.length > 0 ? (
                <div className="overflow-x-auto pt-2 border-t">
                  <p className="text-xs text-muted-foreground pb-1">
                    Latest rows (most-recent{" "}
                    {Math.min(15, failureStateEventsQ.data.rows.length)} of{" "}
                    {failureStateEventsQ.data.rows.length} sampled)
                  </p>
                  <table
                    className="w-full text-sm border-collapse"
                    data-testid="graph-health-failure-state-events-latest-rows-table"
                  >
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-3">Created</th>
                        <th className="py-1 pr-3">Kind</th>
                        <th className="py-1 pr-3">Source kind</th>
                        <th className="py-1 pr-3">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failureStateEventsQ.data.rows
                        .slice(0, 15)
                        .map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="py-1 pr-3 font-mono text-xs whitespace-nowrap">
                              {fmtTs(r.createdAt)}
                            </td>
                            <td
                              className={`py-1 pr-3 font-mono text-xs ${failureStateKindClass(
                                r.errorClass.startsWith("failure_state:")
                                  ? r.errorClass.slice(
                                      "failure_state:".length,
                                    )
                                  : r.errorClass,
                              )}`}
                              data-testid={`graph-health-failure-state-event-kind-${r.id}`}
                              title={`severity: ${
                                FAILURE_STATE_SEVERITY[
                                  r.errorClass.startsWith("failure_state:")
                                    ? r.errorClass.slice(
                                        "failure_state:".length,
                                      )
                                    : r.errorClass
                                ] ?? "unknown"
                              }`}
                            >
                              {r.errorClass.startsWith("failure_state:")
                                ? r.errorClass.slice(
                                    "failure_state:".length,
                                  )
                                : r.errorClass}
                            </td>
                            <td className="py-1 pr-3 font-mono text-xs">
                              {r.sourceKind}
                            </td>
                            <td className="py-1 pr-3 font-mono text-xs truncate max-w-[40ch]">
                              {r.errorMessage}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {/* T-I.61: per-source-kind breakdown, computed client-
                  side from the raw rows. Operators use this to
                  answer "which emitter is loudest right now"
                  without a separate server query. Same descending-
                  count sort as the by-kind table; render gated on
                  totalEvents > 0 (so an empty workspace doesn't
                  show the section header). */}
              {failureStateEventsQ.data.rows.length > 0 ? (
                <div className="overflow-x-auto pt-2 border-t">
                  <p className="text-xs text-muted-foreground pb-1">
                    Per source-kind (over the {failureStateEventsQ.data.rows.length}{" "}
                    sampled rows)
                  </p>
                  <table
                    className="w-full text-sm border-collapse"
                    data-testid="graph-health-failure-state-events-by-source-kind-table"
                  >
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-3">Source kind</th>
                        <th className="py-1 pr-3">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const counts = new Map<string, number>();
                        for (const r of failureStateEventsQ.data.rows) {
                          counts.set(
                            r.sourceKind,
                            (counts.get(r.sourceKind) ?? 0) + 1,
                          );
                        }
                        return Array.from(counts.entries())
                          .sort(([, a], [, b]) => b - a)
                          .map(([sourceKind, count]) => (
                            <tr
                              key={sourceKind}
                              className={`border-t ${sourceKindFilter === sourceKind ? "bg-muted/50" : ""}`}
                              data-testid={`graph-health-failure-state-events-by-source-kind-row-${sourceKind}`}
                            >
                              <td className="py-1 pr-3 font-mono text-xs">
                                {/* T-I.66: clickable source-kind cell
                                    — mirrors T-I.65's by-kind shape on
                                    the second axis. Toggle semantics:
                                    clicking the active sourceKind
                                    clears the filter. */}
                                <button
                                  type="button"
                                  className="underline decoration-dotted hover:decoration-solid"
                                  onClick={() =>
                                    setSourceKindFilter(
                                      sourceKindFilter === sourceKind
                                        ? null
                                        : sourceKind,
                                    )
                                  }
                                  data-testid={`graph-health-failure-state-events-by-source-kind-filter-${sourceKind}`}
                                >
                                  {sourceKind}
                                </button>
                              </td>
                              <td className="py-1 pr-3 font-mono text-xs">
                                {count}
                              </td>
                            </tr>
                          ));
                      })()}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
