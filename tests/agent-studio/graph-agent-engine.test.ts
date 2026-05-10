/**
 * Phase 13 — Graph Agent Lite engine tests.
 *
 * Tests the orchestration with stub adapters for model-access, MCP dispatcher,
 * and runtime-trace writer. Verifies boundaries (no direct provider SDK,
 * no MCP bypass, no graph mutation).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TestGraphRepository } from "../../server/agent-studio/services/graph/repository/index.js";
import { GraphRetrievalRouter } from "../../server/agent-studio/services/graph/retrieval/public-api.js";
import {
  GraphAgentEngine,
  type McpDispatchAdapter,
  type ModelAccessAdapter,
  type RuntimeTraceAdapter,
} from "../../server/agent-studio/services/graph-agent/public-api.js";

class ModelAccessStub implements ModelAccessAdapter {
  calls: Array<{ prompt: string; contextCount: number }> = [];
  async execute(input: { prompt: string; contextBlocks: Array<{ content: string }> }) {
    this.calls.push({ prompt: input.prompt, contextCount: input.contextBlocks.length });
    return { text: `Answered: ${input.prompt}`, usage: { promptTokens: 100, completionTokens: 50 } };
  }
}

class McpDispatchStub implements McpDispatchAdapter {
  calls: Array<{ toolName: string }> = [];
  async dispatch(input: { toolName: string; args: Record<string, unknown> }) {
    this.calls.push({ toolName: input.toolName });
    return { ok: true };
  }
}

class RuntimeTraceStub implements RuntimeTraceAdapter {
  starts: Array<{ agentKey: string }> = [];
  finalizes: Array<{ runId: number; status: string }> = [];
  private nextRunId = 1;
  async startRun(input: { agentKey: string; userId?: number; triggerType: string }) {
    this.starts.push({ agentKey: input.agentKey });
    return { runId: this.nextRunId++ };
  }
  async finalizeRun(runId: number, status: "completed" | "failed") {
    this.finalizes.push({ runId, status });
  }
}

describe("GraphAgentEngine — orchestration + boundaries", () => {
  let repo: TestGraphRepository;
  let router: GraphRetrievalRouter;
  let model: ModelAccessStub;
  let mcp: McpDispatchStub;
  let trace: RuntimeTraceStub;
  let engine: GraphAgentEngine;

  beforeEach(async () => {
    repo = new TestGraphRepository();
    // Seed a couple of nodes so localGraph returns something
    await repo.upsertNode({
      typeKey: "Note",
      id: "note:1",
      properties: { title: "Hello" },
      provenance: { sourceType: "vault_note", sourceId: "1", lineageStatus: "asserted", governanceStatus: "active" },
    });
    await repo.upsertNode({
      typeKey: "Note",
      id: "seed",
      properties: { title: "Seed" },
      provenance: { sourceType: "vault_note", sourceId: "seed", lineageStatus: "asserted", governanceStatus: "active" },
    });
    await repo.upsertEdge({
      typeKey: "LINKS_TO",
      id: "e1",
      sourceNode: { typeKey: "Note", id: "seed" },
      targetNode: { typeKey: "Note", id: "note:1" },
      properties: {},
      provenance: { sourceType: "wikilink", sourceId: "1", lineageStatus: "derived" },
    });
    router = new GraphRetrievalRouter(repo);
    model = new ModelAccessStub();
    mcp = new McpDispatchStub();
    trace = new RuntimeTraceStub();
    engine = new GraphAgentEngine({
      repository: repo,
      retrievalRouter: router,
      modelAccess: model,
      mcpDispatcher: mcp,
      runtimeTrace: trace,
    });
  });

  it("starts + finalizes a runtime trace", async () => {
    const answer = await engine.run({
      agentKey: "graph_agent_lite",
      query: "What links to note 1?",
      retrievalPreference: "graphrag_local",
      maxSteps: 5,
    });
    expect(trace.starts.length).toBe(1);
    expect(trace.starts[0]?.agentKey).toBe("graph_agent_lite");
    expect(trace.finalizes.length).toBe(1);
    expect(trace.finalizes[0]?.status).toBe("completed");
    expect(answer.runId).toBe(1);
  });

  it("calls model-access (not direct SDK)", async () => {
    await engine.run({
      agentKey: "graph_agent_lite",
      query: "Hello",
      retrievalPreference: "auto",
      maxSteps: 5,
    });
    expect(model.calls.length).toBe(1);
    expect(model.calls[0]?.prompt).toBe("Hello");
  });

  it("Why-This-Answer surface includes backend key + retrieval mode", async () => {
    const answer = await engine.run({
      agentKey: "graph_agent_lite",
      query: "Hello",
      retrievalPreference: "graphrag_local",
      maxSteps: 5,
    });
    expect(answer.whyThisAnswer.graphBackendKey).toBe("test");
    expect(answer.whyThisAnswer.retrievalMode).toBe("graphrag_local");
  });

  it("returns answer with citations from retrieval result", async () => {
    const answer = await engine.run({
      agentKey: "graph_agent_lite",
      query: "Test",
      retrievalPreference: "graphrag_local",
      maxSteps: 5,
    });
    expect(answer.answer).toMatch(/Test/);
    expect(Array.isArray(answer.citations)).toBe(true);
  });

  it("failures emit failed runtime trace status", async () => {
    class FailingModel implements ModelAccessAdapter {
      async execute(): Promise<never> {
        throw new Error("model down");
      }
    }
    const failingEngine = new GraphAgentEngine({
      repository: repo,
      retrievalRouter: router,
      modelAccess: new FailingModel(),
      mcpDispatcher: mcp,
      runtimeTrace: trace,
    });
    await expect(
      failingEngine.run({ agentKey: "graph_agent_lite", query: "x", retrievalPreference: "auto", maxSteps: 5 }),
    ).rejects.toThrow("model down");
    expect(trace.finalizes.at(-1)?.status).toBe("failed");
  });

  it("does not invoke MCP dispatcher when no tool call needed", async () => {
    await engine.run({
      agentKey: "graph_agent_lite",
      query: "no tools",
      retrievalPreference: "auto",
      maxSteps: 5,
    });
    expect(mcp.calls.length).toBe(0); // Phase 13 Lite does not call tools
  });
});
