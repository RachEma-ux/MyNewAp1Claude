/**
 * KGIA — Runtime Node Tests
 *
 * Tests each node function in isolation: given a RuntimeState input,
 * verify the correct output state.
 */

import { describe, it, expect } from "vitest";
import { createRuntimeState, advanceNode, addError } from "../runtime/state";
import { classifyIntentNode } from "../runtime/nodes/classify-intent";
import { chooseModeNode } from "../runtime/nodes/choose-mode";
import { expandPathsNode } from "../runtime/nodes/expand-paths";
import { synthesizeAnswerNode } from "../runtime/nodes/synthesize-answer";

describe("createRuntimeState", () => {
  it("creates a fresh state with defaults", () => {
    const state = createRuntimeState({
      workspaceId: 1,
      sessionId: 10,
      runId: 100,
      question: "Who leads the engineering team?",
    });

    expect(state.workspaceId).toBe(1);
    expect(state.sessionId).toBe(10);
    expect(state.runId).toBe(100);
    expect(state.question).toBe("Who leads the engineering team?");
    expect(state.currentNode).toBe("classifyIntent");
    expect(state.completedNodes).toEqual([]);
    expect(state.errors).toEqual([]);
    expect(state.queryResults).toEqual([]);
    expect(state.pathCandidates).toEqual([]);
  });
});

describe("advanceNode", () => {
  it("pushes completed node and updates currentNode", () => {
    const state = createRuntimeState({ workspaceId: 1, sessionId: 1, runId: 1, question: "test" });
    const next = advanceNode(state, "classifyIntent");

    expect(next.completedNodes).toContain("classifyIntent");
    expect(next.currentNode).toBe("classifyIntent");
  });
});

describe("addError", () => {
  it("appends error to state", () => {
    const state = createRuntimeState({ workspaceId: 1, sessionId: 1, runId: 1, question: "test" });
    const next = addError(state, "Something failed");

    expect(next.errors).toContain("Something failed");
  });

  it("preserves existing errors", () => {
    let state = createRuntimeState({ workspaceId: 1, sessionId: 1, runId: 1, question: "test" });
    state = addError(state, "Error 1");
    state = addError(state, "Error 2");

    expect(state.errors).toEqual(["Error 1", "Error 2"]);
  });
});

describe("classifyIntentNode", () => {
  it("classifies a relationship question", () => {
    const state = createRuntimeState({
      workspaceId: 1, sessionId: 1, runId: 1,
      question: "What is the relationship between Alice and Bob?",
    });
    const next = classifyIntentNode(state);

    expect(next.intent).toBeDefined();
    expect(next.completedNodes).toContain("classifyIntent");
  });

  it("classifies an entity lookup question", () => {
    const state = createRuntimeState({
      workspaceId: 1, sessionId: 1, runId: 1,
      question: "Find all companies in New York",
    });
    const next = classifyIntentNode(state);

    expect(next.intent).toBeDefined();
  });
});

describe("chooseModeNode", () => {
  it("selects memory mode when no sources", () => {
    const state = createRuntimeState({
      workspaceId: 1, sessionId: 1, runId: 1,
      question: "What do we know so far?",
    });
    const next = chooseModeNode(state, []);

    expect(next.selectedMode).toBe("memory");
    expect(next.completedNodes).toContain("chooseMode");
  });

  it("selects direct_query for simple lookup with sources", () => {
    const state = createRuntimeState({
      workspaceId: 1, sessionId: 1, runId: 1,
      question: "Find all Person nodes",
    });
    (state as any).intent = "entity_lookup";

    const source = {
      id: 1, name: "test", type: "neo4j" as const,
      endpoint: "bolt://localhost:7687", allowlisted: true,
      maxHops: 4, maxRows: 1000, readOnly: true,
    };
    const next = chooseModeNode(state, [source]);

    expect(next.selectedMode).toBe("direct_query");
  });

  it("honors explicit mode request", () => {
    const state = createRuntimeState({
      workspaceId: 1, sessionId: 1, runId: 1,
      question: "test", requestedMode: "hybrid",
    });
    const next = chooseModeNode(state, []);

    expect(next.selectedMode).toBe("hybrid");
  });
});

describe("expandPathsNode", () => {
  it("returns unchanged state when no query results", () => {
    const state = createRuntimeState({
      workspaceId: 1, sessionId: 1, runId: 1,
      question: "test",
    });
    const source = {
      id: 1, name: "test", type: "neo4j" as const,
      endpoint: "bolt://localhost:7687", allowlisted: true,
      maxHops: 4, maxRows: 1000, readOnly: true,
    };
    const next = expandPathsNode(state, source);

    expect(next.completedNodes).toContain("expandPaths");
    expect(next.pathCandidates).toEqual([]);
  });
});

describe("synthesizeAnswerNode", () => {
  it("produces an envelope with empty evidence", () => {
    const state = createRuntimeState({
      workspaceId: 1, sessionId: 1, runId: 1,
      question: "Who is the CEO?",
    });
    (state as any).selectedMode = "direct_query";

    const next = synthesizeAnswerNode(state);

    expect(next.envelope).toBeDefined();
    expect(next.envelope!.answer).toBeDefined();
    expect(next.envelope!.selectedMode).toBe("direct_query");
    expect(next.completedNodes).toContain("synthesizeAnswer");
  });
});
