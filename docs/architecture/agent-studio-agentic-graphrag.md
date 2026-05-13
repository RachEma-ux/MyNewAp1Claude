# Agent Studio — Agentic GraphRAG ADR (Phase 13.5)

**Status:** ACTIVE (2026-05-13). V1.0 Phase 13.5 complete on `main` — PR #731 (contract) + PR #732 `ffb4eba9` (engine wiring + RoundRobinPlanner) + PR #737 `a8f5c634` (model-driven planner).
**Decision owner:** Planner agent + Governance review before promoting to "Accepted".
**V1+ execution plan reference:** `agent-studio-native-graph-workspace-v1-v2-execution-plan.md` Phase 13.5
**Predecessor:** Graph Agent Lite (`services/graph-agent/engine.ts`) — fixed plan → retrieve → reason → answer pipeline (G9 closure).

---

## Context

Graph Agent Lite (Phase 13) implements a **fixed** four-step pipeline:

```
plan_retrieval_mode → retrieve → reason → answer
```

The retrieval mode is picked once by `pickRetrievalMode()` and the loop does not adapt — if the first retrieval round returns insufficient evidence, the agent answers with what it has (or refuses). This is intentional for MVP 4: G9 boundary verification is easier on a fixed pipeline, and overbuilding adaptive planning in MVP risks the dispatcher / governance / mutation boundaries the plan locked down.

Phase 13.5 promotes the agent to an **adaptive** planner that can:

- Replan retrieval modes after seeing intermediate results
- Iterate up to a bounded N times (default 4)
- Short-circuit when answer-confidence ≥ threshold or budget exhausted
- Emit a trace step per iteration so audit can reconstruct the decision tree

**Without weakening any of the existing boundaries.**

## Decision

### AgenticPlanner contract

A new TypeScript interface — `AgenticPlanner` — is the single contract surface:

```ts
interface AgenticPlannerInput {
  readonly query: string;
  readonly previousSteps: ReadonlyArray<AgenticPlannerStep>;
  readonly iterationIndex: number;          // 0-based; 0 = first plan call
  readonly maxIterations: number;           // hard ceiling, see §"Bounded loop"
  readonly skillPackEligibility: ReadonlyArray<AgenticPlannerEligiblePack>;
}

type AgenticPlannerAction =
  | { kind: "retrieve"; retrievalMode: GraphRetrievalMode; reason: string }
  | { kind: "answer"; reason: string }
  | { kind: "stop"; reason: string };

interface AgenticPlanner {
  plan(input: AgenticPlannerInput): Promise<AgenticPlannerAction>;
}
```

The planner **cannot** declare:

- `kind: "dispatch_tool"` — tool invocation routes only through the existing `dispatchMcpToolCall()` chokepoint, called by the engine after a `retrieve` action resolves
- `kind: "mutate_graph"` — mutations go through Phase 11.5 proposal/approval, never the agent
- `kind: "call_model"` — models go through OpenRouter Model Access; the planner doesn't call them directly

This restricts the planner's blast radius to **routing decisions only**.

### Bounded loop

The agentic loop is bounded by three independent ceilings, ANY of which terminates:

| Bound | Default | Source |
|---|---|---|
| `maxIterations` | 4 | Constructor parameter to `AgenticLoopOptions`; environment override via `AGS_AGENTIC_MAX_ITERATIONS` |
| Wall-clock budget | 30 s | Constructor parameter; protects against runaway model latency |
| Confidence threshold | 0.85 | When the answer-confidence after a `retrieve` step ≥ threshold, the planner SHOULD return `{ kind: "answer" }`; the engine accepts any answer at or after this point |

The loop **always** terminates within `maxIterations + 1` planner calls — one extra call is for the final `answer` / `stop` decision.

### Boundary table (preserved)

