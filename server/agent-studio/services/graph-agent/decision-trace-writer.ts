/**
 * Graph Agent Lite — ASDB-backed decision-trace writer.
 *
 * Phase 13 §2. Implements the `GraphAgentDecisionTraceAdapter` port
 * defined on the engine. Writes one row to `ags_graph_agent_runs` per
 * call, one row to `ags_graph_agent_steps` per engine phase, and
 * updates the run row with `completed`/`failed` + duration on
 * finalize.
 *
 * Throws when ASDB is unavailable. The engine itself does not swallow
 * these (decision-trace writes are operator-actionable — silently
 * dropping a trace row means a permanently un-explainable run). The
 * wiring layer (where this writer is constructed) is responsible for
 * deciding whether to skip the adapter entirely when ASDB is down.
 *
 * ADR: docs/architecture/agent-studio-graph-agent-runtime.md §1.3
 */

import { eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphAgentRuns,
  agsGraphAgentSteps,
} from "../../../../drizzle/tables/agent-studio-graph-agent.js";
import type { GraphAgentDecisionTraceAdapter } from "./engine.js";
import { recordTraceProjectionIntent } from "./projection-events.js";

export class GraphAgentDecisionTraceUnavailableError extends Error {
  constructor() {
    super("ASDB unavailable — cannot write graph-agent decision trace");
    this.name = "GraphAgentDecisionTraceUnavailableError";
  }
}

export interface CreateGraphAgentDecisionTraceWriterOptions {
  readonly getDb?: typeof getAsDb;
  /**
   * Phase 14 §6/§7. When set, the writer records a `decision_trace`
   * projection intent into `ags_runtime_graph_events` on finalize so a
   * future Phase 7.5 Neo4j worker can project the trace into the graph.
   * Defaults to true; tests pass `false` to keep the writer focused on
   * the run/step rows.
   */
  readonly recordProjectionIntent?: boolean;
  /** Test seam for the projection-intent writer (defaults to the real one). */
  readonly projectionIntentWriter?: typeof recordTraceProjectionIntent;
}

export function createGraphAgentDecisionTraceWriter(
  options: CreateGraphAgentDecisionTraceWriterOptions = {},
): GraphAgentDecisionTraceAdapter {
  const getDb = options.getDb ?? getAsDb;
  const projectionIntentEnabled = options.recordProjectionIntent !== false;
  const projectionIntentWriter =
    options.projectionIntentWriter ?? recordTraceProjectionIntent;

  function db() {
    const handle = getDb();
    if (!handle) throw new GraphAgentDecisionTraceUnavailableError();
    return handle;
  }

  return {
    async startGraphAgentRun(input) {
      const inserted = await db()
        .insert(agsGraphAgentRuns)
        .values({
          agentKey: input.agentKey,
          userId: input.userId ?? null,
          workspaceId: input.workspaceId ?? null,
          userQuery: input.userQuery,
          runtimeRunId: input.runtimeRunId ?? null,
          status: "planning",
        })
        .returning({ id: agsGraphAgentRuns.id });
      return { graphAgentRunId: inserted[0].id };
    },

    async recordStep(input) {
      await db()
        .insert(agsGraphAgentSteps)
        .values({
          runId: input.graphAgentRunId,
          stepIndex: input.stepIndex,
          stepKind: input.stepKind,
          stepInput: input.stepInput ?? null,
          stepOutput: input.stepOutput ?? null,
          durationMs: input.durationMs ?? null,
        });
    },

    async finalizeGraphAgentRun(input) {
      const updated = await db()
        .update(agsGraphAgentRuns)
        .set({
          status: input.status,
          completedAt: new Date(),
          durationMs: input.durationMs,
          errorMessage: input.errorMessage ?? null,
        })
        .where(eq(agsGraphAgentRuns.id, input.graphAgentRunId))
        .returning({
          id: agsGraphAgentRuns.id,
          agentKey: agsGraphAgentRuns.agentKey,
          runtimeRunId: agsGraphAgentRuns.runtimeRunId,
        });

      if (!projectionIntentEnabled) return;
      const row = updated[0];
      if (!row?.runtimeRunId) return;

      // Phase 14 §6/§7 — record the Postgres-side projection intent. The
      // worker (Phase 7.5) drains pending rows and writes the graph
      // nodes/edges to Neo4j. We don't materialise step rows in the
      // payload; the worker SELECTs them when draining. A failed insert
      // here is non-fatal — the decision-trace row itself has already
      // landed; a backfill job can re-derive intent rows from
      // `ags_graph_agent_runs` if needed.
      try {
        await projectionIntentWriter(
          {
            eventKind: "decision_trace",
            runtimeRunId: row.runtimeRunId,
            graphAgentRunId: row.id,
            payload: {
              agentKey: row.agentKey,
              status: input.status,
              durationMs: input.durationMs,
              errorMessage: input.errorMessage ?? null,
            },
          },
          { getDb },
        );
      } catch {
        // Swallow — projection-intent is bookkeeping; the authoritative
        // run row is already persisted.
      }
    },
  };
}
