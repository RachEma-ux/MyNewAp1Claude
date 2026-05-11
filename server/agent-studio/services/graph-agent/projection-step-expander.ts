/**
 * Native Graph Workspace — decision-trace step expander.
 *
 * Phase 14 §6/§7 infrastructure. Companion to the projection-event
 * translator (PR #466). Where the translator emits the head shapes
 * (RuntimeTrace / DecisionTrace nodes + HAS_DECISION_TRACE edge), the
 * step expander emits the per-step nodes + edges:
 *
 *   (:DecisionTrace {id})-[:HAS_STEP]->(:DecisionTraceStep {runId, stepIndex})
 *
 * Split into two surfaces:
 *
 *   1. `expandDecisionTraceSteps(graphAgentRunId, rows)` — PURE. Takes
 *      pre-fetched step rows and emits ProjectionWrite[]. Testable in
 *      isolation; matches the i/o-free translator pattern.
 *
 *   2. `loadDecisionTraceStepsForRun(graphAgentRunId, options)` — ASDB
 *      reader. Fetches step rows for a run, ordered by stepIndex. The
 *      Phase 7.5 worker calls this then pipes the rows into `expand*`.
 *
 * Keeping the pure shape separate from the DB-reading shape mirrors the
 * `recordTraceProjectionIntent` ↔ `translateRuntimeGraphEvent`
 * separation in PR #463/#466.
 *
 * ADR: docs/architecture/agent-studio-graph-projection-sync.md
 */

import { asc, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsGraphAgentSteps } from "../../../../drizzle/tables/agent-studio-graph-agent.js";
import type {
  ProjectionWrite,
  ProvenanceFields,
} from "../graph/repository/types.js";

export interface DecisionTraceStepRow {
  readonly id: number;
  readonly runId: number;
  readonly stepIndex: number;
  readonly stepKind: string;
  readonly durationMs: number | null;
}

function provenance(
  sourceType: string,
  sourceId: string,
): ProvenanceFields {
  return {
    sourceType,
    sourceId,
    lineageStatus: "derived",
    governanceStatus: "active",
  };
}

function decisionTraceNodeId(graphAgentRunId: number): string {
  return `decision_trace:${graphAgentRunId}`;
}

function stepNodeId(runId: number, stepIndex: number): string {
  return `decision_trace_step:${runId}:${stepIndex}`;
}

/**
 * Pure function. Emits the per-step (:DecisionTraceStep) nodes plus the
 * (:DecisionTrace)-[:HAS_STEP]->(:DecisionTraceStep) edges for a run.
 *
 * Caller is responsible for fetching the rows from
 * `ags_graph_agent_steps` (see `loadDecisionTraceStepsForRun`).
 */
export function expandDecisionTraceSteps(
  graphAgentRunId: number,
  rows: readonly DecisionTraceStepRow[],
): ProjectionWrite[] {
  const decisionTraceId = decisionTraceNodeId(graphAgentRunId);
  const writes: ProjectionWrite[] = [];

  for (const row of rows) {
    const stepId = stepNodeId(row.runId, row.stepIndex);
    writes.push({
      kind: "upsert_node",
      node: {
        typeKey: "DecisionTraceStep",
        id: stepId,
        sourceId: String(row.id),
        properties: {
          runId: row.runId,
          stepIndex: row.stepIndex,
          stepKind: row.stepKind,
          durationMs: row.durationMs,
        },
        provenance: provenance("graph_agent_step", String(row.id)),
      },
    });
    writes.push({
      kind: "upsert_edge",
      edge: {
        typeKey: "HAS_STEP",
        id: `has_step:${row.runId}:${row.stepIndex}`,
        sourceNode: { typeKey: "DecisionTrace", id: decisionTraceId },
        targetNode: { typeKey: "DecisionTraceStep", id: stepId },
        properties: { stepIndex: row.stepIndex },
        provenance: provenance(
          "graph_agent_step",
          `${row.runId}:${row.stepIndex}`,
        ),
      },
    });
  }
  return writes;
}

export interface LoadDecisionTraceStepsOptions {
  readonly getDb?: typeof getAsDb;
}

/**
 * Reader companion. Returns step rows for a run ordered by stepIndex
 * ascending so the expander emits a stable graph shape. Returns an
 * empty array if ASDB is unavailable — callers (the Phase 7.5 worker)
 * decide whether to retry or skip.
 */
export async function loadDecisionTraceStepsForRun(
  graphAgentRunId: number,
  options: LoadDecisionTraceStepsOptions = {},
): Promise<readonly DecisionTraceStepRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: agsGraphAgentSteps.id,
      runId: agsGraphAgentSteps.runId,
      stepIndex: agsGraphAgentSteps.stepIndex,
      stepKind: agsGraphAgentSteps.stepKind,
      durationMs: agsGraphAgentSteps.durationMs,
    })
    .from(agsGraphAgentSteps)
    .where(eq(agsGraphAgentSteps.runId, graphAgentRunId))
    .orderBy(asc(agsGraphAgentSteps.stepIndex));

  return rows as readonly DecisionTraceStepRow[];
}
