# Phase 30 — Scoping Doc (HISTORICAL — superseded by PHASE_30_EXECUTION_PLAN.md)

**Captured:** 2026-05-07 against `main@9f165f6` (post-Phase-29 closure).
**Branch (this doc):** `feat/pmb-phase-30-0-execution-plan` (this 30.0 PR).
**Owner:** Planner role per AGENTS.md.

> **STATUS:** **Superseded by `PHASE_30_EXECUTION_PLAN.md`** as of Phase 30.0 plan freeze. User authorized Option D + autonomous execution on 2026-05-07. The execution plan is the plan-frozen authoritative source going forward; this scoping doc is preserved as historical context for future readers tracing the Phase-30 framing decision.

---

## 1. Why Phase 30 exists

Phase 29 closed the 5 deferred LR caller migrations cleanly, but the closure report listed several follow-ups that were intentionally deferred to keep each Phase-29 PR focused on D1 closure. After Phase 29's allowlist contraction (down to 1 entry), the remaining gaps are **operator-facing polish + observability + carry-forward cleanup**, not D1-violation surface.

The biggest functional gap is in `chat/stream.ts`: the previous `provider.getCostPerToken()` registry hook is gone, so cost-tracking now records `cost: 0` end-to-end. That's a real regression in observability. The biggest UX gap is in workspace-default-binding management: admins currently set defaults via direct SQL or one-off scripts because the §29.1b PR was scoped to ship the primitive only.

Phase 30 is **not a D1-violation closure phase.** All five LRs that had Phase-29-deadlines are migrated; the boundary-lint allowlist is at its minimum.

---

## 2. Candidate scope (4 framing options for the user to choose from)

Each option below stands alone; the user can pick one, or mix. The recommended pick is Option D.

### Option A — "Operator surface completion" (~6 PRs, ~1,500 LOC)

**Focus:** the operator-facing gap left by Phase 29.

| Sub-phase | Item |
|---|---|
| 30.0 | Plan freeze |
| 30.1 | §29.1c admin UI for workspace-default bindings (gateway action + tRPC + UI panel) |
| 30.2 | chat-stream cost-calculation rebuild (workspace-level pricing config) |
| 30.3 | Live-smoke pass through issues #248–#251 — fix anything surfaced |
| 30.4 | Phase 26.1 barrel-strip + caller migration (Plan v3 final cleanup) |
| 30.5 | Closure report |

**Pros:** clear theme; addresses the most user-visible gaps from Phase 29; finishes Plan v3 cleanup as a side-effect.
**Cons:** mixes operator UI work (sub-phases 30.1, 30.2) with backend cleanup (30.4); some PRs are UI-heavy and need more visual review.

### Option B — "CI hardening" (~5 PRs, ~600 LOC)

**Focus:** the test-infra gaps surfaced during Phase 29.

| Sub-phase | Item |
|---|---|
| 30.0 | Plan freeze |
| 30.1 | Bring `server/**/*.test.ts` (or a curated subset) into CI's `run-tests.yml` |
| 30.2 | Repair the 2 remaining `chat-binding.test.ts` tool-loop tests |
| 30.3 | Live-smoke pass through issues #248–#251 |
| 30.4 | Closure report |

