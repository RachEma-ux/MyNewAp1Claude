// Native Graph Workspace V1.0 — Phase 13.5 / PR #3.
//
// Agentic GraphRAG — model-driven planner tests.
//
// Covers:
//   1. Valid model output → returns the parsed AgenticPlannerAction
//      (loop's downstream validator accepts it).
//   2. Markdown-code-fence-wrapped output → fences stripped, JSON parsed.
//   3. Malformed JSON → returns a placeholder that the loop's
//      validator rejects with terminationReason="invalid_action".
//   4. Empty model output → same placeholder/invalid path.
//   5. Truncated JSON → same placeholder/invalid path.
//   6. System prompt lists the 3 closed-union action kinds.
//   7. User prompt includes iteration index, maxIterations, query,
//      previous steps, skill-pack eligibility.
//   8. End-to-end with runAgenticLoop: planner emits answer →
//      terminationReason="planner_answer".
//   9. End-to-end with runAgenticLoop: planner emits garbage →
//      terminationReason="invalid_action".
//  10. systemPromptOverride is honored.

import { describe, expect, it, vi } from "vitest";

import {
  validateAgenticPlannerAction,
} from "../../server/agent-studio/services/graph-agent/agentic-planner-contract.js";
import {
  buildUserPrompt,
  createModelDrivenPlanner,
  parseModelResponse,
  type AgenticPlannerModelCall,
} from "../../server/agent-studio/services/graph-agent/agentic-model-planner.js";
import { runAgenticLoop } from "../../server/agent-studio/services/graph-agent/agentic-loop.js";

function makeModelCall(text: string): {
  call: AgenticPlannerModelCall;
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn(async (_input: { systemPrompt: string; userPrompt: string }) => ({
    text,
  }));
  return { call: spy as unknown as AgenticPlannerModelCall, spy };
}

describe("createModelDrivenPlanner", () => {
  it("returns the parsed action for a valid retrieve JSON output", async () => {
    const { call } = makeModelCall(
      JSON.stringify({
        kind: "retrieve",
        retrievalMode: "graphrag_global",
        reason: "first turn — broad scan",
      }),
    );
    const planner = createModelDrivenPlanner({ modelCall: call });
    const action = await planner.plan({
      query: "what entities depend on X?",
      previousSteps: [],
      iterationIndex: 0,
      maxIterations: 4,
      skillPackEligibility: [],
    });
    const validation = validateAgenticPlannerAction(action);
    expect(validation.ok).toBe(true);
    expect(action.kind).toBe("retrieve");
    if (action.kind === "retrieve") {
      expect(action.retrievalMode).toBe("graphrag_global");
    }
  });

  it("returns answer action when model emits valid answer JSON", async () => {
    const { call } = makeModelCall(
      JSON.stringify({ kind: "answer", reason: "have enough evidence" }),
    );
    const planner = createModelDrivenPlanner({ modelCall: call });
    const action = await planner.plan({
      query: "q",
      previousSteps: [],
      iterationIndex: 1,
      maxIterations: 4,
      skillPackEligibility: [],
    });
    expect(action.kind).toBe("answer");
  });

  it("returns stop action when model emits valid stop JSON", async () => {
    const { call } = makeModelCall(
      JSON.stringify({ kind: "stop", reason: "cannot make progress" }),
    );
    const planner = createModelDrivenPlanner({ modelCall: call });
    const action = await planner.plan({
      query: "q",
      previousSteps: [],
      iterationIndex: 0,
      maxIterations: 4,
      skillPackEligibility: [],
    });
    expect(action.kind).toBe("stop");
  });

  it("strips markdown code fences before parsing", async () => {
    const fenced = "```json\n" +
      JSON.stringify({ kind: "answer", reason: "fenced output" }) +
      "\n```";
    const { call } = makeModelCall(fenced);
    const planner = createModelDrivenPlanner({ modelCall: call });
    const action = await planner.plan({
      query: "q",
      previousSteps: [],
      iterationIndex: 0,
      maxIterations: 4,
      skillPackEligibility: [],
    });
    expect(action.kind).toBe("answer");
  });

  it("malformed JSON returns a placeholder the loop validator rejects", async () => {
    const { call } = makeModelCall("not json at all { whoops");
    const planner = createModelDrivenPlanner({ modelCall: call });
    const action = await planner.plan({
      query: "q",
      previousSteps: [],
      iterationIndex: 0,
      maxIterations: 4,
      skillPackEligibility: [],
    });
    const validation = validateAgenticPlannerAction(action);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.reason).toMatch(/is not in the allowed set/);
    }
  });

  it("empty model output yields an invalid placeholder", async () => {
    const { call } = makeModelCall("");
    const planner = createModelDrivenPlanner({ modelCall: call });
    const action = await planner.plan({
      query: "q",
      previousSteps: [],
      iterationIndex: 0,
      maxIterations: 4,
      skillPackEligibility: [],
    });
    expect(validateAgenticPlannerAction(action).ok).toBe(false);
  });

  it("truncated JSON yields an invalid placeholder", async () => {
    const { call } = makeModelCall('{"kind":"retrieve","reaso');
    const planner = createModelDrivenPlanner({ modelCall: call });
    const action = await planner.plan({
      query: "q",
      previousSteps: [],
      iterationIndex: 0,
      maxIterations: 4,
      skillPackEligibility: [],
    });
    expect(validateAgenticPlannerAction(action).ok).toBe(false);
  });

  it("system prompt lists all 3 closed-union action kinds", async () => {
    const { call, spy } = makeModelCall(
      JSON.stringify({ kind: "stop", reason: "x" }),
    );
    const planner = createModelDrivenPlanner({ modelCall: call });
    await planner.plan({
      query: "q",
      previousSteps: [],
      iterationIndex: 0,
      maxIterations: 4,
      skillPackEligibility: [],
    });
    const systemPrompt = (spy.mock.calls[0][0] as { systemPrompt: string }).systemPrompt;
    expect(systemPrompt).toMatch(/"retrieve"/);
    expect(systemPrompt).toMatch(/"answer"/);
    expect(systemPrompt).toMatch(/"stop"/);
  });

  it("systemPromptOverride replaces the default", async () => {
    const { call, spy } = makeModelCall(
      JSON.stringify({ kind: "stop", reason: "x" }),
    );
    const override = "CUSTOM SYSTEM PROMPT FOR TESTING";
    const planner = createModelDrivenPlanner({
      modelCall: call,
      systemPromptOverride: override,
    });
    await planner.plan({
      query: "q",
      previousSteps: [],
      iterationIndex: 0,
      maxIterations: 4,
      skillPackEligibility: [],
    });
    expect((spy.mock.calls[0][0] as { systemPrompt: string }).systemPrompt).toBe(
      override,
    );
  });
});

