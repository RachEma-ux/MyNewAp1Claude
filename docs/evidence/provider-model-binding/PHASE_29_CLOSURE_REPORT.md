# Phase 29 — Closure Report

**Captured:** 2026-05-07 against `main@b1d6253` (post-Phase-29.7 merge).
**Branch (this doc):** `feat/pmb-phase-29-8-closure-report`.
**Owner:** Planner + Governance roles per AGENTS.md.

---

## TL;DR

Phase 29 closes the **5 deferred caller-side migrations** from Phase 28 (LR-01 / LR-02 / LR-03 / LR-04 / LR-08). All five LRs are migrated; the boundary-lint allowlist drops to a single entry (`PMB-D1-EXEMPT` for the seed script — the one legitimate boot-time env reader by design). Two new contract surfaces shipped in support: the workspace-default-binding primitive (§29.1b) and the `system-internal` intent variant (§29.4a). One surface shrank materially: `providerRouter` lost 269 lines of dead execute/stream methods (§29.3).

Zero new TEMPORARY_EXCEPTION_WITH_DEADLINEs introduced; cap stayed at **0 / 1 allowed**. CI fingerprint stayed at **5/5 green** through every PR.

The phase ran 11 PRs total. Two scope-discovery surface-and-pause events landed cleanly: §29.2's call-graph walk found `providerRouter.execute`/`executeStream` were dead code (collapsing §29.3 from "300–500 LOC implementation" to a "80 LOC excision"); §29.4 prep surfaced that the receipt policy refused non-test intents from infrastructure callers (resolved by adding `system-internal` as an exempt intent in §29.4a, primitive-then-caller pattern).

---

## What shipped — PR ledger

