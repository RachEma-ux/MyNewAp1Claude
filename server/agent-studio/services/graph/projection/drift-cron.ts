/**
 * Graph Projection Drift Cron — strict-audit item #9 (partial) closure.
 *
 * Today's drift surface (`detectDrift()` on the GraphRepository, +
 * the in-memory `DriftDetector` scanner) is on-demand only — operator
 * runs the procedure from tRPC, no schedule. This module wires the
 * scanner to the shared retention-cron factory so drift checks run
 * automatically on a daily schedule and surface through the same
 * cron-status shape as the other retention crons.
 *
 * Persistence: drift events land in `ags_graph_projection_drift_events`
 * — the operator can pull them down via the existing graph-correction
 * UI or tRPC. Last-run summary is exposed via `getStatus()` for the
 * operator cron-status surface.
 *
 * Defaults:
 *   - Cron: `"30 4 * * *"` — daily 04:30 UTC, offset 30m from the
 *     runtime-runs sweep at 04:00. Slot #19 in the daily-sweep ladder.
 *   - Retention envelope: NONE. Drift detection is a scan, not a
 *     prune. The factory's `defaultRetentionDays: null` mode applies.
 *   - Scope: "default" — single global scope today. Sub-scope
 *     wiring is V1.5 (operator opts into per-workspace scans).
 *
 * Env:
 *   - `AGS_PROJECTION_DRIFT_CRON_DISABLED` — `"1" | "true"` to disable.
 *   - `AGS_PROJECTION_DRIFT_CRON_EXPR` — override cron expression.
 *
 * Hard-rule compliance:
 *   - GraphRepository is the only graph access path; the scanner
 *     uses `repository.explainNode()` + `repository.isVisibleToUser()`.
 *   - Postgres = source of truth. The cron reads source-row counts +
 *     a sample of source ids from Postgres and compares against the
 *     projection backend.
 *   - No graph mutation. Drift events are flagged for operator
 *     remediation; this cron does NOT auto-resolve.
 *
 * ADR: docs/architecture/agent-studio-graph-projection-sync.md §2.7
 */

import { sql } from "drizzle-orm";

import { getAsDb } from "../../../db/connection.js";
import { agsGraphProjectionDriftEvents } from "../../../../../drizzle/tables/agent-studio-graph-projection.js";
import { agsGraphNodes as agsGraphNodesTable } from "../../../../../drizzle/tables/agent-studio-graph.js";
import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus,
  type TickRetentionCronOptions,
  type TickRetentionCronResult,
} from "../../retention/make-retention-cron.js";
import { getGraphRepository } from "../repository/index.js";
import {
  DriftDetector,
  type DriftDetectorInput,
  type DriftReport,
  type SourceRowCount,
} from "./drift-detector.js";
import { recordFailureStateEvent } from "../../failure-states/observability-bridge.js";

const SAMPLE_PER_TYPE_DEFAULT = 25;

export interface DriftCronInput {
  /** Scope tag. Default "default". */
  readonly scope?: string;
  /** Override the sample size per type. Default 25. */
  readonly samplePerType?: number;
  /** Test seam — supply a pre-built input rather than computing from Postgres. */
  readonly precomputedInput?: DriftDetectorInput;
  /** Test seam — supply a stubbed scanner. */
  readonly runScan?: (input: DriftDetectorInput) => Promise<DriftReport>;
  /**
   * Test seam — replace the default `persistDriftReport`. Useful when
   * the test env has no ASDB; the default persistence path tries to
   * insert into `ags_graph_projection_drift_events`.
   */
  readonly persist?: (report: DriftReport) => Promise<number>;
}

export interface DriftCronResult {
  readonly scope: string;
  readonly scannedAt: string;
  readonly totalScanned: number;
  readonly driftCount: number;
  readonly permissionLeakCount: number;
  /** Number of drift events persisted into the table. */
  readonly persistedEvents: number;
}

/**
 * Pull source-row counts + a sample of source ids out of
 * `ags_graph_nodes` (Postgres SoT). Exposed for tests; the cron's
 * default `prepareInput` uses this when no precomputed input is
 * supplied.
 */
export async function loadDriftDetectorInputFromAsDb(
  options: { scope: string; samplePerType: number } = {
    scope: "default",
    samplePerType: SAMPLE_PER_TYPE_DEFAULT,
  },
): Promise<DriftDetectorInput> {
  const db = getAsDb();
  if (!db) {
    return { scope: options.scope, sourceCounts: [], sampleSourceIds: [] };
  }
  const counts = await db
    .select({
      typeKey: agsGraphNodesTable.typeKey,
      count: sql<number>`count(*)::int`,
    })
    .from(agsGraphNodesTable)
    .where(sql`${agsGraphNodesTable.governanceStatus} = 'active'`)
    .groupBy(agsGraphNodesTable.typeKey);

  const sourceCounts: SourceRowCount[] = counts.map((c) => ({
    typeKey: c.typeKey,
    count: Number(c.count ?? 0),
  }));

  const samples: { typeKey: string; id: string; latestVersionId: string }[] = [];
  for (const c of sourceCounts) {
    const rows = await db
      .select({
        nodeKey: agsGraphNodesTable.nodeKey,
        sourceVersionId: agsGraphNodesTable.sourceVersionId,
      })
      .from(agsGraphNodesTable)
      .where(
        sql`${agsGraphNodesTable.typeKey} = ${c.typeKey} and ${agsGraphNodesTable.governanceStatus} = 'active'`,
      )
      .limit(options.samplePerType);
    for (const r of rows) {
      samples.push({
        typeKey: c.typeKey,
        id: r.nodeKey,
        latestVersionId: r.sourceVersionId ?? "",
      });
    }
  }

  return {
    scope: options.scope,
    sourceCounts,
    sampleSourceIds: samples,
  };
}

