/**
 * Graph Agent Lite — explain (Why-This-Answer) reader.
 *
 * Phase 13 §3. Read side of the decision-trace ledger written by
 * §2. Projects `ags_graph_agent_runs` + `ags_graph_agent_steps` into
 * the operator-facing "why did this answer happen" shape consumed by
 * `agentStudio.graphAgent.explain` and downstream UIs.
 *
 * Input is the TOP-LEVEL `agsRuntimeRuns.id` (the same `runId` the
 * engine returns in `GraphAgentAnswer`). The reader looks up the
 * corresponding graph-agent run row via `runtime_run_id` and joins
 * the step ledger.
 *
 * Failure modes:
 *   - ASDB unavailable → `null` (degrade-silently). The router maps
 *     a null result to a `NOT_FOUND`-shaped response.
 *   - Top-level runId has no graph-agent run row → `null`. Operator
 *     ran the agent before §2 shipped, or the engine wasn't wired
 *     with the decision-trace adapter.
 */

import { and, asc, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphAgentRuns,
  agsGraphAgentSteps,
} from "../../../../drizzle/tables/agent-studio-graph-agent.js";

export interface GraphAgentExplanationStep {
  readonly stepIndex: number;
  readonly stepKind: string;
  readonly stepInput: Record<string, unknown> | null;
  readonly stepOutput: Record<string, unknown> | null;
  readonly durationMs: number | null;
  readonly createdAt: Date;
}

export interface GraphAgentExplanation {
  readonly runtimeRunId: number;
  readonly graphAgentRunId: number;
  readonly agentKey: string;
  readonly userQuery: string;
  readonly status: string;
  readonly durationMs: number | null;
  readonly errorMessage: string | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly steps: GraphAgentExplanationStep[];
}

export interface GetExplanationOptions {
  readonly getDb?: typeof getAsDb;
  /**
   * Phase 14 §7 — when set, restricts the explain read to runs owned
   * by this user (`ags_graph_agent_runs.user_id === actorUserId`).
   * Mismatched-owner runs read as "not found" (returns `null`),
   * matching the existing API for missing rows. Callers with admin
   * privileges (or other roles that legitimately need cross-user
   * visibility) leave this undefined to bypass the filter. The tRPC
   * layer is responsible for that policy decision; this reader only
   * applies the filter when asked.
   */
  readonly actorUserId?: number;
}

export async function getExplanationForRun(
  runtimeRunId: number,
  options: GetExplanationOptions = {},
): Promise<GraphAgentExplanation | null> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return null;

  const runWhere =
    options.actorUserId !== undefined
      ? and(
          eq(agsGraphAgentRuns.runtimeRunId, runtimeRunId),
          eq(agsGraphAgentRuns.userId, options.actorUserId),
        )
      : eq(agsGraphAgentRuns.runtimeRunId, runtimeRunId);

  const runRows = await db
    .select({
      id: agsGraphAgentRuns.id,
      agentKey: agsGraphAgentRuns.agentKey,
      userQuery: agsGraphAgentRuns.userQuery,
      status: agsGraphAgentRuns.status,
      durationMs: agsGraphAgentRuns.durationMs,
      errorMessage: agsGraphAgentRuns.errorMessage,
      startedAt: agsGraphAgentRuns.startedAt,
      completedAt: agsGraphAgentRuns.completedAt,
    })
    .from(agsGraphAgentRuns)
    .where(runWhere)
    .limit(1);

  if (runRows.length === 0) return null;
  const run = runRows[0];

  const stepRows = await db
    .select({
      stepIndex: agsGraphAgentSteps.stepIndex,
      stepKind: agsGraphAgentSteps.stepKind,
      stepInput: agsGraphAgentSteps.stepInput,
      stepOutput: agsGraphAgentSteps.stepOutput,
      durationMs: agsGraphAgentSteps.durationMs,
      createdAt: agsGraphAgentSteps.createdAt,
    })
    .from(agsGraphAgentSteps)
    .where(eq(agsGraphAgentSteps.runId, run.id))
    .orderBy(asc(agsGraphAgentSteps.stepIndex));

  return {
    runtimeRunId,
    graphAgentRunId: run.id,
    agentKey: run.agentKey,
    userQuery: run.userQuery,
    status: run.status,
    durationMs: run.durationMs,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt as Date,
    completedAt: (run.completedAt as Date | null) ?? null,
    steps: stepRows.map((s) => ({
      stepIndex: s.stepIndex,
      stepKind: s.stepKind,
      stepInput: s.stepInput,
      stepOutput: s.stepOutput,
      durationMs: s.durationMs,
      createdAt: s.createdAt as Date,
    })),
  };
}
