/**
 * Native Graph Workspace V1.0 — Phase 13.5 / PR #1.
 *
 * Agentic GraphRAG — loop stub.
 *
 * PR #1 ships a no-op loop that drives the planner ≤ maxIterations + 1
 * times and short-circuits to `kind: "stop"` whenever the planner
 * indicates stop. The stub:
 *
 *   - Never calls `GraphRetrievalRouter.retrieve()` (planners returning
 *     `kind: "retrieve"` are recorded in the trace but the stub does
 *     NOT execute retrieval — that wiring is PR #2 scope).
 *   - Never calls `dispatchMcpToolCall()` — by interface design, the
 *     planner cannot request tool dispatch.
 *   - Never mutates the graph.
 *   - Never imports `neo4j-driver`.
 *
 * The stub exists to:
 *   1. Make the contract callable from PR #1 tests.
 *   2. Prove the loop terminates within `maxIterations + 1` planner
 *      calls regardless of planner cooperation.
 *   3. Provide the engine-wiring extension point for PR #2.
 *
 * See: docs/architecture/agent-studio-agentic-graphrag.md
 */

import {
  DEFAULT_AGENTIC_LOOP_BUDGET,
  type AgenticLoopBudget,
  type AgenticPlanner,
  type AgenticPlannerAction,
  type AgenticPlannerEligiblePack,
  type AgenticPlannerStep,
  validateAgenticPlannerAction,
} from "./agentic-planner-contract.js";

export interface AgenticLoopOptions {
  readonly planner: AgenticPlanner;
  readonly budget?: Partial<AgenticLoopBudget>;
  readonly skillPackEligibility?: ReadonlyArray<AgenticPlannerEligiblePack>;
  /**
   * Optional clock injection so tests can deterministically exercise
   * the wall-clock budget without sleeping.
   */
  readonly now?: () => number;
}

export interface AgenticLoopResult {
  readonly steps: ReadonlyArray<AgenticPlannerStep>;
  readonly actions: ReadonlyArray<AgenticPlannerAction>;
  readonly plannerCallCount: number;
  readonly terminationReason:
    | "planner_stop"
    | "planner_answer"
    | "max_iterations"
    | "wall_clock_budget"
    | "invalid_action";
  readonly invalidActionReason?: string;
}

export interface AgenticLoopInput {
  readonly query: string;
}

/**
 * Drive the agentic loop.
 *
 * Contract guarantees:
 *   - `result.plannerCallCount <= budget.maxIterations + 1`. The "+1"
 *     covers the final answer/stop decision after the last retrieve.
 *   - Loop terminates within `budget.wallClockBudgetMs` (best-effort;
 *     the planner itself is awaited so a planner that exceeds budget
 *     completes before the loop notices, then the next iteration
 *     short-circuits).
 *   - The loop NEVER calls retrieval / dispatcher / model — those
 *     calls live in the engine (PR #2). PR #1 is contract-only.
 */
export async function runAgenticLoop(
  input: AgenticLoopInput,
  options: AgenticLoopOptions,
): Promise<AgenticLoopResult> {
  const budget: AgenticLoopBudget = {
    ...DEFAULT_AGENTIC_LOOP_BUDGET,
    ...(options.budget ?? {}),
  };
  const now = options.now ?? Date.now;
  const startedAt = now();
  const skillPackEligibility = options.skillPackEligibility ?? [];

  const steps: AgenticPlannerStep[] = [];
  const actions: AgenticPlannerAction[] = [];
  let plannerCallCount = 0;

  // Hard ceiling: maxIterations + 1 (one extra for the final
  // answer/stop call after the last retrieve).
  const callCeiling = budget.maxIterations + 1;

  for (let i = 0; i < callCeiling; i++) {
    if (now() - startedAt >= budget.wallClockBudgetMs) {
      return {
        steps,
        actions,
        plannerCallCount,
        terminationReason: "wall_clock_budget",
      };
    }

    plannerCallCount++;
    const rawAction = await options.planner.plan({
      query: input.query,
      previousSteps: steps,
      iterationIndex: i,
      maxIterations: budget.maxIterations,
      skillPackEligibility,
    });

    const validation = validateAgenticPlannerAction(rawAction);
    if (!validation.ok) {
      // tsc with strictNullChecks=false (repo default) doesn't narrow
      // the discriminated union after `!validation.ok`; pull the
      // failure-variant payload explicitly so the access type-checks.
      const failure = validation as Extract<typeof validation, { ok: false }>;
      return {
        steps,
        actions,
        plannerCallCount,
        terminationReason: "invalid_action",
        invalidActionReason: failure.reason,
      };
    }
    const success = validation as Extract<typeof validation, { ok: true }>;
    actions.push(success.action);

    if (success.action.kind === "stop") {
      return {
        steps,
        actions,
        plannerCallCount,
        terminationReason: "planner_stop",
      };
    }
    if (success.action.kind === "answer") {
      return {
        steps,
        actions,
        plannerCallCount,
        terminationReason: "planner_answer",
      };
    }
    // kind === "retrieve" — PR #1 stub records the planner's intent
    // but does NOT execute retrieval. PR #2 wires the engine to call
    // GraphRetrievalRouter.retrieve() here.
    steps.push({
      kind: "retrieve",
      retrievalMode: success.action.retrievalMode,
      contextBlockCount: 0,
      citationCount: 0,
      durationMs: 0,
    });
  }

  return {
    steps,
    actions,
    plannerCallCount,
    terminationReason: "max_iterations",
  };
}

// ─────────────────────────────────────────────────────────────────────
// Always-stop planner — used by the stub + by tests that want to
// exercise the loop without engine wiring.
// ─────────────────────────────────────────────────────────────────────

export const ALWAYS_STOP_PLANNER: AgenticPlanner = {
  async plan() {
    return { kind: "stop", reason: "stub planner — PR #1 contract-only" };
  },
};

// ─────────────────────────────────────────────────────────────────────
// Phase 13.5 PR #2 — RoundRobinPlanner.
//
// Real, model-free planner. Cycles through a fixed sequence of
// retrieval modes for `maxIterations` steps, then returns
// `{ kind: "answer" }`. Useful as:
//   - Operator-controlled deterministic mode (no LLM dependency).
//   - Engine wiring test target (no OpenRouter call required).
//   - V1.5 baseline before model-backed planners land.
//
// Boundary preservation is by interface — this planner only returns
// closed-union actions, so it cannot dispatch tools, mutate the
// graph, or call models directly.
// ─────────────────────────────────────────────────────────────────────

import type { RetrievalMode } from "../graph/retrieval/retrieval-router.js";

export interface RoundRobinPlannerOptions {
  /** Sequence of retrieval modes to cycle. */
  readonly modes: ReadonlyArray<RetrievalMode>;
}

export function createRoundRobinPlanner(
  options: RoundRobinPlannerOptions,
): AgenticPlanner {
  if (options.modes.length === 0) {
    throw new Error("RoundRobinPlanner requires at least one retrieval mode");
  }
  return {
    async plan(input) {
      // After consuming `maxIterations` retrieve steps, return answer.
      if (input.iterationIndex >= input.maxIterations) {
        return {
          kind: "answer",
          reason: "round-robin budget exhausted",
        };
      }
      const mode = options.modes[input.iterationIndex % options.modes.length];
      return {
        kind: "retrieve",
        retrievalMode: mode,
        reason: `round-robin step ${input.iterationIndex} of ${input.maxIterations}`,
      };
    },
  };
}
