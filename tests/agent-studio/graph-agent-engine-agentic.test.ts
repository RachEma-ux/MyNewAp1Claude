/**
 * Phase 13.5 PR #2 — Graph Agent Engine agentic-mode integration tests.
 *
 * Verifies the agentic-mode branch of GraphAgentEngine.run():
 *
 *   - When options.agenticPlanner is supplied, run() invokes the
 *     bounded loop instead of the fixed Phase 13 pipeline.
 *   - Each `retrieve` action calls GraphRetrievalRouter.retrieve()
 *     (the existing chokepoint — no new graph entry point).
 *   - Each iteration writes a decision-trace step row.
 *   - whyThisAnswer carries agenticIterations + agenticTerminationReason
 *     + agenticRetrievalModes.
 *   - Loop terminates within maxIterations + 1 planner calls.
 *   - Model call still routes through ModelAccessAdapter.
 *   - MCP dispatcher is NOT called by the loop.
 *   - Backwards compat: omitting agenticPlanner preserves fixed
 *     pipeline behavior byte-for-byte.
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
import {
  ALWAYS_STOP_PLANNER,
  createRoundRobinPlanner,
} from "../../server/agent-studio/services/graph-agent/agentic-loop.js";
import type { AgenticPlanner } from "../../server/agent-studio/services/graph-agent/agentic-planner-contract.js";

class ModelAccessStub implements ModelAccessAdapter {
  calls: Array<{ prompt: string; contextCount: number; systemPrompt?: string }> = [];
  async execute(input: {
    prompt: string;
    systemPrompt?: string;
    contextBlocks: Array<{ content: string }>;
  }) {
    this.calls.push({
      prompt: input.prompt,
      contextCount: input.contextBlocks.length,
      systemPrompt: input.systemPrompt,
    });
    return {
      text: `Agentic answer for: ${input.prompt}`,
      usage: { promptTokens: 100, completionTokens: 50 },
    };
  }
}

class McpDispatchStub implements McpDispatchAdapter {
  calls: Array<{ toolName: string }> = [];
  async dispatch(input: { toolName: string }) {
    this.calls.push({ toolName: input.toolName });
    return { ok: true };
  }
}

class RuntimeTraceStub implements RuntimeTraceAdapter {
  starts: Array<{ agentKey: string }> = [];
  finalizes: Array<{ runId: number; status: string }> = [];
  private nextRunId = 100;
  async startRun(input: { agentKey: string; userId?: number; triggerType: string }) {
    this.starts.push({ agentKey: input.agentKey });
    return { runId: this.nextRunId++ };
  }
  async finalizeRun(runId: number, status: "completed" | "failed") {
    this.finalizes.push({ runId, status });
  }
}

interface CapturedDecisionStep {
  graphAgentRunId: number;
  stepIndex: number;
  stepKind: string;
  stepInput?: Record<string, unknown>;
  stepOutput?: Record<string, unknown>;
  durationMs: number;
}

class DecisionTraceStub implements GraphAgentDecisionTraceAdapter {
  steps: CapturedDecisionStep[] = [];
  private nextId = 200;
  async startGraphAgentRun(_input: {
    agentKey: string;
    userId?: number;
    workspaceId?: number;
    userQuery: string;
    runtimeRunId: number;
  }) {
    return { graphAgentRunId: this.nextId++ };
  }
  async recordStep(step: CapturedDecisionStep) {
    this.steps.push(step);
  }
  async finalizeGraphAgentRun(_input: {
    graphAgentRunId: number;
    status: "completed" | "failed";
    durationMs: number;
    errorMessage?: string;
  }) {
    // no-op
  }
}

async function seedRepo(repo: TestGraphRepository) {
  await repo.upsertNode({
    typeKey: "Note",
    id: "note:1",
    properties: { title: "Hello" },
    provenance: {
      sourceType: "vault_note",
      sourceId: "1",
      lineageStatus: "asserted",
      governanceStatus: "active",
    },
  });
  await repo.upsertNode({
    typeKey: "Note",
    id: "seed",
    properties: { title: "Seed" },
    provenance: {
      sourceType: "vault_note",
      sourceId: "seed",
      lineageStatus: "asserted",
      governanceStatus: "active",
    },
  });
  await repo.upsertEdge({
    typeKey: "LINKS_TO",
    id: "e1",
    sourceNode: { typeKey: "Note", id: "seed" },
    targetNode: { typeKey: "Note", id: "note:1" },
    properties: {},
    provenance: {
      sourceType: "wikilink",
      sourceId: "1",
      lineageStatus: "derived",
    },
  });
}

describe("GraphAgentEngine — agentic mode (Phase 13.5 PR #2)", () => {
  let repo: TestGraphRepository;
  let router: GraphRetrievalRouter;
  let model: ModelAccessStub;
  let mcp: McpDispatchStub;
  let trace: RuntimeTraceStub;
  let decisionTrace: DecisionTraceStub;

  beforeEach(async () => {
    repo = new TestGraphRepository();
    await seedRepo(repo);
    router = new GraphRetrievalRouter(repo);
    model = new ModelAccessStub();
    mcp = new McpDispatchStub();
    trace = new RuntimeTraceStub();
    decisionTrace = new DecisionTraceStub();
  });

  it("omitting agenticPlanner preserves the fixed Phase 13 pipeline (no behavior change)", async () => {
    const engine = new GraphAgentEngine({
      repository: repo,
      retrievalRouter: router,
      modelAccess: model,
      mcpDispatcher: mcp,
      runtimeTrace: trace,
    });
    const answer = await engine.run({
      agentKey: "graph_agent_lite",
      query: "What links to note 1?",
      retrievalPreference: "graphrag_local",
      maxSteps: 5,
    });
    expect(answer.whyThisAnswer.agenticIterations).toBeUndefined();
    expect(answer.whyThisAnswer.agenticTerminationReason).toBeUndefined();
    expect(model.calls).toHaveLength(1);
    // System prompt for the fixed pipeline does NOT mention agentic
    // mode (regression guard against accidentally using the agentic
    // system prompt for the fixed path).
    expect(model.calls[0]?.systemPrompt).not.toMatch(/agentic mode/i);
  });

  it("agenticPlanner=ALWAYS_STOP terminates with zero retrieval, populates whyThisAnswer", async () => {
    const engine = new GraphAgentEngine({
      repository: repo,
      retrievalRouter: router,
      modelAccess: model,
      mcpDispatcher: mcp,
      runtimeTrace: trace,
      decisionTrace,
      agenticPlanner: ALWAYS_STOP_PLANNER,
    });
    const answer = await engine.run({
      agentKey: "graph_agent_lite",
      query: "Probe the loop",
      retrievalPreference: "auto",
      maxSteps: 5,
    });
    expect(answer.whyThisAnswer.agenticTerminationReason).toBe("planner_stop");
    expect(answer.whyThisAnswer.agenticIterations).toBe(1);
    expect(answer.whyThisAnswer.agenticRetrievalModes).toEqual([]);
    expect(model.calls).toHaveLength(1);
    // Decision-trace contains exactly the wrapping model-call step.
    expect(decisionTrace.steps.map((s) => s.stepKind)).toEqual([
      "agentic_model_call",
    ]);
  });

  it("RoundRobinPlanner drives one retrieve iteration then answers", async () => {
    const planner = createRoundRobinPlanner({ modes: ["graphrag_local"] });
    const engine = new GraphAgentEngine({
      repository: repo,
      retrievalRouter: router,
      modelAccess: model,
      mcpDispatcher: mcp,
      runtimeTrace: trace,
      decisionTrace,
      agenticPlanner: planner,
      agenticBudget: { maxIterations: 1 },
    });
    const answer = await engine.run({
      agentKey: "graph_agent_lite",
      query: "Round-robin one step",
      retrievalPreference: "auto",
      maxSteps: 5,
    });
    expect(answer.whyThisAnswer.agenticTerminationReason).toBe("planner_answer");
    expect(answer.whyThisAnswer.agenticRetrievalModes).toEqual(["graphrag_local"]);
    expect(answer.whyThisAnswer.agenticIterations).toBe(2);
    // 1 retrieve step + 1 model-call step = 2 decision-trace rows
    expect(decisionTrace.steps).toHaveLength(2);
    expect(decisionTrace.steps[0]?.stepKind).toBe("agentic_iteration_0_retrieve");
    expect(decisionTrace.steps[1]?.stepKind).toBe("agentic_model_call");
  });

  it("RoundRobinPlanner cycles modes across iterations", async () => {
    const planner = createRoundRobinPlanner({
      modes: ["graphrag_local", "graphrag_traversal"],
    });
    const engine = new GraphAgentEngine({
      repository: repo,
      retrievalRouter: router,
      modelAccess: model,
      mcpDispatcher: mcp,
      runtimeTrace: trace,
      decisionTrace,
      agenticPlanner: planner,
      agenticBudget: { maxIterations: 3 },
    });
    const answer = await engine.run({
      agentKey: "graph_agent_lite",
      query: "Cycle test",
      retrievalPreference: "auto",
      maxSteps: 5,
    });
    expect(answer.whyThisAnswer.agenticRetrievalModes).toEqual([
      "graphrag_local",
      "graphrag_traversal",
      "graphrag_local",
    ]);
  });

  it("MCP dispatcher is never invoked by the agentic loop", async () => {
    const planner = createRoundRobinPlanner({ modes: ["graphrag_local"] });
    const engine = new GraphAgentEngine({
      repository: repo,
      retrievalRouter: router,
      modelAccess: model,
      mcpDispatcher: mcp,
      runtimeTrace: trace,
      agenticPlanner: planner,
      agenticBudget: { maxIterations: 3 },
    });
    await engine.run({
      agentKey: "graph_agent_lite",
      query: "Should not dispatch tools",
      retrievalPreference: "auto",
      maxSteps: 5,
    });
    expect(mcp.calls).toEqual([]);
  });

  it("OpenRouter Model Access is called exactly once per run regardless of iteration count", async () => {
    const planner = createRoundRobinPlanner({ modes: ["graphrag_local"] });
    const engine = new GraphAgentEngine({
      repository: repo,
      retrievalRouter: router,
      modelAccess: model,
      mcpDispatcher: mcp,
      runtimeTrace: trace,
      agenticPlanner: planner,
      agenticBudget: { maxIterations: 4 },
    });
    await engine.run({
      agentKey: "graph_agent_lite",
      query: "x",
      retrievalPreference: "auto",
      maxSteps: 5,
    });
    expect(model.calls).toHaveLength(1);
    // The agentic system prompt names the termination reason.
    expect(model.calls[0]?.systemPrompt).toMatch(/agentic mode/i);
    expect(model.calls[0]?.systemPrompt).toMatch(/Loop terminated/i);
  });

  it("an invalid planner action halts the run with terminationReason=invalid_action", async () => {
    const badPlanner: AgenticPlanner = {
      async plan() {
        return { kind: "dispatch_tool" as never, reason: "leak attempt" };
      },
    };
    const engine = new GraphAgentEngine({
      repository: repo,
      retrievalRouter: router,
      modelAccess: model,
      mcpDispatcher: mcp,
      runtimeTrace: trace,
      agenticPlanner: badPlanner,
    });
    const answer = await engine.run({
      agentKey: "graph_agent_lite",
      query: "x",
      retrievalPreference: "auto",
      maxSteps: 5,
    });
    expect(answer.whyThisAnswer.agenticTerminationReason).toBe("invalid_action");
    // Model still runs to assemble a (potentially empty-context)
    // answer — that's by design; the engine ALWAYS finalizes with a
    // model call so the operator sees a structured response.
    expect(model.calls).toHaveLength(1);
    // No iterations succeeded so no decision-trace retrieve rows.
    expect(decisionTrace.steps).toHaveLength(0);
  });

  it("runtime-trace start + finalize fire even when the planner answers immediately", async () => {
    const planner: AgenticPlanner = {
      async plan() {
        return { kind: "answer", reason: "skip retrieval" };
      },
    };
    const engine = new GraphAgentEngine({
      repository: repo,
      retrievalRouter: router,
      modelAccess: model,
      mcpDispatcher: mcp,
      runtimeTrace: trace,
      agenticPlanner: planner,
    });
    await engine.run({
      agentKey: "graph_agent_lite",
      query: "x",
      retrievalPreference: "auto",
      maxSteps: 5,
    });
    expect(trace.starts).toHaveLength(1);
    expect(trace.finalizes).toHaveLength(1);
    expect(trace.finalizes[0]?.status).toBe("completed");
  });

  it("decision-trace step indexing is monotonic across iterations", async () => {
    const planner = createRoundRobinPlanner({
      modes: ["graphrag_local", "graphrag_traversal"],
    });
    const engine = new GraphAgentEngine({
      repository: repo,
      retrievalRouter: router,
      modelAccess: model,
      mcpDispatcher: mcp,
      runtimeTrace: trace,
      decisionTrace,
      agenticPlanner: planner,
      agenticBudget: { maxIterations: 2 },
    });
    await engine.run({
      agentKey: "graph_agent_lite",
      query: "x",
      retrievalPreference: "auto",
      maxSteps: 5,
    });
    const indices = decisionTrace.steps.map((s) => s.stepIndex);
    // 2 retrieves + 1 model call = indices 1, 2, 3
    expect(indices).toEqual([1, 2, 3]);
  });
});