describe("buildUserPrompt", () => {
  it("includes the query, iteration index, max iterations", () => {
    const prompt = buildUserPrompt({
      query: "what entities depend on X?",
      previousSteps: [],
      iterationIndex: 2,
      maxIterations: 4,
      skillPackEligibility: [],
    });
    expect(prompt).toMatch(/what entities depend on X\?/);
    expect(prompt).toMatch(/Iteration: 2 of max 4/);
  });

  it("renders '(none)' when previousSteps is empty", () => {
    const prompt = buildUserPrompt({
      query: "q",
      previousSteps: [],
      iterationIndex: 0,
      maxIterations: 4,
      skillPackEligibility: [],
    });
    expect(prompt).toMatch(/Previous steps:\s+\(none/);
  });

  it("renders each previous retrieve step with mode + counts", () => {
    const prompt = buildUserPrompt({
      query: "q",
      previousSteps: [
        {
          kind: "retrieve",
          retrievalMode: "graphrag_global",
          contextBlockCount: 3,
          citationCount: 5,
          durationMs: 120,
        },
      ],
      iterationIndex: 1,
      maxIterations: 4,
      skillPackEligibility: [],
    });
    expect(prompt).toMatch(/retrieve\(mode=graphrag_global, blocks=3, citations=5, durMs=120\)/);
  });

  it("renders skill-pack eligibility lines", () => {
    const prompt = buildUserPrompt({
      query: "q",
      previousSteps: [],
      iterationIndex: 0,
      maxIterations: 4,
      skillPackEligibility: [
        {
          skillKey: "vault_navigator",
          templateKeys: ["t1", "t2"],
          agenticEligible: true,
        },
      ],
    });
    expect(prompt).toMatch(/vault_navigator \[eligible\] templates=\[t1, t2\]/);
  });

  it("marks non-eligible packs as opt-out", () => {
    const prompt = buildUserPrompt({
      query: "q",
      previousSteps: [],
      iterationIndex: 0,
      maxIterations: 4,
      skillPackEligibility: [
        {
          skillKey: "risky_pack",
          templateKeys: ["t1"],
          agenticEligible: false,
        },
      ],
    });
    expect(prompt).toMatch(/risky_pack \[opt-out\]/);
  });
});

describe("parseModelResponse", () => {
  it("strips ```json fences", () => {
    const result = parseModelResponse(
      "```json\n" + '{"kind":"answer","reason":"r"}' + "\n```",
    );
    expect(result.kind).toBe("answer");
  });

  it("strips bare ``` fences", () => {
    const result = parseModelResponse(
      "```\n" + '{"kind":"stop","reason":"r"}' + "\n```",
    );
    expect(result.kind).toBe("stop");
  });

  it("returns invalid placeholder for non-JSON input", () => {
    const result = parseModelResponse("not json");
    expect(validateAgenticPlannerAction(result).ok).toBe(false);
  });
});

describe("end-to-end with runAgenticLoop", () => {
  it("planner emits answer → loop terminates with planner_answer", async () => {
    const { call } = makeModelCall(
      JSON.stringify({ kind: "answer", reason: "have enough" }),
    );
    const planner = createModelDrivenPlanner({ modelCall: call });
    const result = await runAgenticLoop(
      { query: "q" },
      { planner, budget: { maxIterations: 4 } },
    );
    expect(result.terminationReason).toBe("planner_answer");
    expect(result.plannerCallCount).toBe(1);
  });

  it("planner emits garbage → loop terminates with invalid_action", async () => {
    const { call } = makeModelCall("not json");
    const planner = createModelDrivenPlanner({ modelCall: call });
    const result = await runAgenticLoop(
      { query: "q" },
      { planner, budget: { maxIterations: 4 } },
    );
    expect(result.terminationReason).toBe("invalid_action");
    expect(result.invalidActionReason).toMatch(/not in the allowed set/);
  });

  it("planner emits retrieve then answer → loop runs 2 turns", async () => {
    let turn = 0;
    const call: AgenticPlannerModelCall = async () => {
      turn++;
      if (turn === 1) {
        return {
          text: JSON.stringify({
            kind: "retrieve",
            retrievalMode: "graphrag_global",
            reason: "first turn",
          }),
        };
      }
      return { text: JSON.stringify({ kind: "answer", reason: "done" }) };
    };
    const planner = createModelDrivenPlanner({ modelCall: call });
    const result = await runAgenticLoop(
      { query: "q" },
      { planner, budget: { maxIterations: 4 } },
    );
    expect(result.terminationReason).toBe("planner_answer");
    expect(result.plannerCallCount).toBe(2);
    expect(result.actions.map((a) => a.kind)).toEqual(["retrieve", "answer"]);
  });
});
