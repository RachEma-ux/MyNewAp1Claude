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

export class GraphAgentDecisionTraceUnavailableError extends Error {
  constructor() {
    super("ASDB unavailable — cannot write graph-agent decision trace");
    this.name = "GraphAgentDecisionTraceUnavailableError";
  }
}

export interface CreateGraphAgentDecisionTraceWriterOptions {
  readonly getDb?: typeof getAsDb;
}

export function createGraphAgentDecisionTraceWriter(
  options: CreateGraphAgentDecisionTraceWriterOptions = {},
): GraphAgentDecisionTraceAdapter {
  const getDb = options.getDb ?? getAsDb;

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
      await db()
        .update(agsGraphAgentRuns)
        .set({
          status: input.status,
          completedAt: new Date(),
          durationMs: input.durationMs,
          errorMessage: input.errorMessage ?? null,
        })
        .where(eq(agsGraphAgentRuns.id, input.graphAgentRunId));
    },
  };
}
