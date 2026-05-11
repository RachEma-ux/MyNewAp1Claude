/**
 * Native Graph Workspace — runtime graph event translator.
 *
 * Phase 14 §6/§7 infrastructure. Pure function bridge between the
 * `ags_runtime_graph_events` intent rows (Postgres-authoritative) and
 * the `ProjectionWrite[]` shape consumed by `GraphRepository.applyProjectionJob`.
 *
 * The Phase 7.5 worker pipeline will:
 *   1. SELECT pending rows from `ags_runtime_graph_events`
 *   2. For each row, call `translateRuntimeGraphEvent(row)` (this file)
 *   3. Pass the resulting writes to `repository.applyProjectionJob(writes)`
 *   4. On success, call `markEventApplied(row.id, neo4jRefs)`
 *   5. On failure, call `markEventFailed(row.id, errorMessage)`
 *
 * The translator is intentionally I/O-free. Edges that require fetching
 * downstream rows (decision-trace steps, skill-pack usages, CAG block
 * references, note-version references) are produced by separate
 * "expander" functions that take the pre-fetched rows. Keeping this file
 * pure makes the trace→graph shape contract auditable and testable.
 *
 * Neo4j projection grammar (from the roadmap):
 *   (:RuntimeTrace)-[:HAS_DECISION_TRACE]->(:DecisionTrace)
 *   (:DecisionTrace)-[:HAS_STEP]->(:DecisionTraceStep)
 *   (:RuntimeTrace)-[:USED_GRAPH_SKILL]->(:GraphSkillPack)
 *   (:RuntimeTrace)-[:USED_CAG_BLOCK]->(:CAGBlock)
 *   (:RuntimeTrace)-[:REFERENCES_NOTE_VERSION]->(:NoteVersion)
 *
 * This PR ships the head shapes (RuntimeTrace node, DecisionTrace node +
 * HAS_DECISION_TRACE edge). The remaining edge expanders land in a
 * follow-up PR once the worker is wired.
 *
 * ADR: docs/architecture/agent-studio-graph-projection-sync.md
 */

import type {
  ProjectionWrite,
  ProvenanceFields,
} from "../graph/repository/types.js";
import type { RuntimeGraphEvent } from "./projection-events.js";

function provenance(
  sourceType: string,
  sourceId: string,
  lineageStatus: ProvenanceFields["lineageStatus"] = "derived",
): ProvenanceFields {
  return {
    sourceType,
    sourceId,
    lineageStatus,
    governanceStatus: "active",
  };
}

function runtimeTraceNodeId(runtimeRunId: number): string {
  return `runtime_trace:${runtimeRunId}`;
}

function decisionTraceNodeId(graphAgentRunId: number): string {
  return `decision_trace:${graphAgentRunId}`;
}

/**
 * Translates a `runtime_trace` intent row into the head projection
 * writes — the (:RuntimeTrace) node only. Skill-pack / CAG / note
 * edges are produced by separate expander functions that read
 * `ags_graph_skill_runtime_usages`, `ags_runtime_note_references`,
 * etc.
 */
export function translateRuntimeTraceIntent(
  event: RuntimeGraphEvent,
): ProjectionWrite[] {
  if (event.eventKind !== "runtime_trace") {
    throw new Error(
      `translateRuntimeTraceIntent called with eventKind=${event.eventKind}`,
    );
  }
  const payload = event.payload as {
    status?: string;
    durationMs?: number;
    errorReason?: string | null;
  };
  return [
    {
      kind: "upsert_node",
      node: {
        typeKey: "RuntimeTrace",
        id: runtimeTraceNodeId(event.runtimeRunId),
        sourceId: String(event.runtimeRunId),
        properties: {
          status: payload.status ?? null,
          durationMs: payload.durationMs ?? null,
          errorReason: payload.errorReason ?? null,
        },
        provenance: provenance("runtime_run", String(event.runtimeRunId)),
      },
    },
  ];
}

/**
 * Translates a `decision_trace` intent row into the head projection
 * writes — the (:DecisionTrace) node plus the
 * `(:RuntimeTrace)-[:HAS_DECISION_TRACE]->(:DecisionTrace)` edge. Step
 * nodes/edges are produced by a separate expander that reads
 * `ags_graph_agent_steps` for the run.
 */
export function translateDecisionTraceIntent(
  event: RuntimeGraphEvent,
): ProjectionWrite[] {
  if (event.eventKind !== "decision_trace") {
    throw new Error(
      `translateDecisionTraceIntent called with eventKind=${event.eventKind}`,
    );
  }
  if (event.graphAgentRunId === null) {
    throw new Error(
      "decision_trace intent must carry graphAgentRunId — orphan trace cannot project",
    );
  }
  const payload = event.payload as {
    agentKey?: string;
    status?: string;
    durationMs?: number;
    errorMessage?: string | null;
  };
  const decisionTraceId = decisionTraceNodeId(event.graphAgentRunId);
  const runtimeTraceId = runtimeTraceNodeId(event.runtimeRunId);

  const writes: ProjectionWrite[] = [
    {
      kind: "upsert_node",
      node: {
        typeKey: "DecisionTrace",
        id: decisionTraceId,
        sourceId: String(event.graphAgentRunId),
        properties: {
          agentKey: payload.agentKey ?? null,
          status: payload.status ?? null,
          durationMs: payload.durationMs ?? null,
          errorMessage: payload.errorMessage ?? null,
        },
        provenance: provenance("graph_agent_run", String(event.graphAgentRunId)),
      },
    },
    {
      kind: "upsert_edge",
      edge: {
        typeKey: "HAS_DECISION_TRACE",
        id: `has_decision_trace:${event.runtimeRunId}:${event.graphAgentRunId}`,
        sourceNode: { typeKey: "RuntimeTrace", id: runtimeTraceId },
        targetNode: { typeKey: "DecisionTrace", id: decisionTraceId },
        properties: {},
        provenance: provenance(
          "graph_agent_run",
          `${event.runtimeRunId}:${event.graphAgentRunId}`,
        ),
      },
    },
  ];
  return writes;
}

/**
 * Dispatcher — pick the right translator based on the event kind. The
 * Phase 7.5 worker calls this; anything bespoke at the worker layer
 * (e.g. fetching steps) layers on top via expanders.
 */
export function translateRuntimeGraphEvent(
  event: RuntimeGraphEvent,
): ProjectionWrite[] {
  switch (event.eventKind) {
    case "runtime_trace":
      return translateRuntimeTraceIntent(event);
    case "decision_trace":
      return translateDecisionTraceIntent(event);
    default: {
      const exhaustive: never = event.eventKind;
      throw new Error(`Unknown runtime graph event kind: ${exhaustive}`);
    }
  }
}
