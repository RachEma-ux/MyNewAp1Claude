/**
 * Phase 13 §2 — Graph Agent Lite decision-trace engine integration.
 *
 * Verifies the engine fires the `GraphAgentDecisionTraceAdapter` port
 * across the four engine phases when wired:
 *   1. plan_retrieval_mode
 *   2. retrieve
 *   3. model_call
 *   4. health_snapshot
 *
 * Plus the lifecycle:
 *   - startGraphAgentRun → step rows → finalizeGraphAgentRun("completed")
 *   - finalizeGraphAgentRun("failed") on engine error
 *   - Adapter is optional — engine without adapter behaves as before.
 *   - Each step gets a 1-based index AND a durationMs.
 *   - The graph-agent run row is linked back via runtimeRunId.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TestGraphRepository } from "../../server/agent-studio/services/graph/repository/index.js";
import { GraphRetrievalRouter } from "../../server/agent-studio/services/graph/retrieval/public-api.js";
import {
  GraphAgentEngine,
  type GraphAgentDecisionTraceAdapter,
  type McpDispatchAdapter,
  type ModelAccessAdapter,
  type RuntimeTraceAdapter,
} from "../../server/agent-studio/services/graph-agent/public-api.js";

interface RecordedStep {
  graphAgentRunId: number;
  stepIndex: number;
  stepKind: string;
  stepInput?: Record<string, unknown>;
  stepOutput?: Record<string, unknown>;
  durationMs?: number;
}

interface RecordedFinalize {
  graphAgentRunId: number;
  status: "completed" | "failed";
  durationMs: number;
  errorMessage?: string;
}

class DecisionTraceStub implements GraphAgentDecisionTraceAdapter {
  starts: Array<{
    agentKey: string;
    userId?: number;
    workspaceId?: number;
    userQuery: string;
    runtimeRunId?: number;
  }> = [];
  steps: RecordedStep[] = [];
  finalizes: RecordedFinalize[] = [];
  private nextId = 100;

  async startGraphAgentRun(input: {
    agentKey: string;
    userId?: number;
    workspaceId?: number;
    userQuery: string;
    runtimeRunId?: number;
  }) {
    this.starts.push(input);
    return { graphAgentRunId: this.nextId++ };
  }

  async recordStep(input: RecordedStep) {
    this.steps.push(input);
  }

  async finalizeGraphAgentRun(input: RecordedFinalize) {
    this.finalizes.push(input);
  }
}

class ModelStub implements ModelAccessAdapter {
  shouldThrow = false;
  async execute(input: {
    prompt: string;
    contextBlocks: Array<{ content: string }>;
  }) {
    if (this.shouldThrow) throw new Error("model boom");
    return {
      text: `Answer: ${input.prompt}`,
      usage: { promptTokens: 10, completionTokens: 5 },
    };
  }
}
class McpStub implements McpDispatchAdapter {
  async dispatch() {
    return { ok: true };
  }
}
class TraceStub implements RuntimeTraceAdapter {
  private next = 1;
  async startRun() {
    return { runId: this.next++ };
  }
  async finalizeRun() {}
}

describe("GraphAgentEngine — Phase 13 §2 decision trace", () => {
  let repo: TestGraphRepository;
  let router: GraphRetrievalRouter;
  let model: ModelStub;
  let trace: TraceStub;
  let decisionTrace: DecisionTraceStub;
  let engine: GraphAgentEngine;

  beforeEach(async () => {
    repo = new TestGraphRepository();
    await repo.upsertNode({
      typeKey: "Note",
      id: "seed",
      properties: { title: "seed" },
      provenance: {
        sourceType: "vault_note",
        sourceId: "seed",
        lineageStatus: "asserted",
        governanceStatus: "active",
      },
    });
    router = new GraphRetrievalRouter(repo);
    model = new ModelStub();
    trace = new TraceStub();
    decisionTrace = new DecisionTraceStub();
    engine = new GraphAgentEngine({
      repository: repo,
      retrievalRouter: router,
      modelAccess: model,
      mcpDispatcher: new McpStub(),
      runtimeTrace: trace,
      decisionTrace,
    });
  });

  it("opens a graph-agent run row linked to the top-level runtime run id", async () => {
    await engine.run({
      agentKey: "graph_agent_lite",
      query: "q",
      userId: 42,
      workspaceId: 9,
      retrievalPreference: "graphrag_local",
      maxSteps: 5,
    });
    expect(decisionTrace.starts).toHaveLength(1);
    expect(decisionTrace.starts[0]).toMatchObject({
      agentKey: "graph_agent_lite",
      userId: 42,
      workspaceId: 9,
      userQuery: "q",
      runtimeRunId: 1,
    });
  });

  it("records all four phase steps with 1-based indices in order", async () => {
    await engine.run({
      agentKey: "graph_agent_lite",
      query: "q",
      retrievalPreference: "graphrag_local",
      maxSteps: 5,
    });
    const kinds = decisionTrace.steps.map((s) => s.stepKind);
    expect(kinds).toEqual([
      "plan_retrieval_mode",
      "retrieve",
      "model_call",
      "health_snapshot",
    ]);
    const indices = decisionTrace.steps.map((s) => s.stepIndex);
    expect(indices).toEqual([1, 2, 3, 4]);
  });

  it("step durations are non-negative numbers", async () => {
    await engine.run({
      agentKey: "graph_agent_lite",
      query: "q",
      retrievalPreference: "graphrag_local",
      maxSteps: 5,
    });
    for (const s of decisionTrace.steps) {
      expect(typeof s.durationMs).toBe("number");
      expect(s.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("retrieve step carries contextBlockCount + truncated flag in stepOutput", async () => {
    await engine.run({
      agentKey: "graph_agent_lite",
      query: "q",
      retrievalPreference: "graphrag_local",
      maxSteps: 5,
    });
    const retrieveStep = decisionTrace.steps.find(
      (s) => s.stepKind === "retrieve",
    );
    expect(retrieveStep?.stepOutput).toBeDefined();
    expect(typeof retrieveStep!.stepOutput!.contextBlockCount).toBe("number");
    expect(typeof retrieveStep!.stepOutput!.truncated).toBe("boolean");
  });

  it("model_call step carries promptTokens / completionTokens / responseLength", async () => {
    await engine.run({
      agentKey: "graph_agent_lite",
      query: "test",
      retrievalPreference: "graphrag_local",
      maxSteps: 5,
    });
    const modelStep = decisionTrace.steps.find(
      (s) => s.stepKind === "model_call",
    );
    expect(modelStep?.stepOutput).toMatchObject({
      promptTokens: 10,
      completionTokens: 5,
    });
    expect(modelStep?.stepOutput?.responseLength).toBeGreaterThan(0);
  });

  it("finalizes with status=completed and total durationMs on the happy path", async () => {
    await engine.run({
      agentKey: "graph_agent_lite",
      query: "q",
      retrievalPreference: "graphrag_local",
      maxSteps: 5,
    });
    expect(decisionTrace.finalizes).toHaveLength(1);
    expect(decisionTrace.finalizes[0].status).toBe("completed");
    expect(decisionTrace.finalizes[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(decisionTrace.finalizes[0].errorMessage).toBeUndefined();
  });

  it("finalizes with status=failed + errorMessage when the engine throws", async () => {
    model.shouldThrow = true;
    await expect(
      engine.run({
        agentKey: "graph_agent_lite",
        query: "q",
        retrievalPreference: "graphrag_local",
        maxSteps: 5,
      }),
    ).rejects.toThrow(/model boom/);
    expect(decisionTrace.finalizes).toHaveLength(1);
    expect(decisionTrace.finalizes[0].status).toBe("failed");
    expect(decisionTrace.finalizes[0].errorMessage).toContain("model boom");
  });

  it("adapter is optional — engine without decisionTrace runs as before", async () => {
    const engineNoTrace = new GraphAgentEngine({
      repository: repo,
      retrievalRouter: router,
      modelAccess: model,
      mcpDispatcher: new McpStub(),
      runtimeTrace: trace,
      // decisionTrace omitted
    });
    const answer = await engineNoTrace.run({
      agentKey: "graph_agent_lite",
      query: "q",
      retrievalPreference: "graphrag_local",
      maxSteps: 5,
    });
    expect(answer.answer).toContain("Answer:");
    // decisionTrace stub on the OTHER engine was not invoked.
    expect(decisionTrace.starts).toHaveLength(0);
    expect(decisionTrace.steps).toHaveLength(0);
    expect(decisionTrace.finalizes).toHaveLength(0);
  });
});
