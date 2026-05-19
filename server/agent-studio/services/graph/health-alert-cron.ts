/**
 * Graph health-alert cron — V1+ Phase J-1-β.
 *
 * PR-V1-1 (#748) shipped the pure evaluator + scanner + persistence
 * for graph backend health alerts (`health-alert.ts`). The scan was
 * callable on-demand but never scheduled — an operator had to
 * invoke `runHealthAlertScan()` manually to populate
 * `ags_runtime_alerts`. This module wires the scanner to the shared
 * retention-cron factory so health checks fire automatically on a
 * fast cadence and surface through the same cron-status shape as
 * the drift cron + the 18 retention crons.
 *
 * Defaults:
 *   - Cron: `"* /5 * * * *"` (every 5 minutes — faster than the
 *     daily retention sweeps). Alerting needs latency-of-detection
 *     measured in minutes, not hours; the runbook's "sustained 7
 *     days" decision is driven by the persisted rows, not by the
 *     cron tick rate.
 *   - Retention envelope: 90 days on RESOLVED alerts only. Slice 19
 *     of the no-deferral catalogue (2026-05-19) closed the α-slice
 *     "out of scope" deferral. Open / unresolved alerts are never
 *     pruned — they are operator-actionable and stay until resolved.
 *     Pruning targets `resolvedAt`, not `raisedAt`, so a long-running
 *     unresolved breach can't get pruned mid-flight.
 *   - Scope: "default" — single global scope today. Per-workspace
 *     scopes land in V1.5 when the multi-region router (PR-V2-1)
 *     hooks region pins.
 *
 * Env:
 *   - `AGS_GRAPH_HEALTH_ALERT_CRON_DISABLED` — `"1" | "true"` to disable.
 *   - `AGS_GRAPH_HEALTH_ALERT_CRON_EXPR` — override cron expression.
 *
 * Hard-rule compliance (CLAUDE.md Non-Build List):
 *   - GraphRepository is the only graph access path — the scan
 *     reaches the backend via `repository.health()` in
 *     `runHealthAlertScan`.
 *   - No graph mutation. The cron emits alert rows; remediation
 *     routes through the operator runbook.
 *   - Postgres = source of truth. Alert rows live in ASDB.
 *
 * ADR: docs/architecture/agent-studio-native-graph-workspace.md
 *      docs/runbooks/agent-studio-neo4j-aura-migration.md §1
 */

import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus,
  type TickRetentionCronOptions,
  type TickRetentionCronResult,
} from "../retention/make-retention-cron.js";
import {
  runHealthAlertScan,
  pruneOldRuntimeAlerts,
  type HealthAlertScanInput,
  type HealthAlertScanResult,
} from "./health-alert.js";

export interface HealthAlertCronInput {
  /** Scope tag. Default "default". */
  readonly scope?: string;
  /** Test seam — replace the default scan composition. */
  readonly runScan?: (
    input: HealthAlertScanInput,
  ) => Promise<HealthAlertScanResult>;
  /** Forwarded to `runHealthAlertScan` test seams. */
  readonly scanInput?: HealthAlertScanInput;
}

export interface HealthAlertCronResult {
  readonly scope: string;
  readonly scannedAt: string;
  readonly status: HealthAlertScanResult["status"];
  readonly latencyMs?: number;
  readonly decisionCount: number;
  readonly raised: number;
  readonly resolved: number;
  /** Slice 19 retention envelope — count of resolved alerts pruned. */
  readonly pruned: number;
}

const cron = makeRetentionCron<HealthAlertCronInput, HealthAlertCronResult>({
  logPrefix: "ags-graph-health-alert-cron",
  envPrefix: "AGS_GRAPH_HEALTH_ALERT",
  defaultCronExpr: "*/5 * * * *",
  // Slice 19 of the no-deferral catalogue: 90-day retention on
  // resolved alerts. The factory computes `olderThan` from this and
  // hands it to `buildSweepInput`; we forward to `pruneOldRuntimeAlerts`
  // after the scan.
  defaultRetentionDays: 90,
  buildSweepInput: ({ olderThan, sweepInput }) => ({
    ...(sweepInput ?? {}),
    olderThan: olderThan as Date | null,
  }),
  runSweep: async (input: HealthAlertCronInput & { olderThan?: Date | null }) => {
    const scope = input.scope ?? "default";
    const runScan = input.runScan ?? runHealthAlertScan;
    const scanInput: HealthAlertScanInput = {
      ...(input.scanInput ?? {}),
      scope,
    };
    const report = await runScan(scanInput);
    // Retention pass — prune resolved alerts older than the cutoff.
    let pruned = 0;
    if (input.olderThan) {
      const r = await pruneOldRuntimeAlerts({ olderThan: input.olderThan });
      pruned = r.deleted;
    }
    return {
      scope: report.scope,
      scannedAt: report.scannedAt,
      status: report.status,
      latencyMs: report.latencyMs,
      decisionCount: report.decisions.length,
      raised: report.persisted.raised,
      resolved: report.persisted.resolved,
      pruned,
    };
  },
  formatSweepLogTail: (r) =>
    `scope=${r.scope} status=${r.status}` +
    (typeof r.latencyMs === "number" ? ` latencyMs=${r.latencyMs}` : "") +
    ` decisions=${r.decisionCount} raised=${r.raised} resolved=${r.resolved} pruned=${r.pruned}`,
  formatStartupLogTail: () => "scope=default",
});

export const DEFAULT_HEALTH_ALERT_CRON_EXPR = cron.DEFAULT_CRON_EXPR;

export type TickHealthAlertCronOptions = TickRetentionCronOptions<
  HealthAlertCronInput,
  HealthAlertCronResult
>;
export type TickHealthAlertCronResult =
  TickRetentionCronResult<HealthAlertCronResult>;
export type HealthAlertCronEnsureState =
  RetentionCronEnsureState<HealthAlertCronResult>;
export type HealthAlertCronStatus =
  RetentionCronStatus<HealthAlertCronResult>;

export const tickHealthAlertCron = cron.tick;
export const getHealthAlertCronStatus = cron.getStatus;
export const ensureHealthAlertCronStarted = cron.ensureStarted;
export const _resetHealthAlertCronForTests = cron.resetForTests;
