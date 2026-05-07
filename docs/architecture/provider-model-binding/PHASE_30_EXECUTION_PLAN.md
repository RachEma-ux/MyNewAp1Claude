# Phase 30 — Execution Plan

**Captured:** 2026-05-07 against `main@9f165f6` (post-Phase-29 closure).
**Branch (this doc):** `feat/pmb-phase-30-0-execution-plan`.
**Owner:** Planner role per AGENTS.md; full autonomous-execution authority granted by user 2026-05-07 (per `project_phase_30_authority.md`).

**Supersedes** `PHASE_30_SCOPING.md`, which captured the four candidate framings (A/B/C/D). User picked **Option D — "Workspace operator surface"**. This doc is the plan-frozen authoritative source going forward.

---

## 1. Why Phase 30 exists

Phase 29 closed the 5 deferred LR caller migrations cleanly: all five callers migrated, boundary-lint allowlist down to 1 entry, ~1,100 LOC dead code excised. The closure report listed several follow-ups intentionally deferred to keep each Phase-29 PR focused on D1 closure.

Phase 30 picks up those follow-ups under one coherent theme: **what the workspace admin can see, configure, and trust in the post-Phase-29 binding world.**

The biggest functional gap is in `chat/stream.ts`: the previous `provider.getCostPerToken()` registry hook is gone, so cost-tracking now records `cost: 0` end-to-end. That's a real regression in observability.

The biggest UX gap is in workspace-default-binding management: admins currently set defaults via direct SQL or one-off scripts because the §29.1b PR was scoped to ship the read-API primitive only.

Phase 30 is **NOT a D1-violation closure phase.** All five LRs that had Phase-29-deadlines are migrated. Boundary-lint allowlist is at its minimum.

---

## 2. Scope and out-of-scope

### In scope

- **§29.1c admin UI** — operator-facing panel for setting per-role workspace-default bindings (chat / embedding / tool / classifier).
- **chat-stream cost-calculation rebuild** — per-workspace pricing config + restoration of cost-tracking on the SSE `complete` event.
- **Live-smoke pass** through Phase-29 followup issues #248 / #249 / #250 / #251 — fix anything surfaced.
- **Targeted CI hardening** — bring 4 PMB unit-test files into `run-tests.yml` (not the whole `server/**` tree).

### Out of scope

- **Phase 26.1 barrel-strip + caller migration.** Plan v3 follow-up; orthogonal to PMB. Files separately as its own track.
- **Frontend Module-Gateway plan** (`FUTURE_FRONTEND_TRPC_CLEANUP.md`) — separate plan.
- **D2 multi-region deployment** — CLAUDE.md deferral.
- **DOCX + OCR-PDF parsers** — D-PARSE-DOCX-N / D-PARSE-OCRPDF-N separate track.
- **2 remaining `chat-binding.test.ts` tool-loop test failures** — local-dev-only; not in CI; can ship a §B-followup PR independently.
- **`server/**` test sweep beyond the 4 PMB-targeted files** — explicit limit in §30.4 to avoid pulling in the whole tree (which includes broken legacy tests).

---

## 3. Sub-phase decomposition

Cheap-dependency-first ordering. 30.1 + 30.2 + 30.4 can ship in parallel after 30.0; 30.3 depends on 30.1 + 30.2 (smoke includes admin-UI + cost paths); 30.5 depends on all preceding.

### 30.0 — Plan freeze (this PR)

- [ ] Land `PHASE_30_EXECUTION_PLAN.md` (this doc); supersede `PHASE_30_SCOPING.md` with a header note.
- [ ] No code changes; CI green expected.
- [ ] **Acceptance:** doc lands; `pnpm run check` clean; CI green.

### 30.1 — Workspace-default-binding admin surface

Per **D-WDB-7** (workspace-default-binding ADR): "Writes (admin-set defaults) DO need a gateway action with receipts, captured in the §29.1b implementation PR alongside a tRPC endpoint." The receipt-required gateway action + tRPC + UI ship together here (deferred from 29.1b to keep that PR primitive-focused).

- [ ] **30.1a — Gateway actions.** Register on the agentStudio manifest:
  - `agentStudio.workspaceDefaultBindings.list` (low risk; no receipt) — workspace-scoped read.
  - `agentStudio.workspaceDefaultBindings.upsert` (medium risk; **receipt required** per D-WDB-7) — wraps `upsertWorkspaceDefaultBinding`.
  - `agentStudio.workspaceDefaultBindings.delete` (medium risk; **receipt required**) — wraps `deleteWorkspaceDefaultBinding`.
