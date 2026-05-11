/**
 * Phase 14 §6/§7 — runtime graph event translator tests.
 *
 * Pure-function unit tests. Verifies the intent-row → ProjectionWrite[]
 * shape contract used by the future Phase 7.5 Neo4j worker.
 */

import { describe, it, expect } from "vitest";
import {
  translateRuntimeGraphEvent,
  translateRuntimeTraceIntent,
  translateDecisionTraceIntent,
} from "../../server/agent-studio/services/graph-agent/projection-event-translator";
import type { RuntimeGraphEvent } from "../../server/agent-studio/services/graph-agent/projection-events";

function makeEvent(
  overrides: Partial<RuntimeGraphEvent> & {
    eventKind: RuntimeGraphEvent["eventKind"];
    runtimeRunId: number;
  },
): RuntimeGraphEvent {
  return {
    id: 1,
    eventKind: overrides.eventKind,
    runtimeRunId: overrides.runtimeRunId,
    graphAgentRunId: overrides.graphAgentRunId ?? null,
    payload: overrides.payload ?? {},
    applied: false,
    neo4jRefs: null,
    appliedAt: null,
    lastError: null,
    createdAt: new Date("2026-05-11T12:00:00Z"),
  };
}

describe("translateRuntimeTraceIntent — Phase 14 §6/§7", () => {
  it("emits a (:RuntimeTrace) upsert_node with stable id", () => {
    const writes = translateRuntimeTraceIntent(
      makeEvent({
        eventKind: "runtime_trace",
        runtimeRunId: 42,
        payload: { status: "completed", durationMs: 1234, errorReason: null },
      }),
    );
    expect(writes).toHaveLength(1);
    expect(writes[0].kind).toBe("upsert_node");
    expect(writes[0].node?.typeKey).toBe("RuntimeTrace");
    expect(writes[0].node?.id).toBe("runtime_trace:42");
    expect(writes[0].node?.sourceId).toBe("42");
  });

  it("carries status + durationMs + errorReason into node properties", () => {
    const writes = translateRuntimeTraceIntent(
      makeEvent({
        eventKind: "runtime_trace",
        runtimeRunId: 7,
        payload: { status: "failed", durationMs: 99, errorReason: "boom" },
      }),
    );
    expect(writes[0].node?.properties).toMatchObject({
      status: "failed",
      durationMs: 99,
      errorReason: "boom",
    });
  });

  it("uses lineageStatus=derived (runtime trace is computed)", () => {
    const writes = translateRuntimeTraceIntent(
      makeEvent({
        eventKind: "runtime_trace",
        runtimeRunId: 7,
        payload: {},
      }),
    );
    expect(writes[0].node?.provenance.lineageStatus).toBe("derived");
    expect(writes[0].node?.provenance.sourceType).toBe("runtime_run");
    expect(writes[0].node?.provenance.governanceStatus).toBe("active");
  });

  it("throws when eventKind does not match", () => {
    expect(() =>
      translateRuntimeTraceIntent(
        makeEvent({
          eventKind: "decision_trace",
          runtimeRunId: 1,
          graphAgentRunId: 2,
          payload: {},
        }),
      ),
    ).toThrow();
  });
});

describe("translateDecisionTraceIntent — Phase 14 §6/§7", () => {
  it("emits (:DecisionTrace) node + HAS_DECISION_TRACE edge", () => {
    const writes = translateDecisionTraceIntent(
      makeEvent({
        eventKind: "decision_trace",
        runtimeRunId: 42,
        graphAgentRunId: 555,
        payload: {
          agentKey: "graph_agent_lite",
          status: "completed",
          durationMs: 1234,
          errorMessage: null,
        },
      }),
    );
    expect(writes).toHaveLength(2);

    const nodeWrite = writes.find((w) => w.kind === "upsert_node");
    const edgeWrite = writes.find((w) => w.kind === "upsert_edge");
    expect(nodeWrite).toBeDefined();
    expect(edgeWrite).toBeDefined();

    expect(nodeWrite!.node?.typeKey).toBe("DecisionTrace");
    expect(nodeWrite!.node?.id).toBe("decision_trace:555");
    expect(nodeWrite!.node?.sourceId).toBe("555");
    expect(nodeWrite!.node?.properties).toMatchObject({
      agentKey: "graph_agent_lite",
      status: "completed",
      durationMs: 1234,
      errorMessage: null,
    });

    expect(edgeWrite!.edge?.typeKey).toBe("HAS_DECISION_TRACE");
    expect(edgeWrite!.edge?.id).toBe("has_decision_trace:42:555");
    expect(edgeWrite!.edge?.sourceNode).toEqual({
      typeKey: "RuntimeTrace",
      id: "runtime_trace:42",
    });
    expect(edgeWrite!.edge?.targetNode).toEqual({
      typeKey: "DecisionTrace",
      id: "decision_trace:555",
    });
  });

  it("throws when graphAgentRunId is null (orphan decision trace cannot project)", () => {
    expect(() =>
      translateDecisionTraceIntent(
        makeEvent({
          eventKind: "decision_trace",
          runtimeRunId: 42,
          graphAgentRunId: null,
          payload: {},
        }),
      ),
    ).toThrow(/graphAgentRunId/);
  });

  it("throws when eventKind does not match", () => {
    expect(() =>
      translateDecisionTraceIntent(
        makeEvent({
          eventKind: "runtime_trace",
          runtimeRunId: 1,
          payload: {},
        }),
      ),
    ).toThrow();
  });

  it("uses lineageStatus=derived for both node + edge", () => {
    const writes = translateDecisionTraceIntent(
      makeEvent({
        eventKind: "decision_trace",
        runtimeRunId: 1,
        graphAgentRunId: 2,
        payload: {},
      }),
    );
    for (const w of writes) {
      const prov = w.node?.provenance ?? w.edge?.provenance;
      expect(prov?.lineageStatus).toBe("derived");
      expect(prov?.governanceStatus).toBe("active");
    }
  });
});

describe("translateRuntimeGraphEvent — dispatcher", () => {
  it("routes runtime_trace to translateRuntimeTraceIntent", () => {
    const writes = translateRuntimeGraphEvent(
      makeEvent({
        eventKind: "runtime_trace",
        runtimeRunId: 1,
        payload: { status: "completed", durationMs: 50, errorReason: null },
      }),
    );
    expect(writes[0].node?.typeKey).toBe("RuntimeTrace");
  });

  it("routes decision_trace to translateDecisionTraceIntent", () => {
    const writes = translateRuntimeGraphEvent(
      makeEvent({
        eventKind: "decision_trace",
        runtimeRunId: 1,
        graphAgentRunId: 2,
        payload: {},
      }),
    );
    expect(writes.find((w) => w.kind === "upsert_node")?.node?.typeKey).toBe(
      "DecisionTrace",
    );
    expect(writes.find((w) => w.kind === "upsert_edge")?.edge?.typeKey).toBe(
      "HAS_DECISION_TRACE",
    );
  });
});
