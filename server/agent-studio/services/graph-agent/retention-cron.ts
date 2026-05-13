/**
 * Graph Agent Runtime Traces — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #677. Wraps the existing `pruneRuntimeTraces`
 * service (Phase 14 §3 — shipped without a cron) in the standard
 * makeRetentionCron({...}) factory shape.
 *
 * Sweeps 4 tables (children-first per existing service):
 *   - `ags_graph_skill_runtime_usages` (Phase 12.5 §4-§14)
 *   - `ags_query_template_runs`
 *   - `ags_graph_agent_steps` (FK runId → agsGraphAgentRuns.id)
 *   - `ags_graph_agent_runs`
 *
 * Defaults:
 *  - Cron: `"0 17 * * *"` — daily 17:00 UTC. 15th slot in the
 *    daily-sweep ladder (03-17 UTC).
 *  - Retention: 90 days — matches the existing service's
 *    DEFAULT_HORIZON_MS (90d) rather than the 30d that most other
 *    mini-arcs use. Decision-trace ledgers have longer forensic
 *    value than per-tool-call traces.
 *
 * Env: `AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_CRON_DISABLED` /
 * `_CRON_EXPR` / `_DAYS`.
 *
 * The factory's `buildSweepInput` adapts the standard cutoff
 * (`olderThan: Date`) to the prune service's ms-horizon shape
 * (`olderThanMs: number`): `olderThanMs = now - olderThan`.
 *
 * ADR: docs/architecture/agent-studio-graph-agent-runtime.md §1.6
 */

import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus,
  type TickRetentionCronOptions,
  type TickRetentionCronResult,
} from "../retention/make-retention-cron.js";
import {
  pruneRuntimeTraces,
  type PruneRuntimeTraceOptions,
  type RetentionPruneSummary,
} from "./retention.js";

const cron = makeRetentionCron<PruneRuntimeTraceOptions, RetentionPruneSummary>({
  logPrefix: "ags-graph-agent-runtime-traces-retention-cron",
  envPrefix: "AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION",
  defaultCronExpr: "0 17 * * *",
  defaultRetentionDays: 90,
  buildSweepInput: ({ olderThan, sweepInput }) => {
    const cutoffMs =
      olderThan instanceof Date ? olderThan.getTime() : Date.now();
    return {
      ...(sweepInput ?? {}),
      olderThanMs: Date.now() - cutoffMs,
    } as PruneRuntimeTraceOptions;
  },
  runSweep: (input) => pruneRuntimeTraces(input),
  formatSweepLogTail: (r, days) =>
    `usages=${r.graphSkillRuntimeUsages} queryRuns=${r.queryTemplateRuns} steps=${r.graphAgentSteps} runs=${r.graphAgentRuns} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) =>
    `retentionDays=${retentionDays}`,
});

export const DEFAULT_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_CRON_EXPR =
  cron.DEFAULT_CRON_EXPR;
export const DEFAULT_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickGraphAgentRuntimeTracesRetentionCronOptions =
  TickRetentionCronOptions<PruneRuntimeTraceOptions, RetentionPruneSummary>;
export type TickGraphAgentRuntimeTracesRetentionCronResult =
  TickRetentionCronResult<RetentionPruneSummary>;
export type EnsureState = RetentionCronEnsureState<RetentionPruneSummary>;
export type GraphAgentRuntimeTracesRetentionCronStatus =
  RetentionCronStatus<RetentionPruneSummary>;

export const tickGraphAgentRuntimeTracesRetentionCron = cron.tick;
export const getGraphAgentRuntimeTracesRetentionCronStatus = cron.getStatus;
export const ensureGraphAgentRuntimeTracesRetentionCronStarted =
  cron.ensureStarted;
export const _resetGraphAgentRuntimeTracesRetentionCronForTests =
  cron.resetForTests;