- [ ] **30.1b — tRPC procedures.** Add `agentStudio.workspaceDefaultBindings.*` router under the existing AS tRPC tree. `list` is `protectedProcedure`; `upsert`/`delete` are `governedProcedure` (mints the receipt at the procedure boundary).
- [ ] **30.1c — Admin UI panel.** New tab/section under Workspace Settings → "Default Bindings". Four cards (chat / embedding / tool / classifier) per `D-WDB-4`. Each card shows:
  - Current binding (provider-connection display name + `modelRef`) OR "No default set".
  - Edit button → modal with `listActiveForProvider`-backed picker for the workspace's active connections + free TEXT input for `modelRef`.
  - Delete button (clears the default) — confirmation modal.
- [ ] **30.1d — Tests.** Unit tests for the new gateway actions (mock `getAsDb`); tRPC integration smoke if a fixture exists (otherwise covered in 30.3 live-smoke).
- [ ] **Acceptance:** 4 roles configurable from UI; receipt minted on each write; `resolveWorkspaceDefaultBinding` returns the persisted row; **live-smoke** confirms end-to-end.
- [ ] **Estimate:** 1 PR, ~500 LOC code + ~50 LOC docs.
- [ ] **Pause if:** D-WDB-7's receipt-minting infra doesn't fit cleanly (e.g., the AS-bindings flow doesn't apply because workspace-defaults are a different surface) — surface for ADR before locking 30.1.

### 30.2 — chat-stream cost-calculation rebuild

The previous registry-based pricing (`provider.getCostPerToken()`) went with the LR-08 registry usage. Cost is currently `0` end-to-end on every chat-stream call.

- [ ] **30.2a — Pricing schema.** New table `workspace_pricing_config` (main DB, NOT ASDB — pricing is workspace-global, not AS-scoped). Columns:
  - `id SERIAL`, `workspaceId INTEGER NOT NULL`, `modelRef VARCHAR(255) NOT NULL`,
  - `inputCostPer1kTokens NUMERIC(12,6) NOT NULL`, `outputCostPer1kTokens NUMERIC(12,6) NOT NULL`,
  - `currency VARCHAR(8) DEFAULT 'USD'`, audit cols.
  - UNIQUE `(workspaceId, modelRef)`; soft FK on `workspaceId`.
  - Drizzle declaration in `drizzle/tables/`; migration script; idempotent.
- [ ] **30.2b — Built-in defaults.** Hard-coded fallback table for OpenAI (`gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `text-embedding-3-small`, `text-embedding-3-large`) + Anthropic (`claude-sonnet-4-6`, `claude-opus-4-7`, `claude-haiku-4-5-20251001`) using public list-prices as of 2026-05-07. Source-of-truth comment cites the price-doc URL + capture date so future updates are traceable.
- [ ] **30.2c — Read API.** New `getModelPricing(workspaceId, modelRef): Promise<PricingProfile>` in `server/providers/pricing.ts`. Lookup order: workspace-config row → built-in default → `0` (with `console.warn`).
- [ ] **30.2d — chat-stream integration.** `chat/stream.ts`: read pricing alongside `resolveChatBinding`; restore cost calc using `finalUsage.inputTokens` + `finalUsage.outputTokens` × the pricing fields; cost field re-emerges in the SSE `complete` event with `currency: "USD"`.
- [ ] **30.2e — Tests.** Unit tests for `getModelPricing` (workspace override / built-in default / unknown-model fallback); unit test for chat-stream cost field on `complete` event (mock the pricing module + Model Access).
- [ ] **Acceptance:** chat-stream's `complete` event carries non-zero `cost` for known models; `currency` field present; defaults documented inline. **Live-smoke** confirms cost shows up in the chat UI's audit panel.
- [ ] **Estimate:** 1 PR, ~300 LOC code + ~50 LOC docs.
- [ ] **Pause if:** the pricing-doc shape is stale enough that "good defaults" is misleading — surface before shipping `0`s with claims of "calculated".

### 30.3 — Live-smoke pass through #248–#251

The four issues filed in the Phase 29 close-out, run end-to-end against the dev server.

- [ ] **30.3a — Issue #248 (29.0a simulation).** Boot dev app; run an Agent Studio simulation in mock + live runtime modes per the issue's test paths. Each path PASSes or generates a follow-up PR.
- [ ] **30.3b — Issue #249 (29.4b doc upload + RAG).** Three paths: configured embedding default (success), no default (`EmbeddingResolutionError("default_not_set")` surfaces cleanly), unhealthy connection (typed reason). Plus likely a small UI fix to surface the typed reason in the upload status panel — file as a separate PR if non-trivial.
- [ ] **30.3c — Issue #250 (29.5 operator jobs).** All four operators (builder/auditor/governance/deploy) with classifier default; constraints clamping verified (governance: maxTokens=4096, temp=0.1).
- [ ] **30.3d — Issue #251 (29.6 chat UI + executeInvokeAgent).** All five paths from the issue body: chat-stream unified-routing-on, unified-routing-off, no-default refusal, RAG injection, executeInvokeAgent Path B refusal. Pre-condition SQL check from D-PR-5 before executing the Path B test.
- [ ] **Acceptance:** all four issues PASS-closed (or follow-up PRs linked); the smoke pass IS the deliverable, not a check.
- [ ] **Estimate:** 1–2 PRs, ~200 LOC of fixes (likely UI-side surfacing improvements).

### 30.4 — PMB unit tests into CI

Targeted CI hardening — only the PMB-relevant subset. Avoids pulling in the whole `server/**` tree (which includes `chat-binding.test.ts`'s 2 still-broken tool-loop tests).

- [ ] **30.4a — Extend `run-tests.yml`.** Add a new `pmb-unit` job that runs:
  - `server/agent-studio/workspace-default-bindings.test.ts`
  - `server/embeddings/service.test.ts`
  - `server/operators/provider-hub.test.ts`
  - `server/openrouter/manifest-receipt-policy.test.ts`
  - `server/openrouter/model-access/run-via-openllm-bridge.test.ts`
  - `server/openrouter/model-access/embed.test.ts`
  - Use `npx vitest run <files> --pool=forks --poolOptions.forks.singleFork --reporter=verbose` (project's standing OOM-safe pattern).
- [ ] **30.4b — Verification.** Re-run all 4 prior Phase-30 PRs locally to confirm none regress the new CI shard.
- [ ] **Acceptance:** new `pmb-unit` job appears in the `run-tests.yml` matrix; passes on this PR + the next PR after this one (regression check).
- [ ] **Estimate:** 1 PR, ~150 LOC of CI YAML.

### 30.5 — Closure report + register reconciliation

- [ ] Author `docs/evidence/provider-model-binding/PHASE_30_CLOSURE_REPORT.md` mirroring `PHASE_29_CLOSURE_REPORT.md`. Inventory: PR ledger; followups closed (#248/#249/#250/#251); new contract surfaces (admin gateway actions + pricing module); lessons (cost-calc + admin-UI patterns reusable for future phases).
- [ ] Update `LEGACY_EXCEPTION_REGISTER.md` aggregate counts (no new LRs expected — this is operator-facing polish).
- [ ] Update memory: `project_phase_30_authority.md` flipped to CLOSED; `project_pmb_phase_30_complete.md` created with PR ledger + carry-forward lessons.
- [ ] **Acceptance:** all 4 live-smoke issues closed; CI fingerprint stable at 5/5 + new pmb-unit job green.
- [ ] **Estimate:** 1 PR, ~250 LOC docs.

---

## 4. Decision matrix

Mirrors `PHASE_29_EXECUTION_PLAN.md` §4. Cap: **zero new TEMPORARY_EXCEPTION_WITH_DEADLINE entries** unless plan triggers a pause.

| # | Item | Decision | Sub-phase | Risk |
|---|---|---|---|---|
| 1 | Admin panel home | Workspace Settings → "Default Bindings" tab | 30.1c | Low — existing settings page |
| 2 | Role display | Four cards per D-WDB-4 lattice | 30.1c | Low |
| 3 | Provider Connection picker | Reuse `listActiveForProvider` (Phase 8) | 30.1c | Low — established |
| 4 | modelRef field | Free TEXT with placeholders | 30.1c | Low — admin knows their models |
| 5 | Receipt minting | At gateway-action handler (mirrors `agentStudio.run.execute`) | 30.1a | Medium — pause if pattern doesn't fit |
| 6 | Pricing storage | New `workspace_pricing_config` table (main DB) | 30.2a | Low — Phase 12.5 boundary doesn't apply |
| 7 | Pricing key | UNIQUE `(workspaceId, modelRef)` | 30.2a | Low |
| 8 | Pricing fallback | Built-in OpenAI + Anthropic defaults table | 30.2b | Medium — pause if data stale |
| 9 | Pricing read site | At binding-resolution time in `chat-stream.ts` | 30.2d | Low — single round-trip |
| 10 | CI subset | 6 PMB unit-test files; NOT whole `server/**` | 30.4a | Low — avoids pulling in broken legacy tests |

**Cap: 0 / 1 allowed new exceptions.** All decisions are MIGRATE or new-build; no deferrals planned. Pause and surface if any sub-phase wants to introduce a new TEMPORARY_EXCEPTION.

---

## 5. Test strategy

### Per sub-phase

- **30.0 (this):** docs only; CI green sufficient.
- **30.1 (admin UI):** unit tests for gateway actions (mock asdb); tRPC contract test if existing fixture; **live-smoke required** (pertains to admin-set flow end-to-end).
- **30.2 (cost-calc):** unit tests for `getModelPricing`; unit test for chat-stream cost-field assertion; **live-smoke required** (cost field shows in dev chat UI).
- **30.3 (smoke pass):** the smoke pass IS the test. Each issue PASSes or yields a fix PR.
- **30.4 (CI hardening):** the new `pmb-unit` job's first green run on this PR is the test.
- **30.5 (closure):** docs only.

### Cross-cutting

- **CI fingerprint:** Phase 30 baseline is **5/5 green** at `9f165f6`. Any sub-phase that regresses below 5/5 pauses for diagnosis.
- **Live-smoke discipline:** sub-phases 30.1, 30.2, 30.3 all require live-app smoke verification.
- **Tripwire tests:** boundary tests stay locked from Phase 29; no new tripwires expected (Phase 30 doesn't change D1 surface).

---

## 6. Sizing

| Sub-phase | PRs | LOC code | LOC docs | Smoke required |
|---|---|---|---|---|
| 30.0 (this) | 1 | — | ~250 | No |
| 30.1 (admin surface) | 1 | ~500 | ~50 | **Yes** |
| 30.2 (cost-calc) | 1 | ~300 | ~50 | **Yes** |
| 30.3 (smoke pass) | 1–2 | ~200 | ~50 | **Yes** (the pass IS the deliverable) |
| 30.4 (CI hardening) | 1 | ~150 | — | No |
| 30.5 (closure report) | 1 | — | ~250 | No |
| **Total** | **6–7** | **~1,150** | **~650** | 3 sub-phases |

Comparable to Phase 29 (12 PRs / ~3,500 LOC) but smaller — Phase 30 is operator-polish, not D1 closure.

---

## 7. CI fingerprint expectation

Phase 30 baseline is **5/5 green** as of `9f165f6` (post-Phase-29.8 close-out). After 30.4 lands, expect **6 jobs** (the new `pmb-unit` job adds to the matrix). Future-PR baseline becomes 6/6.

---

## 8. Authority and pause conditions

**Authority:** full autonomous commit/push/merge for any PR scoped inside this plan, per memory `project_phase_30_authority.md`.

**Pause and surface for sign-off if:**

- Any sub-phase requires a *new* TEMPORARY_EXCEPTION_WITH_DEADLINE (cap: 0).
- Live-smoke regression discovered during 30.3 — pause and surface; the smoke pass is the deliverable, not a check.
- 30.1 receipt-minting infra mismatch — D-WDB-7 specified receipt-required, but if existing Phase-20 infra doesn't fit cleanly for workspace-defaults, surface for ADR.
- 30.2 pricing data unavailable / stale — if "good defaults" would be misleading, surface rather than ship `0`s with claims of "calculated".
- Pre-existing red CI on a sub-phase PR not on the known-flaky-shard list.

**Reporting:** local/committed/pushed format; single end-of-phase summary at 30.5.

---

## 9. Cross-references

- `PHASE_30_SCOPING.md` — superseded by this plan; preserved as historical context.
- `PHASE_29_CLOSURE_REPORT.md` — origin of the follow-up tracks Phase 30 picks from.
- `WORKSPACE_DEFAULT_BINDING_DECISION.md` — D-WDB-1..8 (consumed by 30.1; specifically D-WDB-7 on receipt enforcement).
- `RECEIPT_POLICY.md` — `system-internal` exemption + receipt-required pattern carries through.
- `MODEL_ACCESS_CONTRACT.md` — Model Access surface unchanged from Phase 29.
- `LEGACY_EXCEPTION_REGISTER.md` — no new LRs expected; aggregate counts updated at 30.5.
- `project_phase_30_authority.md` — autonomous-execution authority grant.

---

## 10. Lessons carried forward (Phase 29's 5)

1. **Check the receipt policy when migrating a new caller** — applies to 30.1's gateway-action design; D-WDB-7 already specified receipt-required, so this is pre-locked.
2. **Direct-import is the streaming pattern** — N/A for Phase 30; no new streaming consumers.
3. **`allowedModels`-style hard-coded lists are anti-patterns** — applies to 30.2's pricing config: don't hard-code per-operator pricing; workspace admin owns it via the table.
4. **Path B (refuse) is the right move for legacy-table support** — applies to 30.3's Path B smoke (issue #251 includes the D-PR-5 pre-condition SQL).
5. **`server/**` tests are NOT in CI** — directly addressed by 30.4 (curated subset only).

These five carry forward to any future PMB phase. New lessons will be captured at 30.5 closure.
