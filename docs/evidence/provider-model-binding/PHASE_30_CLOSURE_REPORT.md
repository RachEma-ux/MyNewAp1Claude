# Phase 30 — Closure Report

**Captured:** 2026-05-07 against `main@21257db` (post-Phase-30.1 merge).
**Branch (this doc):** `docs/pmb-phase-30-5-closure-report`.
**Owner:** Planner + Governance roles per AGENTS.md.

---

## TL;DR

Phase 30 was Option D — **workspace operator surface**. It picks up the polish items the Phase-29 closure consciously deferred and finishes the post-D1-closure observability + admin gaps. Phase 30 is **NOT** a D1-violation closure phase: all five Phase-29-deadline LRs are migrated, and the boundary-lint allowlist already sat at its minimum (`PMB-D1-EXEMPT` for the seed script).

Three substantive surfaces shipped:

1. **Workspace-default-binding admin surface (§30.1).** Three new gateway actions (`agentStudio.workspaceDefaultBindings.{list,upsert,delete}`), three tRPC procedures, and a React admin panel at `/workspace/default-bindings`. Writes carry receipts per **D-WDB-7**; reads do not.
2. **chat-stream cost-calculation rebuild (§30.2).** New `workspace_pricing_config` table on the main DB, a `BUILT_IN_PRICING` frozen table for OpenAI + Anthropic public list-prices captured 2026-05-07, and `getModelPricing(workspaceId, modelRef)` with a three-step lookup chain (workspace-config → built-in default → fallback-zero with `console.warn`). chat-stream's SSE `complete` event carries `cost` + `currency` + `pricingSource` again.
3. **Targeted CI hardening (§30.4).** Six PMB-relevant unit-test files added to `run-tests.yml` as a new "Layer 5: PMB unit tests" step, all under the project's standing `--pool=forks --poolOptions.forks.singleFork` OOM-safe pattern. Phase 30.2 added `server/providers/pricing.test.ts` to the same step (now seven files total).

