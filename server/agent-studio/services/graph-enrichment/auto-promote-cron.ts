/**
 * Semantic Enrichment auto-promote cron — T-D.4 cron driver.
 *
 * Wraps `runAutoPromoteTick` in the shared `makeRetentionCron` factory
 * so high-confidence pending enrichment proposals (≥0.95 by default)
 * flow automatically onto the graph-correction triage surface where
 * operators see them alongside agent-issued + manually-issued
 * corrections.
 *
 * Defaults:
 *   - Cron: `"*\/15 * * * *"` — every 15 minutes. Tighter than the
 *     daily retention crons (sub-hourly responsiveness for new
 *     proposals) but looser than the projection-drain cron (which
 *     runs every 5 minutes because it processes EVERY mutation; this
 *     one only catches the high-confidence tail).
 *   - Retention envelope: NONE. The orchestrator processes pending
 *     rows; prune of stale promoted rows is a separate retention
 *     cron's concern.
 *   - Min confidence: 0.95 (DEFAULT_AUTO_PROMOTE_MIN_CONFIDENCE).
 *   - Per-tick limit: 25 (DEFAULT_AUTO_PROMOTE_PER_TICK_LIMIT).
 *
 * Env:
 *   - `AGS_SEMANTIC_ENRICHMENT_AUTO_PROMOTE_CRON_DISABLED` — `"1" | "true"` to disable.
 *   - `AGS_SEMANTIC_ENRICHMENT_AUTO_PROMOTE_CRON_EXPR` — override cron expression.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Uses the shared retention-cron factory; no new scheduling primitives.
 *   - No `neo4j-driver` / `openrouter` / `dispatchMcpToolCall` imports.
 *   - Bridge errors are bucketed per-row by the orchestrator; the cron
 *     never throws into the scheduler unless `makeRetentionCron` itself
 *     does (which it doesn't for the wrapped sweep).
 *   - Promotion writes proposal-row + audit-row only; the graph
 *     mutation step is still operator-gated downstream.
 */

import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus,
  type TickRetentionCronOptions,
  type TickRetentionCronResult,
} from "../retention/make-retention-cron.js";
import {
  runAutoPromoteTick,
  type AutoPromoteTickResult,
  type RunAutoPromoteOptions,
} from "./auto-promote-orchestrator.js";

export interface AutoPromoteCronInput {
  readonly minConfidence?: number;
  readonly limit?: number;
  readonly proposedByAgentId?: number | null;
  readonly decisionRationale?: string;
  /**
   * Test seam — replace the underlying tick implementation. Production
   * omits this; production wires `runAutoPromoteTick` directly.
   */
  readonly runTick?: (
    opts: RunAutoPromoteOptions,
  ) => Promise<AutoPromoteTickResult>;
}

const cron = makeRetentionCron<AutoPromoteCronInput, AutoPromoteTickResult>({
  logPrefix: "ags-semantic-enrichment-auto-promote-cron",
  envPrefix: "AGS_SEMANTIC_ENRICHMENT_AUTO_PROMOTE",
  defaultCronExpr: "*/15 * * * *",
  defaultRetentionDays: null,
  buildSweepInput: ({ sweepInput }) => sweepInput ?? {},
  runSweep: async (input) => {
    const runTick = input.runTick ?? runAutoPromoteTick;
    return await runTick({
      ...(input.minConfidence !== undefined
        ? { minConfidence: input.minConfidence }
        : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.proposedByAgentId !== undefined
        ? { proposedByAgentId: input.proposedByAgentId }
        : {}),
      ...(input.decisionRationale !== undefined
        ? { decisionRationale: input.decisionRationale }
        : {}),
    });
  },
  formatSweepLogTail: (r) =>
    `inspected=${r.inspected} promoted=${r.promoted} skippedPromoted=${r.skippedAlreadyPromoted} skippedNotPromotable=${r.skippedNotPromotable} skippedNotFound=${r.skippedNotFound} failed=${r.failed}`,
  formatStartupLogTail: () => "scope=high-confidence-pending",
});

export const DEFAULT_AUTO_PROMOTE_CRON_EXPR = cron.DEFAULT_CRON_EXPR;

export type TickAutoPromoteCronOptions = TickRetentionCronOptions<
  AutoPromoteCronInput,
  AutoPromoteTickResult
>;
export type TickAutoPromoteCronResult =
  TickRetentionCronResult<AutoPromoteTickResult>;
export type AutoPromoteCronEnsureState =
  RetentionCronEnsureState<AutoPromoteTickResult>;
export type AutoPromoteCronStatus = RetentionCronStatus<AutoPromoteTickResult>;

export const tickAutoPromoteCron = cron.tick;
export const getAutoPromoteCronStatus = cron.getStatus;
export const ensureAutoPromoteCronStarted = cron.ensureStarted;
export const _resetAutoPromoteCronForTests = cron.resetForTests;