| Boundary | Rule for Agentic GraphRAG |
|---|---|
| Graph access | All graph reads still go through `GraphRepository`. The agentic loop calls the existing `GraphRetrievalRouter.retrieve()` — no new graph entry point. |
| Tool dispatch | Tools route through `dispatchMcpToolCall()`. The planner never returns a tool-dispatch action; if a retrieve action implies a tool call (e.g. KGRA-extraction path), the engine resolves it via the existing dispatcher path. Source-scan tested. |
| Model execution | OpenRouter Model Access. The planner itself can be model-backed (typically is — a small fast model picks the next action), but the model call goes through the same `ModelAccessAdapter` Graph Agent Lite uses. |
| Graph mutation | Forbidden. The agentic loop is read-only by interface design: `AgenticPlannerAction` has no mutation variant. Source-scan tested. |
| Governance | Skill packs must declare `agenticEligible: boolean` (new column on `ags_graph_skill_packs`). Only eligible packs can be selected by the loop. The planner input includes only eligible packs. |
| Approval | Unchanged. The agent does not propose mutations; it only retrieves + answers. Operator-facing surfaces (Why-This-Answer, decision-trace) still apply. |
| Audit | Every iteration writes a `graphAgentDecisionTrace` step row (`stepKind: "agentic_iteration_<N>"`). Existing decision-trace UI surfaces show the iterations. |

### Skill pack agentic-eligibility

A new column on `ags_graph_skill_packs`:

```ts
agenticEligible: boolean (NOT NULL, DEFAULT false)
```

Default `false` means existing skill packs do NOT participate in agentic loops without an explicit operator opt-in. The migration is additive; no behavior change for the fixed Phase 13 Graph Agent Lite engine.

Operators opt a skill pack into agentic mode via the existing `graphSkill.updatePack` tRPC procedure (no new procedure needed; the column is just exposed in the input schema in a follow-up PR).

### Why-This-Answer extensions

The existing `whyThisAnswer` JSON already carries `retrievalMode`, `skillPackKey`, `templateKey`, `graphBackendKey`, `projectionSnapshotId`, `truncationReason`. Phase 13.5 adds (in the follow-up engine-wiring PR):

```ts
agenticIterations?: number;           // count of planner iterations actually run
agenticTerminationReason?: string;    // "max_iterations" | "confidence" | "budget" | "planner_stop"
```

Backwards-compatible: existing consumers see undefined when the run was non-agentic.

### What this PR ships

Phase 13.5 / PR #1 ships **contract-only**. No engine wiring, no model calls, no production behavior change:

1. This ADR
2. `server/agent-studio/services/graph-agent/agentic-planner-contract.ts` — TS contracts (types only, plus a pure `validateAgenticPlannerAction()` helper)
3. `server/agent-studio/services/graph-agent/agentic-loop.ts` — Stub loop class with a no-op planner returning `{ kind: "stop" }`; never makes a model call; never calls retrieval. Used by the boundary tests to assert the contract holds even when the loop is a no-op.
4. `tests/agent-studio/agentic-planner-boundary.test.ts` — Source-scan + behavioral tests:
   - No `neo4j-driver` import in `agentic-*.ts`
   - No `dispatchMcpToolCall` reference in `agentic-*.ts`
   - `AgenticPlannerAction` union has exactly 3 variants (retrieve / answer / stop); no `dispatch_tool` / `mutate_graph` / `call_model` variants exist
   - The loop terminates within `maxIterations + 1` planner calls
   - The loop emits zero retrieval calls when the planner returns `{ kind: "stop" }`

### What ships in PR #2 (out of scope)

- Real planner implementation (model-backed; uses ModelAccessAdapter)
- Engine wiring (`GraphAgentEngine.run()` takes an `agenticPlanner?: AgenticPlanner` option; if supplied, the engine runs the bounded loop instead of the fixed pipeline)
- Decision-trace writer extension (step rows per iteration)
- `agenticEligible` column migration + skill-pack input schema
- Property-based test family extension (multi-iteration permission leak)
- `whyThisAnswer` extensions

## Consequences

| Effect | Notes |
|---|---|
| New types under `services/graph-agent/` | Additive only; existing engine unaffected |
| Stub loop is reachable from public-api | Yes, but only as a contract — never used in production code paths in PR #1 |
| Boundary tests prevent regression | Source-scan + behavioral. CI Layer 9 picks them up automatically. |
| No DB migration in PR #1 | Migration is PR #2 territory |
| No runtime cost in PR #1 | Zero; nothing wires the new types into the request path |

