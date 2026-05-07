# Phase 28.7 — LR-01 Deferral Decision

**Captured:** 2026-05-07 against `main@42ccc3d` (post-Phase-28.6b merge).
**Branch:** `docs/pmb-phase-28-7-defer-lr-01`.
**Owner:** Governance role per AGENTS.md.

---

## TL;DR

**Decision: DEFER LR-01 simulation migration to Phase 29.** Phase 28.6b shipped the `runViaOpenllmBridge` primitive that the simulation migration needs; Phase 29 now owns the caller-side migration alongside LR-02/03/04/08, all of which share the same "caller-side wiring" theme. Per the Phase 27.4 precedent ("Items 5–11 in the 27.4 decision matrix are pre-existing register entries with deadlines flipped from 'Phase 27' to 'Phase 28'; none of them count as new"), a deadline roll is **not a new TEMPORARY_EXCEPTION**. Phase 28's exception cap stays at **0 / 1 allowed**.

User authorized the deferral on 2026-05-07 after surfacing the migration's scope.

---

## Investigation

The Phase 28.7 plan called for migrating `simulation.ts:808` (`runViaOpenAIDirect`) and `simulation.ts:826` (`runViaOpenllmAgent`) onto Model Access primitives, plus deleting the four dead adapter functions (`runViaOpenllmAgent`, `runViaOpenAIDirect`, `resolveProviderApiKey`, `resolveOpenllmEndpoint`). The 28.6b primitive build is complete and ready to consume. So why defer?

### Mechanical work was substantial

Reading the simulation call site (lines 540–970) shows the migration touches more than the two named call sites:

1. **Endpoint resolution** (`resolveOpenllmEndpoint(providerConfig)`) → `resolveForRun({draftId})` binding lookup. About 5 lines.
2. **Two `await runVia...` calls** → `gatewayCall` to `modelAccess.execute` + direct-import of `runViaOpenllmBridge`. About 30 lines, including result-shape mapping (existing code uses the `OpenllmRuntimeResult` shape extensively post-call).
3. **~6 references to `endpoint.X`** (`endpoint.source`, `endpoint.wsUrl`, `endpoint.provider`, `endpoint.model`) in the metadata payload code. Replace with binding-derived values + `providerConnectionId`.
4. **Delete 4 functions** from the AS adapter; delete `openai-direct-adapter.ts` entirely. Update `chat-binding.test.ts` mock.
5. **Update stale comments** in `chat.ts`, `api/router.ts`, `provider-sync.ts`.
6. **Update boundary lint** (purge LR-01 allowlist), tripwire test, register, plan.

Total: ~300 LOC across 8+ files.

### No simulation runtime tests exist

```
$ find . -path ./node_modules -prune -o -name '*simulation*test*' -print
(no results)
```

Simulation is a production agent test path. Without unit tests, regressions on subtle behavior changes (intent flag, missing payload field, result-shape mapping mismatch) ship silently until a live run exercises them. TypeScript catches missed `endpoint.X` references at compile time, but not behavior drift.

### Pattern consistency with the rest of Phase 28

Phase 28 has now deferred 4 LRs (-02, -03, -04, -08) for the same reason — caller-side migration needs careful workspace/binding decisions and would conflate primitive-build with caller-rewire. LR-01's caller-side migration has the same shape: the binding lookup is straightforward, but the metadata-payload reshape touches a critical path. Bundling it with the rest in Phase 29 produces a coherent migration phase rather than splitting "Phase 28 closes some callers, Phase 29 closes others."

---

## Three options considered

### Option α — Full migration in 28.7

Largest single Phase 28 PR (~300 LOC). Closes the original "Phase 27 single exception." Phase 28 ends with 3 of 7 LRs migrated. Risk: silent simulation regression possible without test coverage; live-smoke is the only catch.

**Why not chosen:** the regression risk on a critical agent-test path, combined with the absence of unit tests, makes the cost-benefit unfavorable for a Phase 28 close-out PR. Phase 29 will already be running coordinated caller-migration smoke-tests; adding LR-01 to that batch is operationally cheaper.

### Option β — Defer LR-01 to Phase 29 (CHOSEN)

