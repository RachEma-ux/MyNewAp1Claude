/**
 * Native Graph Workspace — runtime-trace retention service.
 *
 * Phase 14 §3. Operator-triggered prune of the trace ledgers that
 * Phase 12.5 §4-§14 and Phase 13 §2 populate:
 *
 *   - `ags_graph_skill_runtime_usages` (usage rows per Skill Pack
 *     execution)
 *   - `ags_query_template_runs` (audit rows per Cypher template
 *     execution)
 *   - `ags_graph_agent_steps` (decision-trace step rows)
 *   - `ags_graph_agent_runs` (decision-trace run rows)
 *
 * The order matters — children before parents — because
 * `agsGraphAgentSteps.runId` FKs `agsGraphAgentRuns.id`.
 *
 * The service is a "policy" only in the sense that it accepts a
 * caller-supplied horizon in milliseconds and deletes rows whose
 * `createdAt` is older than `now - olderThanMs`. The shared retention-
 * cron factory (`services/retention/make-retention-cron.ts`) is the
 * scheduling path; see `graph-agent-runtime-traces-retention-cron.ts`
 * for the nightly composition.
 *
 * Failure mode: ASDB unavailable → returns an empty summary
 * (degrade-silently). Operator UIs can show "ASDB not connected"
 * separately; the prune itself never throws.
 *
 * ADR: docs/architecture/agent-studio-graph-agent-runtime.md §1.6
 */

import { lt } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphSkillRuntimeUsages,
  agsQueryTemplateRuns,
} from "../../../../drizzle/tables/agent-studio-graph-skill.js";
import {
  agsGraphAgentRuns,
  agsGraphAgentSteps,
} from "../../../../drizzle/tables/agent-studio-graph-agent.js";

const MIN_HORIZON_MS = 60_000; // 1 minute — guardrail against `olderThanMs: 0`
const DEFAULT_HORIZON_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export interface RetentionPruneSummary {
  readonly cutoff: Date;
  readonly graphSkillRuntimeUsages: number;
  readonly queryTemplateRuns: number;
  readonly graphAgentSteps: number;
  readonly graphAgentRuns: number;
}

export interface PruneRuntimeTraceOptions {
  readonly olderThanMs?: number;
  readonly getDb?: typeof getAsDb;
  /** Override "now" for tests. */
  readonly nowMs?: number;
}

const EMPTY_SUMMARY = (cutoff: Date): RetentionPruneSummary => ({
  cutoff,
  graphSkillRuntimeUsages: 0,
  queryTemplateRuns: 0,
  graphAgentSteps: 0,
  graphAgentRuns: 0,
});

export async function pruneRuntimeTraces(
  options: PruneRuntimeTraceOptions = {},
): Promise<RetentionPruneSummary> {
  const getDb = options.getDb ?? getAsDb;
  const nowMs = options.nowMs ?? Date.now();
  const horizonMs = Math.max(
    options.olderThanMs ?? DEFAULT_HORIZON_MS,
    MIN_HORIZON_MS,
  );
  const cutoff = new Date(nowMs - horizonMs);

  const db = getDb();
  if (!db) return EMPTY_SUMMARY(cutoff);

  // Independent child tables first (they don't FK each other), then
  // the graph-agent step + run pair which DOES FK.
  const usageDeleted = await db
    .delete(agsGraphSkillRuntimeUsages)
    .where(lt(agsGraphSkillRuntimeUsages.createdAt, cutoff))
    .returning({ id: agsGraphSkillRuntimeUsages.id });

  const templateRunsDeleted = await db
    .delete(agsQueryTemplateRuns)
    .where(lt(agsQueryTemplateRuns.createdAt, cutoff))
    .returning({ id: agsQueryTemplateRuns.id });

  // Steps must go before runs (FK from steps.runId → runs.id).
  const stepsDeleted = await db
    .delete(agsGraphAgentSteps)
    .where(lt(agsGraphAgentSteps.createdAt, cutoff))
    .returning({ id: agsGraphAgentSteps.id });

  const runsDeleted = await db
    .delete(agsGraphAgentRuns)
    .where(lt(agsGraphAgentRuns.createdAt, cutoff))
    .returning({ id: agsGraphAgentRuns.id });

  return {
    cutoff,
    graphSkillRuntimeUsages: usageDeleted.length,
    queryTemplateRuns: templateRunsDeleted.length,
    graphAgentSteps: stepsDeleted.length,
    graphAgentRuns: runsDeleted.length,
  };
}
