/**
 * Graph Quality Agent Runs — retention sweep service.
 *
 * Phase 22 follow-up #665. The `ags_graph_quality_agent_runs` table
 * accumulates one row per autonomous graph-quality agent invocation
 * (the agent that produces graph-correction proposals from quality
 * scan findings). It is the sibling of `ags_graph_quality_scans`
 * (#657 prune) on the same domain, but at a different layer:
 *   - scans = individual scanner executions (orphan-detector,
 *     broken-citation-detector, …)
 *   - agent runs = orchestrated agent that consumes scan output and
 *     proposes corrections
 *
 * Schema (drizzle/tables/agent-studio-graph-quality.ts:84):
 *   id / agentKey / startedAt / completedAt / proposalsCreated /
 *   status / createdAt
 *
 * No FK children reference `ags_graph_quality_agent_runs` — proposals
 * created by the agent live in `ags_graph_correction_proposals`
 * (independently retained by mini-arc #661–#664) and reference back
 * to the originating scan, not to the agent-run row. So this prune
 * is single-table, simpler than the 2-table cascade pruners
 * (#649/#653/#657) and the 3-table cascade pruner (#661).
 *
 * Status vocabulary (agent-run.ts:207, agent-run.ts:280):
 *   - `running` — in-flight, never swept
 *   - `completed` — terminal, sweep-eligible
 *   - `failed` — terminal, sweep-eligible
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { getAsDb } from "../db/connection.js";
import { agsGraphQualityAgentRuns } from "../../../drizzle/tables/agent-studio-graph-quality.js";

export type GraphQualityAgentRunStatus = "running" | "completed" | "failed";

/** Default terminal statuses pruned by a sweep. */
const DEFAULT_TERMINAL_STATUSES: readonly GraphQualityAgentRunStatus[] = [
  "completed",
  "failed",
];

const ZERO_RESULT: PruneOldGraphQualityAgentRunsResult = {
  deletedAgentRunsCount: 0,
};

export interface PruneOldGraphQualityAgentRunsInput {
  /** Cutoff — agent runs with `createdAt < olderThan` are eligible. */
  readonly olderThan: Date;
  /**
   * Restrict to these terminal statuses. Default:
   * `["completed", "failed"]`. `running` is never swept — those are
   * in-flight.
   *
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly statuses?: readonly GraphQualityAgentRunStatus[];
  /**
   * Restrict to one agent key (`eq`) or a set (`inArray`). `agentKey`
   * defaults to `"graph_quality_agent"` for the primary agent; future
   * sibling agents (e.g. policy-check, freshness-audit) would share
   * this table with different keys. Empty array short-circuits
   * BEFORE the ASDB probe.
   */
  readonly agentKey?: string | readonly string[];
}

export interface PruneOldGraphQualityAgentRunsResult {
  readonly deletedAgentRunsCount: number;
}

export interface PruneOldGraphQualityAgentRunsOptions {
  readonly getDb?: typeof getAsDb;
}

export async function pruneOldGraphQualityAgentRuns(
  input: PruneOldGraphQualityAgentRunsInput,
  options: PruneOldGraphQualityAgentRunsOptions = {},
): Promise<PruneOldGraphQualityAgentRunsResult> {
  if (Array.isArray(input.statuses) && input.statuses.length === 0) {
    return ZERO_RESULT;
  }
  if (Array.isArray(input.agentKey) && input.agentKey.length === 0) {
    return ZERO_RESULT;
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return ZERO_RESULT;

  const statuses = input.statuses ?? DEFAULT_TERMINAL_STATUSES;
  const filters = [
    lt(agsGraphQualityAgentRuns.createdAt, input.olderThan),
    inArray(
      agsGraphQualityAgentRuns.status,
      statuses as GraphQualityAgentRunStatus[],
    ),
  ];
  const agentKeyInput = input.agentKey;
  if (agentKeyInput !== undefined) {
    if (Array.isArray(agentKeyInput)) {
      filters.push(inArray(agsGraphQualityAgentRuns.agentKey, agentKeyInput));
    } else {
      filters.push(
        eq(agsGraphQualityAgentRuns.agentKey, agentKeyInput as string),
      );
    }
  }

  const candidates = await db
    .select({ id: agsGraphQualityAgentRuns.id })
    .from(agsGraphQualityAgentRuns)
    .where(and(...filters));

  if (candidates.length === 0) {
    return ZERO_RESULT;
  }

  const ids = candidates.map((r) => Number(r.id));

  const deleted = await db
    .delete(agsGraphQualityAgentRuns)
    .where(inArray(agsGraphQualityAgentRuns.id, ids))
    .returning({ id: agsGraphQualityAgentRuns.id });

  return { deletedAgentRunsCount: deleted.length };
}
