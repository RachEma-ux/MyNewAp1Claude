/**
 * Phase 14 §6/§7 — projection-intent drain orchestrator tests.
 *
 * Composes the head translator + every per-edge expander into a single
 * `ProjectionWrite[]` for a runtime graph event. Verifies the shape
 * contract a Phase 7.5 worker can rely on.
 */

import { describe, it, expect, vi } from "vitest";
import { buildProjectionWritesForEvent } from "../../server/agent-studio/services/graph-agent/projection-drain";
import type { RuntimeGraphEvent } from "../../server/agent-studio/services/graph-agent/projection-events";

function event(
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

describe("buildProjectionWritesForEvent — Phase 14 §6/§7 drain", () => {
  describe("runtime_trace", () => {
    it("composes RuntimeTrace head + skill-pack + note-version + cag-block writes", async () => {
      const loadSkillPackUsages = vi.fn(async () => [
        { packId: 1, skillKey: "a", packVersionId: 10, version: "1.0.0" },
      ]);
      const loadNoteReferences = vi.fn(async () => [
        { noteId: 1, noteVersionId: 100, referenceKind: "cag_block" },
      ]);
      const loadCagBlockUsages = vi.fn(async () => [
        { cagPackId: 7, packVersion: 1 },
      ]);

      const writes = await buildProjectionWritesForEvent(
        event({
          eventKind: "runtime_trace",
          runtimeRunId: 42,
          payload: { status: "completed", durationMs: 100, errorReason: null },
        }),
        {
          loaders: {
            loadSkillPackUsages,
            loadNoteReferences,
            loadCagBlockUsages,
            // step loader unused for runtime_trace, supply a throw-on-call sentinel
            loadDecisionTraceSteps: vi.fn(async () => {
              throw new Error("steps loader must not run for runtime_trace");
            }),
          },
        },
      );

      // 1 head node + 2 (skill pack node+edge) + 2 (note version node+edge) + 2 (cag block node+edge) = 7
      expect(writes).toHaveLength(7);

      const nodeTypes = writes
        .filter((w) => w.kind === "upsert_node")
        .map((w) => w.node?.typeKey);
      expect(nodeTypes).toContain("RuntimeTrace");
      expect(nodeTypes).toContain("GraphSkillPack");
      expect(nodeTypes).toContain("NoteVersion");
      expect(nodeTypes).toContain("CAGBlock");

      const edgeTypes = writes
        .filter((w) => w.kind === "upsert_edge")
        .map((w) => w.edge?.typeKey);
      expect(edgeTypes).toEqual(
        expect.arrayContaining([
          "USED_GRAPH_SKILL",
          "REFERENCES_NOTE_VERSION",
          "USED_CAG_BLOCK",
        ]),
      );

      // Loaders are called with the runtimeRunId, not the event id
      expect(loadSkillPackUsages).toHaveBeenCalledWith(42);
      expect(loadNoteReferences).toHaveBeenCalledWith(42);
      expect(loadCagBlockUsages).toHaveBeenCalledWith(42);
    });

    it("emits only the head when all expander loaders return empty arrays", async () => {
      const writes = await buildProjectionWritesForEvent(
        event({
          eventKind: "runtime_trace",
          runtimeRunId: 1,
          payload: {},
        }),
        {
          loaders: {
            loadSkillPackUsages: async () => [],
            loadNoteReferences: async () => [],
            loadCagBlockUsages: async () => [],
          },
        },
      );
      expect(writes).toHaveLength(1);
      expect(writes[0].node?.typeKey).toBe("RuntimeTrace");
    });

    it("does not call the step loader on runtime_trace", async () => {
      const loadDecisionTraceSteps = vi.fn(async () => []);
      await buildProjectionWritesForEvent(
        event({
          eventKind: "runtime_trace",
          runtimeRunId: 1,
          payload: {},
        }),
        {
          loaders: {
            loadDecisionTraceSteps,
            loadSkillPackUsages: async () => [],
            loadNoteReferences: async () => [],
            loadCagBlockUsages: async () => [],
          },
        },
      );
      expect(loadDecisionTraceSteps).not.toHaveBeenCalled();
    });
  });

  describe("decision_trace", () => {
    it("composes DecisionTrace head + HAS_DECISION_TRACE edge + per-step writes", async () => {
      const loadDecisionTraceSteps = vi.fn(async () => [
        {
          id: 1,
          runId: 555,
          stepIndex: 1,
          stepKind: "plan_retrieval_mode",
          durationMs: 5,
        },
        {
          id: 2,
          runId: 555,
          stepIndex: 2,
          stepKind: "retrieve",
          durationMs: 8,
        },
      ]);
      const writes = await buildProjectionWritesForEvent(
        event({
          eventKind: "decision_trace",
          runtimeRunId: 42,
          graphAgentRunId: 555,
          payload: {
            agentKey: "graph_agent_lite",
            status: "completed",
            durationMs: 100,
            errorMessage: null,
          },
        }),
        { loaders: { loadDecisionTraceSteps } },
      );

      // head: 1 DecisionTrace node + 1 HAS_DECISION_TRACE edge
      // steps: 2 step nodes + 2 HAS_STEP edges
      // = 6 total
      expect(writes).toHaveLength(6);

      const decisionTraceNode = writes.find(
        (w) => w.kind === "upsert_node" && w.node?.typeKey === "DecisionTrace",
      );
      expect(decisionTraceNode).toBeDefined();

      const hasDecisionTraceEdge = writes.find(
        (w) =>
          w.kind === "upsert_edge" && w.edge?.typeKey === "HAS_DECISION_TRACE",
      );
      expect(hasDecisionTraceEdge).toBeDefined();

      const stepNodes = writes.filter(
        (w) =>
          w.kind === "upsert_node" && w.node?.typeKey === "DecisionTraceStep",
      );
      expect(stepNodes).toHaveLength(2);

      const hasStepEdges = writes.filter(
        (w) => w.kind === "upsert_edge" && w.edge?.typeKey === "HAS_STEP",
      );
      expect(hasStepEdges).toHaveLength(2);

      expect(loadDecisionTraceSteps).toHaveBeenCalledWith(555);
    });

    it("emits only the head + HAS_DECISION_TRACE edge when there are no steps", async () => {
      const writes = await buildProjectionWritesForEvent(
        event({
          eventKind: "decision_trace",
          runtimeRunId: 1,
          graphAgentRunId: 2,
          payload: {},
        }),
        { loaders: { loadDecisionTraceSteps: async () => [] } },
      );
      expect(writes).toHaveLength(2);
      expect(writes[0].kind).toBe("upsert_node");
      expect(writes[1].kind).toBe("upsert_edge");
    });

    it("does not call runtime-trace loaders on decision_trace", async () => {
      const loadSkillPackUsages = vi.fn(async () => []);
      const loadNoteReferences = vi.fn(async () => []);
      const loadCagBlockUsages = vi.fn(async () => []);
      await buildProjectionWritesForEvent(
        event({
          eventKind: "decision_trace",
          runtimeRunId: 1,
          graphAgentRunId: 2,
          payload: {},
        }),
        {
          loaders: {
            loadDecisionTraceSteps: async () => [],
            loadSkillPackUsages,
            loadNoteReferences,
            loadCagBlockUsages,
          },
        },
      );
      expect(loadSkillPackUsages).not.toHaveBeenCalled();
      expect(loadNoteReferences).not.toHaveBeenCalled();
      expect(loadCagBlockUsages).not.toHaveBeenCalled();
    });
  });

  it("propagates loader errors so the Phase 7.5 worker can markEventFailed", async () => {
    await expect(
      buildProjectionWritesForEvent(
        event({
          eventKind: "runtime_trace",
          runtimeRunId: 1,
          payload: {},
        }),
        {
          loaders: {
            loadSkillPackUsages: async () => {
              throw new Error("ASDB transient");
            },
            loadNoteReferences: async () => [],
            loadCagBlockUsages: async () => [],
          },
        },
      ),
    ).rejects.toThrow(/ASDB transient/);
  });
});