/**
 * Persist drift events to `ags_graph_projection_drift_events`.
 * Returns the number of rows inserted. No-ops if ASDB is not
 * configured (test-mode fall-through).
 */
export async function persistDriftReport(report: DriftReport): Promise<number> {
  const db = getAsDb();
  if (!db || report.events.length === 0) return 0;
  await db.insert(agsGraphProjectionDriftEvents).values(
    report.events.map((e) => ({
      projectionKey: report.scope,
      sourceId: e.sourceId,
      driftClass: e.driftClass,
      sourceVersionId:
        typeof e.details.postgresVersion === "string"
          ? (e.details.postgresVersion as string)
          : typeof e.details.latestVersionId === "string"
            ? (e.details.latestVersionId as string)
            : null,
      neo4jVersionId:
        typeof e.details.neo4jVersion === "string"
          ? (e.details.neo4jVersion as string)
          : null,
    })),
  );
  return report.events.length;
}

const cron = makeRetentionCron<DriftCronInput, DriftCronResult>({
  logPrefix: "ags-projection-drift-cron",
  envPrefix: "AGS_PROJECTION_DRIFT",
  defaultCronExpr: "30 4 * * *",
  defaultRetentionDays: null,
  buildSweepInput: ({ sweepInput }) => sweepInput ?? {},
  runSweep: async (input) => {
    const scope = input.scope ?? "default";
    const samplePerType = input.samplePerType ?? SAMPLE_PER_TYPE_DEFAULT;
    const detectorInput =
      input.precomputedInput ??
      (await loadDriftDetectorInputFromAsDb({ scope, samplePerType }));
    const runScan =
      input.runScan ??
      ((di) => new DriftDetector(getGraphRepository()).scan(di));
    const persist = input.persist ?? persistDriftReport;
    const report = await runScan(detectorInput);
    const persisted = await persist(report);
    // T-I.5 batch A — bridge drift detection to the Phase 22 closed-
    // taxonomy emission surface so operator dashboards can group
    // `neo4j_projection_drift_detected` events alongside other failure
    // states. Only emit when driftCount > 0 (zero-drift scans aren't
    // a failure event); fire-and-forget — observability writes never
    // propagate into the cron return path.
    if (report.summary.driftCount > 0) {
      void recordFailureStateEvent({
        failureState: "neo4j_projection_drift_detected",
        sourceKind: "projection-drift-cron",
        sourceId: report.scope,
        errorMessage: `Projection drift detected — ${report.summary.driftCount} event(s) across ${report.summary.totalScanned} scanned`,
        metadata: {
          scope: report.scope,
          totalScanned: report.summary.totalScanned,
          driftCount: report.summary.driftCount,
          permissionLeakCount: report.summary.permissionLeakCount,
        },
      }).catch(() => {
        // Fail-soft.
      });
    }
    return {
      scope: report.scope,
      scannedAt: report.scannedAt,
      totalScanned: report.summary.totalScanned,
      driftCount: report.summary.driftCount,
      permissionLeakCount: report.summary.permissionLeakCount,
      persistedEvents: persisted,
    };
  },
  formatSweepLogTail: (r) =>
    `scope=${r.scope} scanned=${r.totalScanned} drifts=${r.driftCount} leaks=${r.permissionLeakCount} persisted=${r.persistedEvents}`,
  formatStartupLogTail: () => "scope=default",
});

export const DEFAULT_PROJECTION_DRIFT_CRON_EXPR = cron.DEFAULT_CRON_EXPR;

export type TickProjectionDriftCronOptions = TickRetentionCronOptions<
  DriftCronInput,
  DriftCronResult
>;
export type TickProjectionDriftCronResult =
  TickRetentionCronResult<DriftCronResult>;
export type ProjectionDriftCronEnsureState =
  RetentionCronEnsureState<DriftCronResult>;
export type ProjectionDriftCronStatus = RetentionCronStatus<DriftCronResult>;

export const tickProjectionDriftCron = cron.tick;
export const getProjectionDriftCronStatus = cron.getStatus;
export const ensureProjectionDriftCronStarted = cron.ensureStarted;
export const _resetProjectionDriftCronForTests = cron.resetForTests;
