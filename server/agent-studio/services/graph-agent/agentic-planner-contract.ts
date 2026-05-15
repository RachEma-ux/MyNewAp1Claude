/**
 * Native Graph Workspace V1.0 — Phase 13.5 / PR #1.
 *
 * Agentic GraphRAG — planner contract (types only; no runtime behavior).
 *
 * This file is the **single contract surface** for adaptive graph-agent
 * planning. It is intentionally narrow: an `AgenticPlanner` decides
 * which retrieval mode to run next, when to answer, or when to stop.
 * It CANNOT declare tool dispatches, graph mutations, or direct model
 * calls — those routes belong to the engine + the existing chokepoints
 * (`dispatchMcpToolCall`, `GraphRepository`, `ModelAccessAdapter`).
 *
 * Locked boundaries (source-scan tested in
 * `tests/agent-studio/agentic-planner-boundary.test.ts`):
 *   - No `neo4j-driver` import anywhere in `agentic-*.ts`.
 *   - No `dispatchMcpToolCall` reference anywhere in `agentic-*.ts`.
 *   - `AgenticPlannerAction` is a closed union of exactly 3 variants.
 *     Any new variant must update the ADR + the boundary test.
 *
 * See: docs/architecture/agent-studio-agentic-graphrag.md
 */

import type { RetrievalMode } from "../graph/retrieval/retrieval-router.js";

// ─────────────────────────────────────────────────────────────────────
// Skill-pack eligibility (V1.0 — agenticEligible column lands in PR #2)
// ─────────────────────────────────────────────────────────────────────

