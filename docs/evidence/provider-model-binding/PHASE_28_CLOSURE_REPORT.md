# Phase 28 — Closure Report

**Captured:** 2026-05-07 against `main@04a8344` (post-Phase-28.7 deferral merge).
**Branch (this doc):** `docs/pmb-phase-28-8-closure-report`.
**Owner:** Planner + Governance roles per AGENTS.md.

---

## TL;DR

Phase 28 closes with **2 LRs migrated, 1 reclassified, 4 deferred to Phase 29**, plus **2 new Model Access primitives** (`embed` + `runViaOpenllmBridge`) ready to consume. Zero new TEMPORARY_EXCEPTION_WITH_DEADLINEs introduced; cap stayed at **0 / 1 allowed**.

The original Phase 28 scope was "close the LR-01..09 register entries." Reality, surfaced by execution: **register entries described scope at write-time, not at execution-time.** Six of nine sub-phases discovered that the prescribed fix didn't fit cleanly into a single sub-phase. The honest move was to narrow Phase 28 to "build the primitive layer + close the easy LRs" and group the caller-side migrations (LR-01/02/03/04/08) into a coherent Phase 29.

---

## What shipped — PR ledger

| Sub-phase | PR | Merge SHA | Title |
|---|---|---|---|
| 28.0 | [#227](https://github.com/RachEma-ux/MyNewAp1Claude/pull/227) | `f0fa131` | Phase 28 execution plan — 6 LR closures, 9 sub-phases |
| 28.1 | [#228](https://github.com/RachEma-ux/MyNewAp1Claude/pull/228) | `9cac3de` | Close Phase 28.1 — LR-09 was already fixed by PR #100 |
| 28.2 | [#229](https://github.com/RachEma-ux/MyNewAp1Claude/pull/229) | `9a8d123` | Close Phase 28.2 — relocate provider env read out of boot (LR-06) |
| 28.3 | [#230](https://github.com/RachEma-ux/MyNewAp1Claude/pull/230) | `ba83f0d` | Defer LR-08 to Phase 29 — scope discovery during 28.3 |
| 28.4 | [#231](https://github.com/RachEma-ux/MyNewAp1Claude/pull/231) | `4522dc7` | Phase 28.4 — Model Access embedding-execute primitive |
| 28.6a | [#232](https://github.com/RachEma-ux/MyNewAp1Claude/pull/232) | `c9ac29f` | Phase 28.6a — openllm-agent bridge decision record (D-MA-TOOL-1..8) |
| 28.6b | [#233](https://github.com/RachEma-ux/MyNewAp1Claude/pull/233) | `42ccc3d` | Phase 28.6b — openllm-agent bridge primitive |
| 28.7 | [#234](https://github.com/RachEma-ux/MyNewAp1Claude/pull/234) | `04a8344` | Defer LR-01 simulation migration to Phase 29 |
| **28.8** | (this PR) | (TBD) | Closure report |

**Total: 9 PRs** (one per sub-phase, including the plan-freeze and closure-report bookends).

---

## What changed in the Legacy Exception Register

Before Phase 28 (`main@9a8d123` baseline):

| LR | File | Status | Deadline |
|---|---|---|---|
| LR-01 | `agent-studio/adapters/openllm-runtime-adapter.ts:312-321` | in_progress | Phase 28 |
| LR-02 | `embeddings/service.ts:54` | open | Phase 28 |
| LR-03 | `documents/processor.ts:339` | open | Phase 28 |
| LR-04 | `operators/provider-hub.ts:78` | open | Phase 28 |
| LR-05 | `data-analysis/omnirag-adapter.ts:57` | migrated | — (NOT_APPLICABLE) |
| LR-06 | `_core/index.ts:120-140` | open | Phase 28 |
| LR-08 | `chat/stream.ts` + `automation/block-executors.ts` | open | Phase 28 |
| LR-09 | `code-studio/opencode/provider-sync.ts:96` | open | Phase 28 |

After Phase 28 (`main@04a8344`):

| LR | File | Status | Deadline | Phase 28 Sub-phase |
|---|---|---|---|---|
| LR-01 | `agent-studio/adapters/openllm-runtime-adapter.ts:312-321` | open | Phase 29 | 28.6b primitive built ✓; 28.7 caller migration deferred |
| LR-02 | `embeddings/service.ts:54` | open | Phase 29 | 28.4 primitive built ✓; caller deferred |
| LR-03 | `documents/processor.ts:339` | open | Phase 29 | Closes transitively with LR-02 |
| LR-04 | `operators/provider-hub.ts:78` | open | Phase 29 | **Reclassified — chat-completion caller, not embedding** (28.4) |
| LR-05 | `data-analysis/omnirag-adapter.ts:57` | migrated | — | unchanged |
| **LR-06** | `_core/index.ts:120-140` | **migrated** | — | **28.2 — extracted to `seed-from-env.ts`** |
| LR-08 | `chat/stream.ts` + `automation/block-executors.ts` | open | Phase 29 | 28.3 deferred — routing-layer migration |
| **LR-09** | `code-studio/opencode/provider-sync.ts:96` | **migrated** | — | **28.1 — ALREADY_FIXED by PR #100 before register was created** |

**Net change: 2 LRs flipped to `migrated` (LR-06, LR-09); 4 LRs had deadlines rolled to Phase 29 (LR-01, LR-02, LR-03, LR-08); 1 LR was reclassified (LR-04).**

---

## What changed in the Model Access surface

Before Phase 28 — 3 actions on the Model Access surface:

```
openRouter.modelAccess.execute        (gateway-call, hybrid receipt)
openRouter.modelAccess.stream         (gateway-call wrapper + direct-import async generator)
openRouter.modelAccess.validateBinding (gateway-call, no receipt)
```

After Phase 28 — 4 gateway-callable actions plus 1 direct-import primitive:

```
openRouter.modelAccess.execute         (unchanged)
openRouter.modelAccess.stream          (unchanged)
openRouter.modelAccess.validateBinding (unchanged)
openRouter.modelAccess.embed           (NEW — Phase 28.4, D-MA-EMBED-1..7)
runViaOpenllmBridge                    (NEW direct-import — Phase 28.6b, D-MA-TOOL-1..8)
```

New decisions locked:

- **D-MA-EMBED-1..7** — embedding-execute primitive shape, OpenAI-compatible only, hybrid receipt, no auto-batch-split, dimension contract is caller-side. (`MODEL_ACCESS_EMBED_DECISION.md`)
- **D-MA-TOOL-1..8** — bridge primitive is direct-import (callbacks don't serialize), lives inside Model Access subtree (D2 boundary), `permissionResolver` callback contract preserved, `withProviderCredential` resolves credentials, MCP `configure_session` lifecycle preserved. Does NOT do multi-turn tool loops (no current consumer). (`MODEL_ACCESS_TOOL_LOOP_DECISION.md`)

---

## What changed in the boundary lint

Before Phase 28 — `scripts/check-provider-key-env-boundary.ts` carried 7 LR allowlist entries:

```
LR-01 (openllm-runtime-adapter.ts) — <dynamic>
LR-02 (embeddings/service.ts)
LR-03 (documents/processor.ts)
LR-04 (operators/provider-hub.ts)
LR-06 (_core/index.ts)
PMB-D1-EXEMPT (scripts/provider-connections/seed-from-env.ts) — <seed-script>
```

(LR-08 + LR-09 didn't have boundary lint entries because their surfaces don't read provider keys directly — LR-08 reads through the registry, LR-09 was already fixed by PR #100.)

After Phase 28:

```
LR-01 (openllm-runtime-adapter.ts) — <dynamic>     (deferred to Phase 29)
LR-02 (embeddings/service.ts)                      (deferred to Phase 29)
LR-03 (documents/processor.ts)                     (deferred to Phase 29)
LR-04 (operators/provider-hub.ts)                  (deferred to Phase 29)
                                                    (LR-06 entry purged)
PMB-D1-EXEMPT (scripts/provider-connections/seed-from-env.ts) — <seed-script>
```

**Net: 1 entry purged (LR-06).** Phase 29 will purge the remaining 4 (LR-01/02/03/04) as their callers migrate.

---

## CI fingerprint through the phase

Every Phase 28 PR landed at **5/5 green** as of `ff26796` (the post-D-CAG-RECON-2 close-out baseline). Specifically:

```
[completed/success] Governance Compliance Checks
[completed/success] Governance Enforcement Harness
[completed/success] build
[completed/success] ci
[completed/success] test
```

No CI regressions across the 9 PRs. Test sweeps passing through Phase 28:

- Model Access subtree: 52/52 (`execute` 12 + `stream` shared / `embed` 12 + `runViaOpenllmBridge` 18 + `manifest-receipt-policy` 10).
- Phase 28.2 seed script: 7/7 unit tests.

Total **net new tests added in Phase 28: 47** (12 embed + 18 bridge + 3 receipt-policy + 7 seed-script + 7 deriveOpenllmWsUrl/awaitWs harness assertions inside the bridge file).

---

## Phase 29 handoff

`PHASE_29_SCOPING.md` now lists **5 callers** to migrate:

| LR | Caller | Workspace context? | Phase 29 sub-phase |
|---|---|---|---|
| LR-01 | `agent-studio/services/simulation.ts:808, 826` | Yes — `draft.id` already in scope | **29.0a (FIRST — independent of §29.1)** |
| LR-02 | `embeddings/service.ts` | None | 29.4 (after §29.1 default-binding) |
| LR-03 | `documents/processor.ts:339` | Inherits from LR-02 | 29.4 (transitive) |
| LR-04 | `operators/provider-hub.ts:78` | None | 29.5 (after §29.1) |
| LR-08 | `chat/stream.ts` + `automation/block-executors.ts:executeInvokeAgent` | None | 29.6 (after §29.1 + §29.2/29.3 routing-layer ADR) |

LR-01's migration ships **first** because it doesn't depend on §29.1's workspace-default-binding decision. The other four wait for §29.1 to land.

Sizing estimate for Phase 29: **11–14 PRs, ~2,000–2,600 LOC**, dominated by the workspace-default-binding migration (§29.1) and `providerRouter` rewrite (§29.2/29.3).

Phase 29 is **not yet authorized for autonomous execution** — `project_phase_28_authority.md` scoped Phase 28 only. Phase 29 needs an explicit re-grant.

---

## Lessons — the six-instance pattern

Phase 28 surfaced a consistent pattern across six sub-phases: **register entries describe scope at write-time, not at execution-time.**

| Sub-phase | LR | Discovery |
|---|---|---|
| 28.1 | LR-09 | **ALREADY_FIXED** — PR #100 (`f824d8c`, 2026-05-04 13:39) eliminated the surface seven hours before the register was created in PR #104 (`5d7fd92`, 2026-05-04 20:34). Register row was inherited from a stale snapshot of the problem. |
| 28.2 | LR-06 | **Scope-A choice** — preserve legacy `providers` table to avoid breaking 3 downstream readers (`provider-sync.ts`, `web-instance-manager.ts`, `kgra-agent/nodes.ts`). Original plan said "switch target table to `provider_connections`" without naming the readers. |
| 28.3 | LR-08 | **DEFERRED** — `providerRouter` routing-layer is itself a registry consumer at lines 17, 137, 205. Migration is Phase-shaped, not sub-phase-shaped. Plus chat-stream has no `agentId` and `executeInvokeAgent` operates on the legacy `agents` table. |
| 28.4 | LR-04 | **Reclassified** — `provider-hub.ts` is a **chat-completion** caller (`/v1/chat/completions` with `gpt-4o-mini`), not an embedding caller. The Phase 27.4 matrix grouped it with LR-02/03 under "embedding-endpoint dependency" — that grouping was wrong. |
| 28.6a | (LR-01 indirect) | **Narrowed** — only one new primitive needed (bridge), not the two named in the plan ("streaming-with-tool-calls" had no current consumer; building it would have been YAGNI). |
| 28.7 | LR-01 | **DEFERRED** — primitive ready in 28.6b, but the caller migration was scoped at ~300 LOC across 8+ files with no simulation runtime tests. Better grouped with the other 4 caller migrations under one Phase 29 smoke-test rollout. |

**Pattern:** each discovery came from re-grepping current code, not from static review of plan docs. PR #223 (migration 0042 path) and PR #224 (`useCount` field) established the same shape; this is now a documented Phase 28 lesson.

**Reusable rule for Phase 29:** when locking a sub-phase scope, walk the actual call sites first AND walk the call graph one or two hops out. The register snapshots scope at write-time; code drifts; chain-of-trust through Phase 19 → 27.4 → 28 entries amplifies stale assumptions.

For Phase 29 specifically, the §29.1 workspace-default-binding decision needs to walk through each of the 5 deferred callers individually. Their workspace-context shapes are NOT uniform:

- `embeddings/service.ts` — singleton service, no context.
- `operators/provider-hub.ts` — operator-keyed (`callProviderHub({operator, prompts})`), no workspace.
- `chat/stream.ts` — HTTP-endpoint-driven, takes `workspaceId` directly.
- `executeInvokeAgent` — automation-workflow-driven, has `agentId` (legacy `agents` table, not AS draft).
- `simulation.ts` — agent-keyed, already has `draft.id` (Plan v3 binding) — **independent of §29.1**.

Don't assume one-size-fits-all migration.

---

## Memory updates

- `project_rac_progress.md` — main HEAD updated through this PR.
- `MEMORY.md` — Phase 28 closure note added; LR table reflects final state.
- `project_phase_28_authority.md` — closed; user re-grant required for Phase 29.

---

## Acceptance criteria — met

- [x] All Phase 28 sub-phases (28.0–28.8) marked CLOSED or DEFERRED in `PHASE_28_EXECUTION_PLAN.md`.
- [x] Every LR row in `LEGACY_EXCEPTION_REGISTER.md` reflects its actual current state (migrated / open-with-Phase-29-deadline / reclassified).
- [x] Every Phase 28 PR cited with merge SHA.
- [x] Boundary lint allowlist diff documented.
- [x] CI fingerprint stable through every PR.
- [x] Phase 29 handoff captured with caller list, sub-phase ordering, sizing.
- [x] Lessons documented for future plan freezing (the six-instance pattern).
- [x] No new TEMPORARY_EXCEPTION_WITH_DEADLINEs introduced; cap stayed 0 / 1.

Phase 28 closes.