**Pros:** small, focused; closes a real CI-visibility gap (Phase 29's lesson #5); addresses the deferred test-infra item.
**Cons:** doesn't fix the `cost: 0` regression in chat-stream — a known operator-visible bug.

### Option C — "Cost + admin minimum" (~4 PRs, ~800 LOC)

**Focus:** just the two most user-visible Phase-29 follow-ups.

| Sub-phase | Item |
|---|---|
| 30.0 | Plan freeze |
| 30.1 | §29.1c admin UI for workspace-default bindings |
| 30.2 | chat-stream cost-calculation rebuild |
| 30.3 | Closure report |

**Pros:** smallest, fastest; ships visible value.
**Cons:** leaves Phase 26.1 cleanup, CI gap, and live-smoke debt unaddressed.

### Option D — "Workspace operator surface" (~6–7 PRs, ~1,800 LOC) **← recommended**

**Focus:** the unifying theme is "what the workspace admin can see, configure, and trust" in the post-Phase-29 binding world.

| Sub-phase | Item |
|---|---|
| 30.0 | Plan freeze |
| 30.1 | §29.1c admin UI for workspace-default bindings (gateway action + tRPC + UI panel) |
| 30.2 | chat-stream cost-calculation rebuild (per-workspace pricing config + cost field on `complete` SSE event) |
| 30.3 | Live-smoke pass through issues #248–#251; fix anything surfaced (incl. `EmbeddingResolutionError` → user-friendly UI surface) |
| 30.4 | Bring critical `server/**` PMB unit tests into CI (`workspace-default-bindings`, `embeddings/service`, `operators/provider-hub`, `manifest-receipt-policy`) |
| 30.5 | Closure report |

**Pros:** coherent operator-surface theme; fixes the most visible regression (`cost: 0`); ships a real admin UI; includes targeted CI hardening (only the PMB-relevant tests, not the whole `server/**` tree).
**Cons:** UI work in 30.1 needs visual smoke before merge (per CLAUDE.md UI rule).

**Why D over A:** Phase 26.1 barrel-strip is genuinely orthogonal (Plan v3 follow-up, not a PMB issue). Folding it in dilutes the theme. Better as its own small follow-up plan after Phase 30.

**Why D over B:** Option B leaves the cost regression open. Cost-tracking is operator-facing; a `0` cost field on every chat SSE event is a real observability bug that operators will notice before they notice missing test coverage.

**Why D over C:** Option C ships fastest but misses the live-smoke debt + the targeted CI gap. The §29.1c UI without smoke-tested confirmation that the underlying primitives actually work in dev is a partial closure.

---

## 3. Recommended scope (Option D)

If authorized, Phase 30 ships **6 PRs** under one autonomous-execution authority grant:

1. **30.0 — Plan freeze** (~250 LOC docs). Mirror the Phase 28/29 pattern: this scoping doc → `PHASE_30_EXECUTION_PLAN.md`, sub-phase mapping table, decision matrix, authority pause conditions.

2. **30.1 — Workspace-default-binding admin surface** (~500 LOC). Gateway action `agentStudio.workspaceDefaultBindings.set` + receipt descriptor (D-WDB-7 already specifies it requires a receipt). tRPC procedure `agentStudio.workspaceDefaultBindings.list/upsert/delete`. New React panel under workspace settings showing the four roles (`chat`/`embedding`/`tool`/`classifier`) with provider-connection picker + model-ref input. Smoke verification: configure all four roles via UI; confirm `resolveWorkspaceDefaultBinding` returns the row.

3. **30.2 — chat-stream cost-calculation rebuild** (~300 LOC). New `workspace_pricing_config` table (or per-Provider-Connection pricing column) keyed on `(workspaceId, modelRef)` with `inputCostPer1kTokens` + `outputCostPer1kTokens`. `chat/stream.ts` reads pricing at the same time as the binding lookup; cost calculation re-emerges in the SSE `complete` event. Defaults: a small set of public OpenAI / Anthropic prices baked in, falling back to `0` for self-hosted / unknown providers (better than always `0`).

4. **30.3 — Live-smoke pass through #248–#251** (~200 LOC of fixes). Run each smoke step against the dev server. Each issue produces either a "PASS — close issue" or "FAIL → fix PR + re-smoke". Likely surfaces small UI-side fixes (e.g., the `EmbeddingResolutionError` reason isn't gracefully shown in the document-upload status today). Plan v3 lesson: live-smoke is a distinct surface from CI green.

5. **30.4 — PMB unit tests into CI** (~150 LOC of CI YAML). Extend `run-tests.yml` with a new `pmb-unit` job that runs the targeted set: `server/agent-studio/workspace-default-bindings.test.ts`, `server/embeddings/service.test.ts`, `server/operators/provider-hub.test.ts`, `server/openrouter/manifest-receipt-policy.test.ts`. NOT the whole `server/**` tree — that includes the still-broken `chat-binding.test.ts` tool-loop assertions and would need broader cleanup. Use `--pool=forks --poolOptions.forks.singleFork` per the project's standing OOM-safe pattern.

6. **30.5 — Closure report** (~250 LOC docs). Mirror `PHASE_29_CLOSURE_REPORT.md`. Inventory: what shipped, follow-up state (any new issues filed), lessons (cost-calc + admin-UI patterns reusable for future phases).

**Estimate total:** 6 PRs, ~1,650 LOC code + ~500 LOC docs.

---

## 4. Decision matrix (for sub-phases 30.1 + 30.2)

### 30.1 — admin UI shape

| # | Path | Decision | Rationale |
|---|---|---|---|
| 1 | Where does the panel live? | Workspace Settings → "Default Bindings" tab | Existing workspace-settings page is the natural home; matches "what the workspace admin sees" theme |
| 2 | How are roles displayed? | Four cards (chat / embedding / tool / classifier), each showing current default + edit button | Matches the D-WDB-4 lattice 1:1; explicit beats hidden |
| 3 | Provider Connection picker | Reuse existing `listActiveForProvider` query | Already exists from Phase 8; no new infra |
| 4 | modelRef field | Free TEXT input with placeholder examples per role | Workspace admins know their model strings; an enum-like dropdown is brittle as new models ship |
| 5 | Receipt minting | Mint at gateway-action handler (mirroring `agentStudio.run.execute`) | D-WDB-7 specifies receipt-required; pattern is established |

### 30.2 — pricing config shape

| # | Path | Decision | Rationale |
|---|---|---|---|
| 1 | Storage location | New `workspace_pricing_config` table (main DB, NOT ASDB) | Pricing is global per workspace; Phase 12.5 boundary doesn't apply |
| 2 | Key | `(workspaceId, modelRef)` UNIQUE | Per-workspace overrides; same model can have different prices per workspace (volume contracts) |
| 3 | Fallback when no row | Built-in defaults table for OpenAI + Anthropic public prices | Better than `0`; conservative-leaning |
| 4 | Where is it read in chat-stream? | At binding-resolution time (one extra DB query alongside `resolveChatBinding`) | Single round-trip; no performance regression |

These are pre-locked here so 30.1/30.2 PRs don't re-litigate them.

---

## 5. Sizing (per-sub-phase)

| Sub-phase | PRs | LOC code | LOC docs | Smoke required? |
|---|---|---|---|---|
| 30.0 | 1 | — | ~250 | No |
| 30.1 | 1 | ~500 | ~50 | **Yes** (UI smoke) |
| 30.2 | 1 | ~300 | ~50 | **Yes** (cost field on SSE event) |
| 30.3 | 1–2 | ~200 | ~50 | **Yes** (the smoke pass IS the deliverable) |
| 30.4 | 1 | ~150 | — | No (CI YAML edit) |
| 30.5 | 1 | — | ~250 | No |
| **Total** | **6–7** | **~1,150** | **~650** | 3 sub-phases |

Comparable to Phase 29's 11-PR total. The novel work is concentrated in 30.1 (admin UI) + 30.2 (pricing); 30.3–30.5 are mechanical follow-up.

---

## 6. Pause conditions (mirrors Phase 28/29)

If authorized, Phase 30 inherits the Phase-29 authority pattern with these additions:

1. **Any *new* TEMPORARY_EXCEPTION_WITH_DEADLINE** — surface for sign-off. Cap is 0/1 allowed.
2. **Live-smoke regression discovered during 30.3** — pause and surface; the smoke pass is the deliverable, not a check. If it surfaces a structural bug (e.g., `EmbeddingResolutionError` not propagating), that becomes its own sub-phase.
3. **30.1 receipt-minting infra mismatch** — D-WDB-7 specified receipt-required, but if the existing Phase-20 receipt minting pattern doesn't fit cleanly (e.g., the AS-bindings flow doesn't apply because workspace-defaults are a different surface), surface for ADR before locking 30.1.
4. **30.2 pricing data unavailable** — if the public OpenAI/Anthropic pricing doc shape changes or the data is stale enough that "good defaults" is misleading, surface for sign-off rather than ship `0`s with claims of "calculated".
5. **Pre-existing red CI** — same shape as Phase 28/29.