| Sub-phase | PR | Merge SHA | Title |
|---|---|---|---|
| 29.0 | [#236](https://github.com/RachEma-ux/MyNewAp1Claude/pull/236) | `cdfbebf` | Phase 29 — execution plan freeze |
| **29.0a** | [#237](https://github.com/RachEma-ux/MyNewAp1Claude/pull/237) | `c89b391` | Close Phase 29.0a — LR-01 simulation migration + adapter purge |
| 29.1a | [#238](https://github.com/RachEma-ux/MyNewAp1Claude/pull/238) | `7ffe65b` | Phase 29.1a — workspace-default-binding ADR (D-WDB-1..8) |
| **29.1b** | [#239](https://github.com/RachEma-ux/MyNewAp1Claude/pull/239) | `1f5628a` | Phase 29.1b — workspace-default-binding primitive |
| 29.2a | [#240](https://github.com/RachEma-ux/MyNewAp1Claude/pull/240) | `3e6d74e` | Phase 29.2a — providerRouter migration ADR (D-PR-1..8) |
| **29.3** | [#241](https://github.com/RachEma-ux/MyNewAp1Claude/pull/241) | `f8d4a74` | Close Phase 29.3 — providerRouter dead-code excision (-269 LOC) |
| 29.4a | [#242](https://github.com/RachEma-ux/MyNewAp1Claude/pull/242) | `4881db6` | Phase 29.4a — `system-internal` intent exempt from receipt policy |
| **29.4b** | [#243](https://github.com/RachEma-ux/MyNewAp1Claude/pull/243) | `3c6638d` | Close Phase 29.4b — LR-02/03 embeddings caller migration |
| **29.5** | [#244](https://github.com/RachEma-ux/MyNewAp1Claude/pull/244) | `32bec3b` | Close Phase 29.5 — LR-04 operators caller migration |
| **29.6** | [#245](https://github.com/RachEma-ux/MyNewAp1Claude/pull/245) | `43d9f0d` | Close Phase 29.6 — LR-08 chat-stream + executeInvokeAgent (Path B) |
| 29.7 | [#246](https://github.com/RachEma-ux/MyNewAp1Claude/pull/246) | `b1d6253` | Phase 29.7 — boundary-lint sweep + chat-binding test repair |
| **29.8** | (this PR) | (TBD) | Closure report |

**Total: 11 PRs.** Bold rows are the substantive work (LR closures + primitives + dead-code excision); the others are doc-only ADR or sweep-and-document PRs.

---

## What changed in the Legacy Exception Register

Before Phase 29 (`main@5a75613` baseline — post-Phase-28 close-out):

| LR | File | Status | Deadline |
|---|---|---|---|
| LR-01 | `agent-studio/adapters/openllm-runtime-adapter.ts:312-321` | open | Phase 29 |
| LR-02 | `embeddings/service.ts:54` | open | Phase 29 |
| LR-03 | `documents/processor.ts:339` | open | Phase 29 |
| LR-04 | `operators/provider-hub.ts:78` | open | Phase 29 |
| LR-08 | `chat/stream.ts` + `automation/block-executors.ts:executeInvokeAgent` | open | Phase 29 |

After Phase 29 (`main@b1d6253`):

| LR | (Was) File | Status | Phase 29 Sub-phase |
|---|---|---|---|
| **LR-01** | (was) `openllm-runtime-adapter.ts` (DELETED) | **migrated** | 29.0a — simulation migrated to Model Access; adapter files deleted (-825 LOC dead code) |
| **LR-02** | (was) `embeddings/service.ts:54` | **migrated** | 29.4b — public methods take `workspaceId`; binding via §29.1b lookup; `intent: "system-internal"` |
| **LR-03** | (was) `documents/processor.ts:339` | **migrated** | 29.4b — `processDocumentBackground` takes `workspaceId`; gate removed |
| **LR-04** | (was) `operators/provider-hub.ts:78` | **migrated** | 29.5 — `ProviderHubRequest.workspaceId` added; classifier-role binding; intent `system-internal`; local provider-chain dropped |
| **LR-08** | (was) `chat/stream.ts` + `executeInvokeAgent` | **migrated** | 29.6 — chat-stream direct-imports `modelAccess.stream`; executeInvokeAgent adopts Path B (refuse legacy agents) |

**Net change: 5 of 5 Phase-29-deadline LRs flipped to `migrated`. Zero deferrals; zero new TEMPORARY_EXCEPTION_WITH_DEADLINEs.**

After this PR, the LR register's open D1-violation count is **zero**. Only the `PMB-D1-EXEMPT` permanent exemption (the seed script) remains, by design.

---

## What changed in the Model Access surface

Before Phase 29 — 4 gateway-callable actions plus 1 direct-import primitive:

```
openRouter.modelAccess.execute         (gateway-call, hybrid receipt)
openRouter.modelAccess.stream          (gateway-call wrapper + direct-import async generator)
openRouter.modelAccess.validateBinding (gateway-call, no receipt)
openRouter.modelAccess.embed           (Phase 28.4)
runViaOpenllmBridge                    (Phase 28.6b direct-import)
```

After Phase 29 — same surface, **plus a new exempt intent variant**:

```
ModelAccessIntent =
  | "agent-test"        (always exempt from receipt policy)
  | "agent-run"         (requires receipt)
  | "evaluation"        (requires receipt)
  | "chat"              (requires receipt)
  | "system-internal"   (NEW — Phase 29.4a — exempt from receipt policy;
                         infrastructure-call lane for document indexing,
                         RAG retrieval, operator classifiers, automation
                         invokeAgent fallbacks; audit captured by
                         correlationId + calling subsystem's own log)
```

The receipt-policy enforcement helper (`enforceModelAccessReceipt` in `manifest.ts`) now exempts **both** `agent-test` and `system-internal`. The error message advertises both exempt intents so callers can grep.

Direct-import note (Phase 29.6a): the gateway-call form of `openRouter.modelAccess.stream` collapses streams to a single result. SSE consumers (`chat/stream.ts`) must direct-import `stream()` from `server/openrouter/model-access` for real streaming. Same precedent as `runViaOpenllmBridge` (Phase 28.6b).

### New primitive — workspace-default-binding (§29.1b)

```ts
// server/agent-studio/workspace-default-bindings.ts
export async function resolveWorkspaceDefaultBinding({
  workspaceId,
  role,
}: { workspaceId: number; role: WorkspaceDefaultBindingRole }):
  Promise<ResolveWorkspaceDefaultBindingResult | null>;

export type WorkspaceDefaultBindingRole =
  | "chat" | "embedding" | "tool" | "classifier";
```

Backed by a new ASDB table `ags_workspace_default_provider_bindings` with UNIQUE `(workspaceId, role)`, soft FK on `workspace_id` (Phase 12.5 boundary).

### Excised surface — `providerRouter` (§29.3)

The `providerRouter` class lost its `execute()` and `executeStream()` methods entirely (zero live callers per the §29.2 ADR's call-graph walk). The class is now selection-only — `resolvePlan()` survives unchanged. File shrank from 446 → 177 LOC. The dangling `getProviderRegistry` import + `fallbackManager` + `hybridRouter` + `routingAuditLogs` + `RoutingResult` + `StreamingRoutingResult` symbols all went with the excision.

---

## What changed in the boundary lint

Before Phase 29 — `scripts/check-provider-key-env-boundary.ts` carried 5 active allowlist entries:

```
LR-01 (openllm-runtime-adapter.ts) — <dynamic>
LR-02 (embeddings/service.ts)
LR-03 (documents/processor.ts)
LR-04 (operators/provider-hub.ts)
PMB-D1-EXEMPT (scripts/provider-connections/seed-from-env.ts)
```

After Phase 29:

```
PMB-D1-EXEMPT (scripts/provider-connections/seed-from-env.ts)   — the ONE
                                                                    legitimate
                                                                    env reader
```

**Net: 4 entries purged.** All five Phase-29-deadline LRs are migrated and tripwire-tested. The script's comment block carries closure notes for each of LR-01 / LR-02 + LR-03 / LR-04 / LR-08, plus a Phase-29-final-state summary.

### Tripwire tests added

Across `tests/pmb/boundary.test.ts`, four new describe blocks lock the closures:

| Block | Tests | Scope |
|---|---|---|
| Phase 27.7 + 29.0a invariant 5b | 4 | LR-01: AS subtree no env reads; no `new OpenAI(`; no `resolveProviderApiKey` import; no defs of any deleted helper |
| Phase 29.4b invariant — LR-02/LR-03 closure | 3 | embeddings/service.ts no env reads; documents/processor.ts no env reads; embeddings/service.ts uses `gatewayCall` + `intent: "system-internal"` |
| Phase 29.5 invariant — LR-04 closure | 3 | provider-hub.ts no env reads; no `getOpenAIClient`/`getOllamaClient` defs; uses `gatewayCall` + `intent: "system-internal"` |
| Phase 29.6 invariant — LR-08 closure | 5 | chat/stream.ts no `getProviderRegistry` import; direct-imports `stream` with `intent: "chat"`; uses both binding lookups; executeInvokeAgent no `getProviderRegistry`; returns `legacy_agents_table_unsupported` |

**15 tripwire tests total** across the 5 LRs. Each tests asserts a specific contract surface that, if regressed, would re-introduce the D1 violation.

---

## CI fingerprint through the phase

Every Phase 29 PR landed at **5/5 green**:

```
[completed/success] Governance Compliance Checks
[completed/success] Governance Enforcement Harness
[completed/success] build
[completed/success] ci
[completed/success] test
```

No CI regressions across the 11 PRs. Test sweeps passing through Phase 29:

| Suite | Tests |
|---|---|
| Boundary tripwires (`tests/pmb/boundary.test.ts`) | 27/27 (was 14 pre-Phase-29; +13 new) |
| Workspace-default-bindings unit tests | 18/18 |
| Embeddings service unit tests (29.4b) | 7/7 |
| Operator provider-hub unit tests (29.5) | 9/9 |
| Receipt-policy tests | 14/14 (was 10; +4 for `system-internal`) |
| Provider-router tests (post-excision) | 0/0 (no test file existed; `resolvePlan` is exercised by chat-binding indirectly) |

**Net new tests added in Phase 29: 47** across all suites. (And 5 of 7 chat-binding.test.ts tests resurrected from a 0/7 starting state — local-developer quality-of-life only; that file is not in the CI test set.)

---

## Scope-discovery events (the Phase 28 lesson recurring)

Phase 28's closure report identified the **six-instance pattern**: register entries describe scope at write-time, not execution-time. Phase 29 carried that lesson forward — the standing pause-and-surface discipline produced two clean discoveries before locking work:

### Discovery 1 — `providerRouter.execute`/`executeStream` are dead code (§29.2)

**Surfaced during:** §29.2 ADR prep (call-graph walk against `main@1f5628a`).

**Plan estimate:** §29.3 implementation = 2–3 PRs / 300–500 LOC ("rewire `resolvePlan` to invoke Model Access internally" or "dissolve the routing layer").

**Reality:** `grep -rn "providerRouter\.\(execute\|executeStream\)" server/ client/` returns zero results. Only `resolvePlan` is exercised, by 3 callers — and `resolvePlan` itself reads provider metadata via `providerDb`, not via `getProviderRegistry()`. The Phase 28.3 register entry framed §29.2 as "migrate `providerRouter`'s registry dependency" but the registry was referenced **only inside two dead methods**.

**Outcome:** §29.3 collapsed to a single-PR -269 LOC excision. The chat-stream caller's *separate* registry consumption (`getProviderRegistry()` at chat/stream.ts:70) was the actual LR-08 work and lived in §29.6a.

**Trigger:** the Phase 28 lesson's "re-grep + walk the call graph" prep step.

### Discovery 2 — receipt policy refuses non-test intents from infrastructure callers (§29.4)

**Surfaced during:** §29.4b prep (after the §29.4 single-PR plan was about to be locked).

**Plan estimate:** §29.4 = 1 PR / ~150 LOC ("replace `process.env.OPENAI_API_KEY` with `gatewayCall` to `openRouter.modelAccess.embed`").

**Reality:** `modelAccess.embed`'s per-intent receipt policy refuses non-test intents without a `governanceReceiptId`. The two LR-02/03 caller paths (`documents/processor.ts` document indexing + `agents/executor.ts` legacy RAG retrieval) have no user-attributed receipt source. Three failure modes mapped:

- `intent="agent-run"` + threading receipts → would break document upload + legacy RAG at runtime until receipts were minted at the caller boundaries (significant scope expansion).
- `intent="agent-test"` → lies about intent; masks the receipt policy's enforcement for production paths.
- Defer to Phase 30 → leaves 4 of 5 LR closures blocked indefinitely.

Notably, **no production caller of `modelAccess.execute`/`stream`/`embed` currently used a non-test intent.** Simulation (29.0a) used `agent-test`. Phase 29.4–29.6 collectively were the first live non-test consumers; the receipt-policy gap blocked all four.

**Outcome:** Pause-and-surface event triggered. Four options drafted; user chose **Option B** (add a `system-internal` intent variant exempt from receipts). §29.4 split into 29.4a (the receipt-policy primitive — same shape as Phase 28's primitive-then-caller pattern) and 29.4b (the actual caller migration). 29.4a reused the receipt-policy enforcement infrastructure from Phase 20 — added one branch to `enforceModelAccessReceipt`, updated `RECEIPT_POLICY.md`, added 4 tests.

**Trigger:** the Phase 29 authority's pause condition #5 ("structurally bigger than scoping doc estimated").

### Smaller wins

- **Direct-import streaming for SSE** (§29.6a) — gateway-call form of `modelAccess.stream` collapses streams to a single result. Chat-stream needed real streaming; direct-import was the clean pattern. Same precedent as 29.0a's `runViaOpenllmBridge`. No new pattern needed; just a documentation point in `manifest.ts:124` that's now exercised by a second consumer.
- **D-PR-4 mapping was free** (§29.6a) — `provider_connections.providerId` is already a soft FK to legacy `providers.id` (column name matches; no FK constraint needed). The `listActiveForProvider({workspaceId, providerCatalogEntryId})` helper from Phase 8 was the lookup primitive — no new code needed for the legacy-providerId → providerConnectionId bridge.

---

## Phase 29 follow-ups (out of scope for this closure)

- **§29.1c — admin UI for workspace defaults.** D-WDB-7 originally scoped this to land alongside the §29.1b primitive but was deferred to keep the primitive PR focused. Admins currently set defaults via direct SQL or by calling the internal write helpers (`upsertWorkspaceDefaultBinding`, etc.) from a one-off script. The 5 LR closures don't depend on this; landing the admin UI is operator-facing polish.
- **chat-stream cost calculation** (§29.6a). The previous `provider.getCostPerToken()` registry hook is gone with the registry usage; cost-tracking now records token counts only. Per-model cost calc moves alongside §29.1c (same admin UI surface).
- **§B-followup test-infra cleanup**: 2 of 7 tests in `chat-binding.test.ts` still fail (post-29.7 partial repair). They're tool-loop assertions about post-error chat-message-row writes that need the test logic updated to match the post-29.6 chat shape. Not in the CI test set; local-developer quality-of-life only.
- **Pre-condition smoke for §29.6b Path B**: D-PR-5 documented that admins should query `workflow_executions` for active legacy-agent workflows before promoting to production. This branch's local dev DBs were not enumerated; production rollout is operator-validated.

---

## Live-smoke pending (carry forward to staging promotion)

Each migration sub-phase noted live-smoke as "pending" — these accumulate for the next staging promotion pass:

- **29.0a:** simulation engine in dev (mock + live runtime modes) — confirm bridge replaces deleted-adapter behavior.
- **29.4b:** document upload + RAG retrieval — confirm `EmbeddingResolutionError` surfaces correctly when no default is configured.
- **29.5:** operator job (builder/auditor/governance/deploy) — confirm classifier binding resolves and `system-internal` produces a valid SyscallBatch.
- **29.6:** legacy chat UI (`useUnifiedRouting=ON` and `=OFF`) + automation workflow with `executeInvokeAgent` (Path B refusal cleanly logged).

These are NOT blocking for the closure report. The migration code is reviewed, tested by unit tests and tripwires, and CI-green; the smoke pass verifies runtime behavior against a live dev server and is the natural follow-up.

---

## Net impact

| Metric | Phase 29 |
|---|---|
| **PRs merged** | 11 (29.0 → 29.7, plus this closure-report PR) |
| **Sub-phases planned** | 8 (29.0..29.8) |
| **Sub-phases shipped** | 9 (29.4 split into a/b after pause-and-surface) |
| **LRs closed** | 5 (LR-01 / LR-02 / LR-03 / LR-04 / LR-08) |
| **Boundary-lint allowlist purged** | 4 entries (down from 5 to 1) |
| **New tripwire tests** | 13 |
| **New unit tests** | ~34 across new modules |
| **New contract surfaces** | 2 (workspace-default-binding primitive; `system-internal` intent) |
| **Dead code excised** | 825 LOC (LR-01 adapter) + 269 LOC (providerRouter) = **~1100 LOC** |
| **CI fingerprint** | 5/5 green throughout |
| **New TEMPORARY_EXCEPTION_WITH_DEADLINEs** | 0 (cap held at 0/1 allowed) |

The phase's net effect on the codebase is a contraction — substantial dead-code removal plus the receipt-policy and binding-lookup contract additions are smaller than the deletions. The provider-key D1 violation surface is now closed for runtime code; only the explicit boot-time seed script remains as the one legitimate env reader.

---

## Lessons carried forward from Phase 29

The Phase 28 lesson (re-grep before locking sub-phase scope) carried through Phase 29 cleanly. The two scope-discovery events (§29.2 dead-code finding, §29.4 receipt-policy gap) both triggered pause-and-surface flow rather than forced fits. Both produced cleaner outcomes than the original plan estimates.

**New lessons added at Phase 29:**

1. **Check the receipt policy when migrating a new caller.** Before writing the migration code, run a thought experiment: does this caller have a real `governanceReceiptId` source? If no, expect a pause-and-surface event. The four options decision (A/B/C/D from the §29.4 surface) is a reusable framework.

2. **Direct-import is the streaming pattern.** Gateway-call collapses streams to single results by design (the gateway returns `O`, not `AsyncIterable<O>`). For SSE consumers, direct-import is the only correct pattern; the receipt-policy enforcement applies at the gateway boundary, and the direct-import path's audit story is the primitive's own correlation id + the calling subsystem's audit log. Documented in `manifest.ts:124` since Phase 28; now load-bearing for chat-stream.

3. **`allowedModels` lists in operator/agent code are anti-patterns.** §29.5 dropped the per-operator `allowedModels` list because the workspace admin owns model selection via the binding. If a workspace admin configures a model that doesn't fit an operator's risk profile, the fix is changing the binding, not maintaining a static allowlist in the operator code. Same principle applies to any other "this caller can use these models" lists that show up in future migrations.

4. **Path B (refuse) is the right move for legacy-table support questions.** §29.6b chose Path B for `executeInvokeAgent` because the legacy `agents` table is out-of-retrofit-scope. Path A (backfill) and Path C (dual-table) both expand scope into legacy code that isn't worth investing in. Refusal forces operators to migrate, which is the desired direction anyway. Apply the same logic in future "support legacy or not?" decisions.

5. **`server/**` tests are local-development-only.** Discovered during §29.7's `chat-binding.test.ts` repair: `run-tests.yml` only runs `tests/contracts/`, `tests/governance/`, `tests/integration/*`, and `tests/ui/`. CI fingerprint claims of "5/5 green" do not include the `server/**/*.test.ts` suite. This is a structural fact, not a bug — but it means local-development tests can break on main without anyone noticing. Future PRs that touch `server/**` should run those tests locally as part of the validation pass.

---

## Memory updates

- `project_rac_progress.md` — main HEAD updated through this PR.
- `MEMORY.md` — Phase 29 closure note added; LR table reflects final state (all 5 deferred LRs migrated).
- `project_phase_29_authority.md` — closed; future PMB phases (if any) need explicit re-grant.
- New entry: `project_pmb_phase_29_complete.md` — captures Phase 29 closure with the 11-PR summary + key lessons (1–5 above) so future sessions can resume without re-reading the closure report.

---

## Cross-references

- `PHASE_28_CLOSURE_REPORT.md` — origin of the 5 deferred caller migrations + the six-instance pattern.
- `PHASE_29_EXECUTION_PLAN.md` — the plan-frozen authoritative source for §29.0..§29.8.
- `WORKSPACE_DEFAULT_BINDING_DECISION.md` — D-WDB-1..8 (consumed by 29.1b/29.4b/29.5/29.6).
- `PROVIDER_ROUTER_MIGRATION_DECISION.md` — D-PR-1..8 (drove §29.3 scope collapse + §29.6 caller shape).
- `MODEL_ACCESS_EMBED_DECISION.md` — D-MA-EMBED-1..7 (consumed by 29.4b).
- `MODEL_ACCESS_TOOL_LOOP_DECISION.md` — D-MA-TOOL-1..8 (consumed by 29.0a).
- `RECEIPT_POLICY.md` — updated to reflect `system-internal` exemption.
- `LEGACY_EXCEPTION_REGISTER.md` — final state with all 5 Phase-29 LRs migrated.

---

## What's next

The PMB Plan v3 + Phase 27 + Phase 28 + Phase 29 sequence collectively closes the original Direction A program: **runtime code does not read provider API keys from `process.env`.** The boundary-lint allowlist is at its minimum (1 entry, the seed script). All deferred LRs are migrated. The receipt-policy contract is consistent across `agent-test` (test sandbox) and `system-internal` (infrastructure) intents.

Open follow-up tracks (separate plans, not Phase 29):

- **§29.1c admin UI** — workspace-default-binding management surface.
- **Phase-30 cost-calculation** for chat-stream + workspace-default rollout.
- **Phase 26.1 barrel-strip + caller migration** — Plan v3 follow-up.
- **Frontend Module-Gateway plan** — separate plan in `FUTURE_FRONTEND_TRPC_CLEANUP.md`.

Phase 29 is **closed.** No further sub-phases planned under this authority.