## Rollback

PR #1 ships only types + stub + tests. To roll back: revert the PR. No data migration, no consumer breakage.

PR #2 (engine wiring) will be the first PR with behavior change; that PR will have its own rollback path (engine accepts `agenticPlanner?: AgenticPlanner` optionally — omitting it preserves the fixed Phase 13 pipeline).

## PR #3 addendum — model-driven planner (2026-05-13)

PR #3 lands the LLM-emitted-plan planner alongside the round-robin
baseline shipped in PR #2. It is **additive** — the engine continues
to accept any `AgenticPlanner`, so deterministic operator modes
(round-robin) and adaptive modes (model-driven) coexist behind the
same `agenticPlanner?` option.

### What PR #3 ships

1. `server/agent-studio/services/graph-agent/agentic-model-planner.ts`
   - `createModelDrivenPlanner({ modelCall, systemPromptOverride? })`
     returning an `AgenticPlanner` that emits an `AgenticPlannerAction`
     by calling the injected model shim each turn.
   - `buildUserPrompt(input)` — exported for testing; renders query +
     iteration index + max iterations + previous-step history +
     skill-pack eligibility into a single user prompt.
   - `parseModelResponse(raw)` — exported for testing; strips markdown
     code fences and `JSON.parses` the model output; malformed input
     returns a placeholder shape the loop validator rejects with
     `terminationReason: "invalid_action"`.
   - `AgenticPlannerModelCall` — narrow callable type. Operator wires
     this to the existing OpenRouter `execute()` path in production;
     unit tests stub it directly. The planner stays agnostic of
     `providerConnectionId / modelRef / workspaceId / actorId` so the
     unit suite needs no model-access boundary.
2. `tests/agent-studio/agentic-model-planner.test.ts` — 20 tests
   covering: each closed-union action variant, markdown-fence
   stripping, malformed-JSON handling (empty / truncated / non-JSON),
   prompt construction (system + user), end-to-end with
   `runAgenticLoop` for both happy-path and `invalid_action` paths,
   and `systemPromptOverride` honoring.

### Why a narrow callable instead of the engine's `ModelAccessAdapter`?

The engine's adapter (added in PR #2) carries the chat-message shape
and tool-call passthrough that runtime callers need. The planner only
needs `(systemPrompt, userPrompt) → text` — a strictly smaller surface
— which is why PR #3 defines its own `AgenticPlannerModelCall` type.
Production wiring composes them: a small adapter function in the
runtime path translates `AgenticPlannerModelCall(input)` into the
appropriate `ModelAccessExecuteInput` with operator-supplied
`providerConnectionId / modelRef / intent / workspaceId / actorId`.

This composition keeps:
- The planner pure (no boundary coupling).
- The model-access boundary unchanged (PR #3 imports nothing from
  `server/openrouter/model-access`).
- Operator-controlled provider/model selection at the runtime path,
  not the planner.

### Failure path

A malformed model response (non-JSON, wrong shape, missing fields)
hits `validateAgenticPlannerAction` in the loop and lands as
`terminationReason: "invalid_action"` with an `invalidActionReason`
string suitable for the why-this-answer panel. No retry/rewrite in
PR #3 — operator either:
- Lowers the temperature in the bound model config, or
- Uses round-robin instead, or
- Files a model-prompt-tuning issue against the system prompt.

A model-output reformatting retry layer is V1.5 scope and intentionally
deferred — it adds complexity (and budget consumption) for a path that
is rare in practice with a properly-bound model.

## Reference

- V1+ plan: `agent-studio-native-graph-workspace-v1-v2-execution-plan.md` Phase 13.5
- Graph Agent Lite engine: `server/agent-studio/services/graph-agent/engine.ts`
- Boundary tests: `tests/agent-studio/agentic-planner-boundary.test.ts`
- Model-planner tests: `tests/agent-studio/agentic-model-planner.test.ts`
- CLAUDE.md hard rules: §"Native Graph Workspace — Non-Build List"