---

## 7. Out of scope (explicitly)

- **Phase 26.1 barrel-strip + caller migration.** Plan v3 follow-up; orthogonal to PMB. Files separately as its own track.
- **Frontend Module-Gateway plan** (`FUTURE_FRONTEND_TRPC_CLEANUP.md`).
- **D2 multi-region deployment** (CLAUDE.md deferral).
- **DOCX + OCR-PDF parsers** (D-PARSE-DOCX-N / D-PARSE-OCRPDF-N — separate Phase D-followup track).
- **2 remaining `chat-binding.test.ts` tool-loop test failures.** Local-dev-only; not in CI; can ship a §B-followup PR independently if a developer hits them.
- **`server/**` test sweep beyond the 4 PMB-targeted files.** Scope explicitly limited to 30.4 to avoid pulling in the whole `server/**/*.test.ts` tree (which includes broken legacy tests like the chat-binding tool-loop ones).

---

## 8. Cross-references

- `PHASE_29_CLOSURE_REPORT.md` — origin of the 4 follow-up tracks Phase 30 picks from.
- `WORKSPACE_DEFAULT_BINDING_DECISION.md` — D-WDB-1..8 (consumed by 30.1 admin UI; specifically D-WDB-7 on receipt enforcement).
- `RECEIPT_POLICY.md` — `system-internal` exemption (Phase 29.4a) carries through; 30.1's receipt-required gateway action follows the existing pattern.
- `PROVIDER_ROUTER_MIGRATION_DECISION.md` — D-PR-2 documented chat-stream's caller shape; 30.2's cost-calc rebuild plugs back into that shape.
- `MEMORY.md` — Phase 29 closed entry; future reference point for Phase 30 progress.

---

## 9. What the user is being asked to decide

1. **Which option** (A / B / C / **D recommended** / a custom mix)?
2. **Authorize autonomous execution** for the chosen scope (same shape as Phase 28/29 authority grants)?
3. **Any pre-locks** beyond §4's decision matrix that should land before 30.0?

If the answer is "go with D, autonomous", I write `project_phase_30_authority.md`, ship 30.0 (plan freeze) as the first PR replacing this scoping doc with `PHASE_30_EXECUTION_PLAN.md`, and proceed end-to-end.
