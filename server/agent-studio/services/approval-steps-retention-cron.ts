/**
 * agsApprovalSteps — scheduled retention sweep cron.
 *
 * Second of three approval-lifecycle daily-sweep crons. Wraps
 * pruneApprovalStepsRetention with the standard `makeRetentionCron`
 * factory contract.
 *
 * Defaults:
 *   - Cron: `"0 19 * * *"` — daily 19:00 UTC. 17th slot in the
 *     daily-sweep ladder.
 *   - Retention window: 90 days. Matches publish-requests cron.
 *
 * Env vars: `AGS_APPROVAL_STEPS_RETENTION_CRON_DISABLED` / `_CRON_EXPR`
 * / `_DAYS`.
 */

import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus,
  type TickRetentionCronOptions,
  type TickRetentionCronResult,
} from "./retention/make-retention-cron.js";
import {
  pruneApprovalStepsRetention,
  type PruneApprovalStepsRetentionInput,
  type PruneApprovalStepsRetentionResult,
} from "./approval-steps-retention.js";

const cron = makeRetentionCron<
  PruneApprovalStepsRetentionInput,
  PruneApprovalStepsRetentionResult
>({
  logPrefix: "ags-approval-steps-retention-cron",
  envPrefix: "AGS_APPROVAL_STEPS_RETENTION",
  defaultCronExpr: "0 19 * * *",
  defaultRetentionDays: 90,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneApprovalStepsRetentionInput,
  runSweep: (input) => pruneApprovalStepsRetention(input),
  formatSweepLogTail: (r, days) =>
    `deleted=${r.deletedCount} preserved=${r.preservedCount} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) => `retentionDays=${retentionDays}`,
});

export const DEFAULT_APPROVAL_STEPS_RETENTION_CRON_EXPR = cron.DEFAULT_CRON_EXPR;
export const DEFAULT_APPROVAL_STEPS_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickApprovalStepsRetentionCronOptions = TickRetentionCronOptions<
  PruneApprovalStepsRetentionInput,
  PruneApprovalStepsRetentionResult
>;
export type TickApprovalStepsRetentionCronResult =
  TickRetentionCronResult<PruneApprovalStepsRetentionResult>;
export type EnsureState = RetentionCronEnsureState<PruneApprovalStepsRetentionResult>;
export type ApprovalStepsRetentionCronStatus =
  RetentionCronStatus<PruneApprovalStepsRetentionResult>;

export const tickApprovalStepsRetentionCron = cron.tick;
export const getApprovalStepsRetentionCronStatus = cron.getStatus;
export const ensureApprovalStepsRetentionCronStarted = cron.ensureStarted;
export const _resetApprovalStepsRetentionCronForTests = cron.resetForTests;