export interface AgenticPlannerEligiblePack {
  /** Stable skill-pack key (e.g. "vault_navigator"). */
  readonly skillKey: string;
  /** Cypher template keys this pack can execute. */
  readonly templateKeys: ReadonlyArray<string>;
  /**
   * Whether the operator has opted this pack into agentic loops.
   * Default `false` for safety — see ADR §"Skill pack agentic-eligibility".
   */
  readonly agenticEligible: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Loop step record — what the planner sees from previous iterations
// ─────────────────────────────────────────────────────────────────────

export interface AgenticPlannerStepRetrieve {
  readonly kind: "retrieve";
  readonly retrievalMode: RetrievalMode;
  readonly contextBlockCount: number;
  readonly citationCount: number;
  readonly durationMs: number;
}

export interface AgenticPlannerStepAnswer {
  readonly kind: "answer";
  readonly confidence?: number;
  readonly durationMs: number;
}

export type AgenticPlannerStep =
  | AgenticPlannerStepRetrieve
  | AgenticPlannerStepAnswer;

// ─────────────────────────────────────────────────────────────────────
// Planner input + action
// ─────────────────────────────────────────────────────────────────────

export interface AgenticPlannerInput {
  readonly query: string;
  /** Steps already executed. Empty on the first call. */
  readonly previousSteps: ReadonlyArray<AgenticPlannerStep>;
  /** 0-based iteration index. iterationIndex === 0 means "about to issue first step". */
  readonly iterationIndex: number;
  /** Hard ceiling on iterations. Engine MUST enforce this independent of planner cooperation. */
  readonly maxIterations: number;
  /** Skill packs the operator has opted into agentic mode. May be empty. */
  readonly skillPackEligibility: ReadonlyArray<AgenticPlannerEligiblePack>;
}

/**
 * Closed union of allowed planner actions.
 *
 * REGRESSION GUARD: adding a 4th variant (e.g. "dispatch_tool" /
 * "mutate_graph" / "call_model") requires:
 *   1. Updating the ADR boundary table.
 *   2. Updating `AGENTIC_PLANNER_ACTION_KINDS` below.
 *   3. Updating the boundary test in
 *      `tests/agent-studio/agentic-planner-boundary.test.ts` —
 *      which will fail loudly until the new variant is justified.
 */
export type AgenticPlannerAction =
  | { kind: "retrieve"; retrievalMode: RetrievalMode; reason: string }
  | { kind: "answer"; reason: string }
  | { kind: "stop"; reason: string };

export const AGENTIC_PLANNER_ACTION_KINDS = ["retrieve", "answer", "stop"] as const;
export type AgenticPlannerActionKind = (typeof AGENTIC_PLANNER_ACTION_KINDS)[number];

// ============================================================================
// Per-action-kind operator-facing metadata (T-G.35)
// ============================================================================

export interface AgenticPlannerActionKindMetadata {
  /** Display label rendered in the agent-trace UI's step list. */
  readonly label: string;
  /** Short operator-facing description of what the action does. */
  readonly description: string;
  /** Whether this action ends the planning loop (true) or continues it
   *  with another iteration (false). The engine reads this to decide
   *  whether to call the planner again. */
  readonly terminatesLoop: boolean;
  /** Whether this action produces a user-visible answer (true) — only
   *  `answer` does. */
  readonly producesAnswer: boolean;
}

export const AGENTIC_PLANNER_ACTION_KIND_METADATA: Readonly<
  Record<AgenticPlannerActionKind, AgenticPlannerActionKindMetadata>
> = {
  retrieve: {
    label: "Retrieve",
    description:
      "Planner requests another retrieval pass with a specified mode — the engine invokes the retrieval pipeline and re-plans.",
    terminatesLoop: false,
    producesAnswer: false,
  },
  answer: {
    label: "Answer",
    description:
      "Planner has sufficient evidence to answer — engine synthesizes the response from the accumulated retrieval context and stops.",
    terminatesLoop: true,
    producesAnswer: true,
  },
  stop: {
    label: "Stop",
    description:
      "Planner cannot proceed (e.g. iteration budget exceeded, retrieval failed irreversibly) — engine emits a partial-answer trace with the reason.",
    terminatesLoop: true,
    producesAnswer: false,
  },
};

export function getAgenticPlannerActionKindMetadata(
  kind: AgenticPlannerActionKind,
): AgenticPlannerActionKindMetadata {
  return AGENTIC_PLANNER_ACTION_KIND_METADATA[kind];
}

// ─────────────────────────────────────────────────────────────────────
// Planner interface
// ─────────────────────────────────────────────────────────────────────

export interface AgenticPlanner {
  /**
   * Decide the next action given the current state.
   *
   * The planner MUST be deterministic in its boundary behavior: regardless
   * of `iterationIndex` value, it must return a valid `AgenticPlannerAction`
   * within `maxIterations + 1` total invocations (PR #2 engine enforces
   * this independently — the planner cannot run forever).
   */
  plan(input: AgenticPlannerInput): Promise<AgenticPlannerAction>;
}

// ─────────────────────────────────────────────────────────────────────
// Validation helper — pure function, used by tests + engine wiring
// ─────────────────────────────────────────────────────────────────────

export type AgenticPlannerActionValidation =
  | { ok: true; action: AgenticPlannerAction }
  | { ok: false; reason: string };

/**
 * Pure validator. Confirms a planner-returned action is shape-correct
 * AND respects the closed-union contract. Returns a structured result
 * suitable for engine-side handling.
 *
 * Engine MUST call this on every planner return value before acting on
 * it; an `ok: false` result halts the loop with a clear reason.
 */
export function validateAgenticPlannerAction(
  raw: unknown,
): AgenticPlannerActionValidation {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, reason: "action is not an object" };
  }
  const obj = raw as { kind?: unknown };
  if (typeof obj.kind !== "string") {
    return { ok: false, reason: "action.kind is not a string" };
  }
  if (!(AGENTIC_PLANNER_ACTION_KINDS as ReadonlyArray<string>).includes(obj.kind)) {
    return {
      ok: false,
      reason: `action.kind="${obj.kind}" is not in the allowed set ${AGENTIC_PLANNER_ACTION_KINDS.join(", ")}`,
    };
  }
  const action = raw as AgenticPlannerAction;
  if (typeof action.reason !== "string" || action.reason.length === 0) {
    return { ok: false, reason: "action.reason must be a non-empty string" };
  }
  if (action.kind === "retrieve") {
    if (typeof (action as { retrievalMode?: unknown }).retrievalMode !== "string") {
      return { ok: false, reason: "retrieve action missing retrievalMode" };
    }
  }
  return { ok: true, action };
}

// ─────────────────────────────────────────────────────────────────────
// Loop budget contract — engine MUST honor these
// ─────────────────────────────────────────────────────────────────────

export interface AgenticLoopBudget {
  /** Hard ceiling on planner iterations. Default 4. ENV: AGS_AGENTIC_MAX_ITERATIONS. */
  readonly maxIterations: number;
  /** Hard ceiling on wall-clock duration. Default 30000 ms. */
  readonly wallClockBudgetMs: number;
  /**
   * Confidence threshold — when the latest answer-confidence ≥ this,
   * the planner SHOULD return `{ kind: "answer" }`. The engine accepts
   * an answer at or after this point but does NOT itself short-circuit
   * (the planner remains the decision-maker).
   */
  readonly confidenceThreshold: number;
}

export const DEFAULT_AGENTIC_LOOP_BUDGET: AgenticLoopBudget = {
  maxIterations: 4,
  wallClockBudgetMs: 30_000,
  confidenceThreshold: 0.85,
};