Phase 29 owns all 5 caller migrations (LR-01/02/03/04/08) under one phase. Phase 28's primitive builds (28.4 embed + 28.6b bridge) are ready and waiting. Phase 28 ends with 2 of 7 LRs migrated + 2 new primitives + 4 register-row corrections (LR-09 already-fixed; LR-04 reclassified; LR-02/03 deadline rolled; LR-08 deadline rolled).

**Why chosen:** consistent with the rest of Phase 28's deferral pattern; cleaner phase identity ("primitive layer" vs. "caller migration layer"); Phase 29 can run all caller migrations through a coordinated smoke-test rollout. LR-01 is independent of the workspace-default-binding decision (simulation has `draft.id` in scope) so it can ship as Phase 29's *first* sub-phase, ahead of the other 4.

### Option γ — Half-close: migrate `runViaOpenAIDirect` only

Doesn't solve the metadata-payload-reshape problem (still touches the `endpoint.X` references). Leaves the register row half-closed, awkward for the closure report. **Not chosen.**

---

## What this PR changes

1. This decision doc.
2. `LEGACY_EXCEPTION_REGISTER.md` LR-01 row — `Deadline phase` flipped from "Phase 28" to "Phase 29"; `Reason retained` rewritten to cite this doc and reference the 28.6b primitive that's now ready.
3. `LEGACY_EXCEPTION_REGISTER.md` Phase 28 sub-phase mapping table — LR-01 row updated to `28.7 (DEFERRED → Phase 29)`.
4. `PHASE_28_EXECUTION_PLAN.md` 28.7 sub-phase — marked DEFERRED with cite to this doc.
5. `PHASE_29_SCOPING.md` — caller list expanded to include LR-01; sub-phase decomposition adds an early "29.0a — LR-01 simulation migration" entry that doesn't depend on workspace-default-binding.

No code changes. No new TEMPORARY_EXCEPTION_WITH_DEADLINE introduced (deadline roll only).

---

## Acceptance criteria — met

- [x] Decision doc landed.
- [x] Reason for deferral named (no simulation tests, ~300 LOC migration, pattern consistency with the rest of Phase 28).
- [x] Phase 28 plan reflects 28.7's deferred status.
- [x] Phase 29 scoping doc reflects LR-01's addition.
- [x] No new exception introduced; cap stays 0 / 1 allowed.
- [x] User explicitly authorized the deferral.

---

## Lesson reinforced

This is the **sixth** Phase-28 sub-phase to discover that the prescribed fix didn't fit cleanly into a single sub-phase. Counting:

| Sub-phase | LR | Discovery |
|---|---|---|
| 28.1 | LR-09 | ALREADY_FIXED — surface eliminated by PR #100 *before* register was created |
| 28.2 | LR-06 | Scope-A choice — preserve legacy `providers` table to avoid breaking 3 downstream readers |
| 28.3 | LR-08 | DEFERRED — `providerRouter` routing-layer migration is Phase-shaped, not sub-phase-shaped |
| 28.4 | LR-04 | Reclassified — chat-completion caller, not embedding caller; register grouping was wrong |
| 28.6 | (LR-01 indirectly) | Narrowed — only one new primitive needed (bridge), not two; "streaming-with-tool-calls" had no consumer |
| 28.7 | LR-01 | DEFERRED — primitive ready but caller-migration scope better grouped with other caller migrations in Phase 29 |

**The pattern is consistent:** when locking sub-phase scope, walk the actual call sites first; the register and earlier plan docs describe scope at write-time, not at execution-time. Five of these six discoveries surfaced via re-grepping against current code, not via static review. PR #223 (migration 0042 path) and PR #224 (`useCount` field) showed the same shape; this is now an established Phase 28 lesson.

For Phase 29 planning, the same principle applies: the §29.1 workspace-default-binding decision needs to walk through each of the 5 deferred callers individually before locking primitive contracts. Don't assume the 5 callers all have the same workspace-context shape — they don't (`embeddings/service.ts` is a singleton; `operators/provider-hub.ts` is operator-keyed; `chat/stream.ts` is HTTP-endpoint-driven; `executeInvokeAgent` is automation-workflow-driven; `simulation.ts` is agent-keyed and already has `draft.id` in scope).
