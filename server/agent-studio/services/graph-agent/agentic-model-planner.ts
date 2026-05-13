/**
 * Native Graph Workspace V1.0 — Phase 13.5 / PR #3.
 *
 * Agentic GraphRAG — model-driven planner.
 *
 * PR #1 shipped the `AgenticPlanner` contract + closed `AgenticPlannerAction`
 * union. PR #2 added a deterministic `RoundRobinPlanner` and wired both
 * planner shapes into the graph-agent engine.
 *
 * PR #3 adds the real LLM-emitted-plan planner. Each `plan()` call:
 *
 *   1. Builds a system prompt that describes the closed action union
 *      ("retrieve" | "answer" | "stop") + the JSON output contract.
 *   2. Builds a user prompt with the query, previous steps, skill-pack
 *      eligibility, and budget context.
 *   3. Calls the injected model callable (operator-wires this to
 *      OpenRouter `execute()`).
 *   4. Strips markdown code fences from the model output (a common
 *      LLM quirk).
 *   5. JSON.parses the result.
 *   6. Returns the parsed object. The loop's existing
 *      `validateAgenticPlannerAction` validates the shape downstream —
 *      a malformed model output terminates the loop with
 *      `terminationReason: "invalid_action"`.
 *
 * BOUNDARY PRESERVATION (source-scan tested):
 *   - No `dispatchMcpToolCall` reference.
 *   - No `neo4j-driver` import.
 *   - Closed action union (no `kind: "dispatch_tool"` etc.).
 *   - No direct OpenRouter SDK imports — the model call is a small
 *     callable type, kept narrow so unit tests can stub it without
 *     pulling the model-access stack into the test environment.
 *
 * See: docs/architecture/agent-studio-agentic-graphrag.md
 */

import type {
  AgenticPlanner,
  AgenticPlannerAction,
  AgenticPlannerEligiblePack,
  AgenticPlannerInput,
  AgenticPlannerStep,
} from "./agentic-planner-contract.js";

/**
 * Narrow callable shape — operator wires this to the existing
 * OpenRouter `execute()` path in production. The planner stays
 * agnostic of providerConnectionId / modelRef / workspaceId / actorId
 * so unit tests can stub it without the model-access boundary.
 */
export type AgenticPlannerModelCall = (input: {
  systemPrompt: string;
  userPrompt: string;
}) => Promise<{ text: string }>;

export interface ModelDrivenPlannerOptions {
  /** Model call shim. Required. */
  readonly modelCall: AgenticPlannerModelCall;
  /**
   * Optional override of the default system prompt. The default lists
   * the 3 allowed action kinds and the JSON output contract. Operator
   * may extend this with domain-specific guidance.
   */
  readonly systemPromptOverride?: string;
}

const DEFAULT_SYSTEM_PROMPT = [
  "You are the planner inside a bounded agentic GraphRAG loop.",
  "",
  "Each turn you decide ONE of exactly three actions:",
  '  1. "retrieve" — issue a graph-retrieval call with a specific retrievalMode.',
  '  2. "answer"   — declare the loop has gathered enough evidence to answer.',
  '  3. "stop"     — abandon the loop (e.g. cannot make progress).',
  "",
  "You MUST respond with a SINGLE JSON object and nothing else. Schema:",
  "",
  "  // retrieve:",
  '  { "kind": "retrieve", "retrievalMode": "<mode>", "reason": "<why>" }',
  "  // answer:",
  '  { "kind": "answer", "reason": "<why>" }',
  "  // stop:",
  '  { "kind": "stop", "reason": "<why>" }',
  "",
  "Constraints:",
  "  - reason MUST be a non-empty string.",
  "  - retrievalMode MUST be one of the modes the user prompt lists.",
  "  - Do NOT request tool dispatch, graph mutation, or external API calls.",
  "  - Do NOT exceed the maxIterations budget the user prompt declares.",
  "  - Do NOT wrap the JSON in markdown code fences. Return raw JSON.",
].join("\n");

