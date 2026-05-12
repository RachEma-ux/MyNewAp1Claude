/**
 * MCP Transitions — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #630. Sister of #622/#626 on the
 * `ags_mcp_transitions` table.
 *
 * Defaults:
 *  - Cron: `"0 6 * * *"` — daily 06:00 UTC.
 *  - Retention: 30 days
 *
 * Env: `AGS_MCP_TRANSITIONS_RETENTION_CRON_DISABLED` / `_CRON_EXPR`
 * / `_DAYS`.
 *
 * Phase 22 follow-up #642 — module body collapsed onto the shared
 * `makeRetentionCron({...})` factory. Named exports preserved.
 */

import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus,
  type TickRetentionCronOptions,
  type TickRetentionCronResult,
} from "./retention/make-retention-cron.js";
import {
  pruneOldMcpTransitions,
  type PruneOldMcpTransitionsInput,
  type PruneOldMcpTransitionsResult,
} from "./mcp-transitions-retention.js";

const cron = makeRetentionCron<
  PruneOldMcpTransitionsInput,
  PruneOldMcpTransitionsResult
>({
  logPrefix: "ags-mcp-transitions-retention-cron",
  envPrefix: "AGS_MCP_TRANSITIONS_RETENTION",
  defaultCronExpr: "0 6 * * *",
  defaultRetentionDays: 30,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneOldMcpTransitionsInput,
  runSweep: (input) => pruneOldMcpTransitions(input),
  formatSweepLogTail: (r, days) =>
    `deleted=${r.deletedCount} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) =>
    `retentionDays=${retentionDays}`,
});

export const DEFAULT_MCP_TRANSITIONS_RETENTION_CRON_EXPR =
  cron.DEFAULT_CRON_EXPR;
export const DEFAULT_MCP_TRANSITIONS_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickMcpTransitionsRetentionCronOptions = TickRetentionCronOptions<
  PruneOldMcpTransitionsInput,
  PruneOldMcpTransitionsResult
>;
export type TickMcpTransitionsRetentionCronResult =
  TickRetentionCronResult<PruneOldMcpTransitionsResult>;
export type EnsureState =
  RetentionCronEnsureState<PruneOldMcpTransitionsResult>;
export type McpTransitionsRetentionCronStatus =
  RetentionCronStatus<PruneOldMcpTransitionsResult>;

export const tickMcpTransitionsRetentionCron = cron.tick;
export const getMcpTransitionsRetentionCronStatus = cron.getStatus;
export const ensureMcpTransitionsRetentionCronStarted = cron.ensureStarted;
export const _resetMcpTransitionsRetentionCronForTests = cron.resetForTests;