The four Phase-29 live-smoke follow-ups (#248–#251) are **carry-forward to operator-driven manual verification** — the static-readiness pass below confirmed the underlying code paths exist and emit the shapes the smoke runbooks expect, but visual confirmation in a running browser is genuinely outside autonomous scope.

Zero new TEMPORARY_EXCEPTION_WITH_DEADLINEs introduced; cap stayed at **0 / 1 allowed**. CI fingerprint stayed at **5/5 green** through every PR (matrix shape is now 5/5 by name; the new "Layer 5" step lives inside the existing `test` job).

---

## What shipped — PR ledger

| Sub-phase | PR | Merge SHA | Title |
|---|---|---|---|
| 30.0 | [#252](https://github.com/RachEma-ux/MyNewAp1Claude/pull/252) | `e852e9e` | Phase 30 — execution plan freeze (Option D) |
| 30.4 | [#253](https://github.com/RachEma-ux/MyNewAp1Claude/pull/253) | `7facefb` | Phase 30.4 — bring 6 PMB unit-test files into CI |
| **30.2** | [#254](https://github.com/RachEma-ux/MyNewAp1Claude/pull/254) | `c039fe0` | Close Phase 30.2 — chat-stream cost-calculation rebuild |
| **30.1** | [#255](https://github.com/RachEma-ux/MyNewAp1Claude/pull/255) | `21257db` | Phase 30.1 — workspace-default-binding admin surface |
| 30.5 | (this PR) | (TBD) | Closure report |

**Total: 5 PRs.** Bold rows are the substantive work; the others are doc/CI infrastructure.

---

## What changed in the workspace-default-binding surface (§30.1)

Before Phase 30 — primitive only (29.1b):

```
resolveWorkspaceDefaultBinding({workspaceId, role})         (read API)
upsertWorkspaceDefaultBinding(input)                        (server-internal)
deleteWorkspaceDefaultBinding({workspaceId, role})          (server-internal)
listWorkspaceDefaultBindings(workspaceId)                   (server-internal)
```

After Phase 30 — admin surface complete:

```
GATEWAY ACTIONS (registered in agent-studio manifest + boot.ts)
  agentStudio.workspaceDefaultBindings.list      (low,    no receipt)
  agentStudio.workspaceDefaultBindings.upsert    (medium, receipt — D-WDB-7)
  agentStudio.workspaceDefaultBindings.delete    (medium, receipt — D-WDB-7)

tRPC PROCEDURES (server/agent-studio/api/workspace-default-bindings-router.ts)
  agentStudio.workspaceDefaultBindings.listForWorkspace   (protectedProcedure)
  agentStudio.workspaceDefaultBindings.upsert             (governedProcedure)
  agentStudio.workspaceDefaultBindings.delete             (governedProcedure)

ADMIN UI (client/src/pages/WorkspaceDefaultBindingsPage.tsx)
  Route: /workspace/default-bindings
  Four cards (chat / embedding / tool / classifier) per D-WDB-4
  Provider Connection picker (active connections only) + free-text modelRef
  Save / Clear buttons per role
```

**D-WDB-3 invariant preserved end-to-end:** no procedure or handler returns credential material; the result projection mirrors `ResolveForRunResult`'s no-secret shape.

The Phase-29.1b primitive PR's "follow-up: admin UI ships in Phase 30" plan is now closed.

---

## What changed in the cost-calculation surface (§30.2)

Before Phase 30 — `provider.getCostPerToken()` registry hook deleted in 29.6a; chat-stream's `complete` event carried `cost: 0` end-to-end (a real observability regression).

After Phase 30:

```
NEW TABLE  workspace_pricing_config (main DB, NOT ASDB — pricing is workspace-global)
  UNIQUE (workspaceId, modelRef)
  inputCostPer1kTokens NUMERIC(12,6)
  outputCostPer1kTokens NUMERIC(12,6)
  currency VARCHAR(8) DEFAULT 'USD'

NEW MODULE  server/providers/pricing.ts
  BUILT_IN_PRICING (Object.frozen) — OpenAI + Anthropic public list-prices captured 2026-05-07
  getModelPricing(workspaceId, modelRef): Promise<PricingProfile>
    Lookup chain: workspace-config → built-in default → fallback (zeros + console.warn)
  computeCost(profile, inputTokens, outputTokens): number  (pure)

CHAT-STREAM  server/chat/stream.ts
  Resolves pricing alongside the binding (single round-trip per stream)
  Reinstates cost on the SSE 'complete' event:
    { cost, currency, pricingSource: "workspace-config" | "built-in-default" | "fallback" }
```

**Currency stays USD-only at Phase 30.2.** The `pricingSource` projection lets observability operators distinguish "configured" from "default" from "missing" states without re-resolving pricing on the client side.

13 unit tests in `server/providers/pricing.test.ts` lock the lookup-chain contract + the `computeCost` purity assertion + the `BUILT_IN_PRICING` frozen-and-USD-only assertion.

---

## What changed in CI (§30.4)

The `tests/contracts/`, `tests/governance/`, `tests/integration/`, and `tests/ui/` directories already ran in CI. The `server/**/*.test.ts` tree did NOT — and pulling it in wholesale would have re-introduced the two still-broken `chat-binding.test.ts` tool-loop tests deferred as a §B-followup.

§30.4 adds a new "Layer 5: PMB unit tests" step to `run-tests.yml` that explicitly enumerates the seven PMB-relevant files (workspace-default-bindings, embeddings/service, operators/provider-hub, openrouter/manifest-receipt-policy, openrouter/model-access/run-via-openllm-bridge, openrouter/model-access/embed, providers/pricing). The step uses the project's standing OOM-safe pattern: `--pool=forks --poolOptions.forks.singleFork --reporter=verbose`.

Total enforced PMB unit tests in CI now: **78+** (across the seven files).

---

## §30.3 live-smoke pass — static-readiness verification

The smoke pass was authored as: **boot the dev server, drive through each of the four issue-bodies' test paths in a browser, file follow-up PRs for any regressions.** That requires interactive browser-driven verification, which is genuinely outside autonomous-execution scope.

What I CAN verify is that the underlying code paths the smoke runbooks reference are in place and emit the shapes the runbooks expect. The static-readiness sweep below documents that pass; the four issues are carried forward to operator hands as "smoke runbook ready, code paths verified, browser pass pending."

### #248 — Phase 29.0a simulation engine on Model Access (LR-01)

**Code path:** `server/agent-studio/services/simulation.ts:935-1014` (live-runtime branch).

**What's verified statically:**

- `outputPayload.runtimeSource ∈ {"bridge", "execute"}` — set on lines 946 + 1011.
- `outputPayload.providerConnectionId` — set on lines 947 + 1012 from `resolveForRun`'s `bindingResult.providerConnection.providerConnectionId`.
- `outputPayload.providerCatalogEntryId` — set on line 948.
- `outputPayload.modelCatalogEntryId` — set on line 950.
- `outputPayload.model` — set on line 952 from `bindingResult.binding.modelRef`.
- No `endpoint.wsUrl` / `endpoint.provider` / `endpoint.model` references remain (the issue's "before" shape is fully gone).

**Implementation note:** the issue body anticipated nested `endpoint.{source,providerConnectionId,...}`, but the chosen implementation flattens them under `outputPayload`. This is an issue-text-vs-impl drift, not a regression — both shapes encode the same information. The operator smoke pass should expect the flat shape.

**What requires browser verification:** Agent Studio's run-detail UI rendering the metadata payload correctly + run completion in mock + live runtime modes against an actual MCP-attached and non-MCP-attached draft.

### #249 — Phase 29.4b document upload + RAG retrieval on workspace-default-binding (LR-02 + LR-03)

**Code path:** `server/embeddings/service.ts:38-90` (`EmbeddingResolutionError`) + `server/documents/processor.ts:processDocumentBackground` (workspaceId threading).

**What's verified statically:**

- `EmbeddingResolutionError` defined with typed `reason` field (line 38–55), reasons: `default_not_set | provider_connection_missing | provider_connection_unhealthy | provider_connection_disabled` — matches the issue's expected typed reasons.
- `embeddings/service.ts` no longer constructs `new OpenAI(...)` (the migration goal). Boundary-lint allowlist enforces this.
- The 18 primitive tests in `server/embeddings/service.test.ts` (now in CI per §30.4) cover all four reasons + the success path.

**What requires browser verification:** the Documents UI surfacing each typed reason as a clean operator message + RAG retrieval returning chunks for Path A's success case.

### #250 — Phase 29.5 operator jobs on workspace-default-binding (LR-04)

**Code path:** `server/operators/provider-hub.ts:70-90` (`OperatorBindingError`) + `BaseOperator.generatePlan` (workspaceId guard).

**What's verified statically:**

- `OperatorBindingError` defined with typed `reason` field (line 70+), reasons: `default_not_set | provider_connection_missing | provider_connection_unhealthy | provider_connection_disabled`.
- The error message includes the `Configure the default via ags_workspace_default_provider_bindings (role='classifier')` guidance.
- `getOpenAIClient` / `getOllamaClient` / `getAvailableOllamaModels` references are gone from `operators/`; the workspace-classifier-binding path is the only path.
- The provider-hub test file (now in CI per §30.4) covers the four reasons + the constraints-clamping behavior.

**What requires browser verification:** running each of the four operators (builder / auditor / governance / deploy) against a live workspace with vs. without a classifier default, and confirming the operator constraints (governance: maxTokens=4096, temp=0.1) reach the model-access call in the expected shape.

### #251 — Phase 29.6 legacy chat UI + executeInvokeAgent Path B (LR-08)

**Code path:** `server/chat/stream.ts` (SSE binding field + RAG injection) + `server/automation/block-executors.ts:executeInvokeAgent` (Path B refuse).

**What's verified statically:**

- chat-stream emits `binding: { providerConnectionId, modelRef, source: "active-for-provider" | "workspace-default" }` on the SSE `complete` event (line 333+). Both source variants are produced (lines 71 + 85).
- The `complete` event also carries `cost` + `currency` + `pricingSource` from the §30.2 rebuild.
- RAG context injection logs `[ChatStream] Injected RAG context: N chunks` (preserved from pre-29.6 path).
- `executeInvokeAgent` Path B refuses legacy `agents`-table flows with a typed reason.

**What requires browser verification:** all five paths in the issue body — unified-routing on, off, no-default refusal, RAG injection rendering with `[Source N]` notation, and `executeInvokeAgent` Path B refusal surfacing in the automation UI.

### Carry-forward to operator hands

Issues #248 / #249 / #250 / #251 stay open with a comment linking back to this report's static-readiness pass. The operator's browser-driven smoke is the final acceptance step; if any path fails in the browser, that's a follow-up PR (the standing pause-and-surface protocol applies).

---

## What changed in the Legacy Exception Register

Phase 30 was not a D1-closure phase, so the LR register is unchanged. State as of `main@21257db`:

| LR | Status | Notes |
|---|---|---|
| LR-01..09 (Phase-29-deadline) | **migrated** | Closed in Phase 29 (#236–#247). |
| `PMB-D1-EXEMPT` (seed script) | **permanent** | The single legitimate boot-time env reader by design. |

**Open D1-violation count: zero.**

---

## Decision matrix outcomes (vs. plan §4)

| # | Plan decision | Outcome | Notes |
|---|---|---|---|
| 1 | Admin panel home: Workspace Settings → "Default Bindings" tab | **Adapted** — shipped as standalone route `/workspace/default-bindings` | The legacy Settings page is user-level (API keys + profile + system); a dedicated workspace-scoped page was the cleaner home. |
| 2 | Role display: 4 cards per D-WDB-4 | **Locked** as planned. |
| 3 | Provider Connection picker: reuse `listActiveForProvider` (Phase 8) | **Adapted** — used existing `providerConnections.list` (filtered to `lifecycleStatus === "active"`) + `catalogManage.list` for provider-name resolution. Same eligibility surface, different lookup site. |
| 4 | modelRef field: free TEXT with placeholders | **Locked** — placeholders show role-appropriate examples (`text-embedding-3-small` for embedding, `gpt-4o-mini` for the rest). |
| 5 | Receipt minting: at gateway-action handler (mirrors `agentStudio.run.execute`) | **Locked** — `governedProcedure` mints at the tRPC boundary; the gateway action declares `receiptRequired: true`. |
| 6 | Pricing storage: new `workspace_pricing_config` table (main DB) | **Locked** — Phase 12.5 boundary doesn't apply (pricing is workspace-global, not AS-scoped). |
| 7 | Pricing key: UNIQUE `(workspaceId, modelRef)` | **Locked**. |
| 8 | Pricing fallback: built-in OpenAI + Anthropic defaults table | **Locked** — frozen `BUILT_IN_PRICING` with capture-date comment + URL pointers. |
| 9 | Pricing read site: at binding-resolution time in `chat-stream.ts` | **Locked** — single round-trip; pricing resolved alongside the binding. |
| 10 | CI subset: 6 PMB unit-test files; NOT whole `server/**` | **Adapted** — shipped as 7 files (added `pricing.test.ts` in §30.2). Same scope discipline; test count grew with the §30.2 surface. |

**Cap: 0 / 1 allowed new exceptions.** Used: 0. No new TEMPORARY_EXCEPTION_WITH_DEADLINEs introduced.

---

## Lessons (carry-forward for Phase 31+)

1. **Receipts at the tRPC boundary, not the primitive.** The §30.1 split — primitive in 29.1b (no receipt) → tRPC + gateway in 30.1 (governedProcedure mints receipt) — is the canonical shape. Future admin surfaces should mirror it: ship the read primitive first, then layer governed write surfaces on top in a follow-up PR. Keeps each PR focused; keeps the receipt obligation visible at the right layer.
2. **Pricing as a separate module, not a registry hook.** `provider.getCostPerToken()` was a registry-attached method; it died with LR-08's registry purge. The new `getModelPricing()` is a free function in `server/providers/pricing.ts` with no registry coupling. Future per-workspace knobs (rate limits, fallback chains) should follow the same shape — separate module, lookup-chain pattern, frozen built-in fallback table with capture-date provenance.
3. **CI subset > CI whole-tree.** Pulling `server/**/*.test.ts` wholesale would have surfaced two pre-existing broken tests in `chat-binding.test.ts` (tool-loop assertions deferred as §B-followup). The explicit-enumeration pattern in `run-tests.yml` keeps the signal-to-noise ratio high; the cost (one line per new file added) is trivial compared to the cost of merging with red CI on unrelated broken tests.
4. **Static readiness ≠ live smoke.** The §30.3 static-readiness sweep is a real deliverable — it confirms the runbook's expected surfaces exist in code — but it does NOT replace the browser-driven smoke pass. Future phases that require live-smoke should either (a) include it in scope with an operator hand-off step, or (b) accept that the issues carry forward to manual verification post-merge. Both are valid outcomes; the closure report should explicitly say which.
5. **UX-driven scope adaptations are fine when the invariant survives.** §30.1's "Workspace Settings tab" pivot to "standalone route" is a UX call — the eligibility surface, receipt obligation, and D-WDB-3 no-credentials invariant all carried unchanged. The decision matrix's column-3 "outcome" pattern (Locked / Adapted) lets reviewers see the scope-adaptation events without scanning every diff.

---

## CI fingerprint

| Phase 30 PR | run-tests.yml jobs (build/ci/test/Governance Enforcement Harness/Governance Compliance Checks) |
|---|---|
| #252 (30.0 docs) | 5/5 ✅ |
| #253 (30.4 CI hardening) | 5/5 ✅ |
| #254 (30.2 cost-calc) | 5/5 ✅ |
| #255 (30.1 admin surface) | 5/5 ✅ |
| (this PR — closure report) | (expected 5/5) |

**Phase 30 baseline: 5/5 green throughout.** No regressions; no flaky reruns required.

---

## Memory updates after this PR

- `MEMORY.md` — Phase 30 entry flips to CLOSED; Phase 30 authority entry stays (closed-out form, mirrors Phase 28/29 pattern).
- `project_phase_30_authority.md` — flipped to CLOSED with PR ledger.
- `project_pmb_phase_30_complete.md` — created with PR ledger + the 5 carry-forward lessons above.
- `project_rac_progress.md` — updated to point at `main@<this-PR-merge-sha>` with Phase 30 marked CLOSED.