/**
 * Construct a model-driven planner.
 *
 * The returned planner conforms to the `AgenticPlanner` contract and
 * plugs into the same engine path that consumes the round-robin
 * planner. The loop's `validateAgenticPlannerAction` handles malformed
 * model output by terminating with `terminationReason: "invalid_action"`.
 */
export function createModelDrivenPlanner(
  options: ModelDrivenPlannerOptions,
): AgenticPlanner {
  const systemPrompt = options.systemPromptOverride ?? DEFAULT_SYSTEM_PROMPT;

  return {
    async plan(input: AgenticPlannerInput): Promise<AgenticPlannerAction> {
      const userPrompt = buildUserPrompt(input);
      const result = await options.modelCall({ systemPrompt, userPrompt });
      return parseModelResponse(result.text);
    },
  };
}

/**
 * Build the user prompt for a single planner turn.
 *
 * Exposed for testing — the unit tests assert that the prompt includes
 * the iteration index, max iterations, previous steps, and skill-pack
 * eligibility list.
 */
export function buildUserPrompt(input: AgenticPlannerInput): string {
  const lines: string[] = [];
  lines.push(`Query: ${input.query}`);
  lines.push("");
  lines.push(
    `Iteration: ${input.iterationIndex} of max ${input.maxIterations}`,
  );
  lines.push("");
  lines.push("Previous steps:");
  if (input.previousSteps.length === 0) {
    lines.push("  (none — this is the first decision)");
  } else {
    input.previousSteps.forEach((step, idx) => {
      lines.push(`  ${idx}. ${formatStep(step)}`);
    });
  }
  lines.push("");
  lines.push("Skill pack eligibility:");
  if (input.skillPackEligibility.length === 0) {
    lines.push("  (none — no skill packs opted into agentic mode)");
  } else {
    input.skillPackEligibility.forEach((pack) => {
      lines.push(formatEligibility(pack));
    });
  }
  lines.push("");
  lines.push("Decide the next action. Respond with raw JSON.");
  return lines.join("\n");
}

function formatStep(step: AgenticPlannerStep): string {
  if (step.kind === "retrieve") {
    return `retrieve(mode=${step.retrievalMode}, blocks=${step.contextBlockCount}, citations=${step.citationCount}, durMs=${step.durationMs})`;
  }
  return `answer(confidence=${step.confidence ?? "n/a"}, durMs=${step.durationMs})`;
}

function formatEligibility(pack: AgenticPlannerEligiblePack): string {
  const status = pack.agenticEligible ? "eligible" : "opt-out";
  return `  - ${pack.skillKey} [${status}] templates=[${pack.templateKeys.join(", ")}]`;
}

/**
 * Parse the model's response into an `AgenticPlannerAction`.
 *
 * Lenient about markdown fences (a common LLM quirk) but otherwise
 * returns whatever JSON.parse yielded. The loop's
 * `validateAgenticPlannerAction` is the strict gate downstream — any
 * malformed shape lands as `terminationReason: "invalid_action"` with
 * a structured reason that propagates to the why-this-answer panel.
 *
 * Exposed for testing.
 */
export function parseModelResponse(raw: string): AgenticPlannerAction {
  const stripped = stripCodeFences(raw).trim();
  if (stripped.length === 0) {
    return placeholderInvalid("model returned empty output");
  }
  try {
    const parsed = JSON.parse(stripped);
    // Pass-through. validateAgenticPlannerAction validates shape
    // downstream; we don't double-validate here so a single error
    // path drives the trace surface.
    return parsed as AgenticPlannerAction;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return placeholderInvalid(`model output is not valid JSON: ${message}`);
  }
}

/**
 * Returns a shape the loop's validator will reject with
 * `kind="invalid_model_output"` (not in the allowed set) so the
 * termination reason surfaces clearly. We do NOT return the
 * passthrough so the validator catches it consistently.
 */
function placeholderInvalid(reason: string): AgenticPlannerAction {
  return {
    kind: "invalid_model_output" as unknown as "stop",
    reason,
  } as AgenticPlannerAction;
}

function stripCodeFences(raw: string): string {
  // Strip ``` and ```json fences if present.
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/m;
  const m = raw.trim().match(fence);
  return m ? m[1] : raw;
}
