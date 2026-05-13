/**
 * Graph Quality Agent Runs — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #666. Sister of #658 (graph-quality-scans) on
 * the `ags_graph_quality_agent_runs` surface — the autonomous
 * graph-quality agent's run log.
 *
 * Defaults:
 *  - Cron: `"0 14 * * *"` — daily 14:00 UTC. 12th slot in the
 *    daily-sweep ladder (03-14 UTC).
 *  - Retention: 30 days
 *
 * Env: `AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_CRON_DISABLED` /
 * `_CRON_EXPR` / `_DAYS`.
 *
 * Built on the shared `makeRetentionCron({...})` factory (#642).
 */

import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus,
  type TickRetentionCronOptions,
  type TickRetentionCronResult,
} from "./retention/make-retention-cron.js";
import {
  pruneOldGraphQualityAgentRuns,
  type PruneOldGraphQualityAgentRunsInput,
  type PruneOldGraphQualityAgentRunsResult,
} from "./graph-quality-agent-runs-retention.js";

const cron = makeRetentionCron<
  PruneOldGraphQualityAgentRunsInput,
  PruneOldGraphQualityAgentRunsResult
>({
  logPrefix: "ags-graph-quality-agent-runs-retention-cron",
  envPrefix: "AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION",
  defaultCronExpr: "0 14 * * *",
  defaultRetentionDays: 30,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneOldGraphQualityAgentRunsInput,
  runSweep: (input) => pruneOldGraphQualityAgentRuns(input),
  formatSweepLogTail: (r, days) =>
    `agentRuns=${r.deletedAgentRunsCount} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) =>
    `retentionDays=${retentionDays}`,
});

export const DEFAULT_GRAPH_QUALITY_AGENT_RUNS_RETENTION_CRON_EXPR =
  cron.DEFAULT_CRON_EXPR;
export const DEFAULT_GRAPH_QUALITY_AGENT_RUNS_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickGraphQualityAgentRunsRetentionCronOptions =
  TickRetentionCronOptions<
    PruneOldGraphQualityAgentRunsInput,
    PruneOldGraphQualityAgentRunsResult
  >;
export type TickGraphQualityAgentRunsRetentionCronResult =
  TickRetentionCronResult<PruneOldGraphQualityAgentRunsResult>;
export type EnsureState =
  RetentionCronEnsureState<PruneOldGraphQualityAgentRunsResult>;
export type GraphQualityAgentRunsRetentionCronStatus =
  RetentionCronStatus<PruneOldGraphQualityAgentRunsResult>;

export const tickGraphQualityAgentRunsRetentionCron = cron.tick;
export const getGraphQualityAgentRunsRetentionCronStatus = cron.getStatus;
export const ensureGraphQualityAgentRunsRetentionCronStarted =
  cron.ensureStarted;
export const _resetGraphQualityAgentRunsRetentionCronForTests =
  cron.resetForTests;
