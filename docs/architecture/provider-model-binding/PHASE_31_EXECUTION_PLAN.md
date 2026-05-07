# Phase 31 — Execution Plan

**Captured:** 2026-05-07 against `main@7eb1f56` (post-Phase-30 closure).
**Branch (this doc):** `docs/pmb-phase-31-0-execution-plan`.
**Owner:** Planner role per AGENTS.md; full autonomous-execution authority granted by user 2026-05-07 (Option A — barrel-strip).

---

## 1. Why Phase 31 exists

Phase 26 landed the `check:ai-types-public-api-boundary` lint in baseline-allow mode. The check enforces that code outside `server/ai-types/` may only import from the AI Types **public-API surface** (`public-api.ts`, `manifest.ts`, `types.ts`, `contracts.ts`, `events.ts`, `ports.ts`); imports from private modules (`db`, `service`, `service-runtime`, `execution`, `invoke`, `import-normalizer`, `projection`, `availability`, `publishing`, `legacy-import`, `register`, `router`, `boot`) are blocked.

The 22 known offenders at Phase 26 were baselined (`scripts/baseline/ai-types-public-api-boundary.txt`) to avoid breaking the world. The lint's "baseline-allow" mode warns on these but blocks any *new* offenders. The cleanup of those 22 was deferred to Phase 26.1.

Phase 31 IS Phase 26.1. Closes:

- **LA-01** — strip the three barrel re-exports of `ai-types/db` (in `server/db.ts:34`, `server/db/index.ts:19`, and the implicit reach in `server/db/catalog.ts:36`).
- **LA-02** — migrate the 22 baselined callers to either `aiTypes.*` gateway actions or `ai-types/public-api.ts` re-exports. Empties the baseline file. Lint flips from "baseline-allow" to "strict" mode (any private import fails).

Phase 31 is **NOT** a D1-violation closure phase. The boundary-lint allowlist for raw API keys (`PMB-D1-EXEMPT`) is unchanged. This is a module-boundary cleanup at the import-graph level.

---

## 2. Scope and out-of-scope

### In scope

- **Public-API surface elevation.** Add a controlled re-export list of read-only helpers from `ai-types/db.ts` to `ai-types/public-api.ts`. Writes do NOT get re-exported.
- **Gateway-action additions** for any caller that needs a write surface (e.g., the `seedTaxonomy` boot path in `server/_core/index.ts`).
- **Caller migrations.** Each of the 22 baselined files moves to either `from "../ai-types/public-api"` (for read helpers + types) or `gatewayCall("aiTypes.*", ...)` (for cross-module calls).
- **Strip the three barrel re-exports** once all callers are migrated.
- **Lint mode flip** — change `check:ai-types-public-api-boundary` from baseline-allow to strict; delete `scripts/baseline/ai-types-public-api-boundary.txt`.
- **LR register** — flip LA-01 + LA-02 to `migrated`.

### Out of scope

- **AI Types module-internal cleanup.** Private modules (`db`, `service`, etc.) keep their current shape; we're only adjusting the public surface.
- **`server/ai-types/router.ts`** mounting from `platform/modules/module-routers.ts` is the legitimate tRPC sub-router mount; it stays as-is (architecturally exempted via the platform layer's module-router pattern).
- **LC-* rows** (catalog_entries direct readers/writers) are tracked separately in `CATALOG_WRITER_MIGRATION_MATRIX.md` and were closed in Phase 26 PRs. Phase 31 does not re-litigate them.
- **DOCX + OCR-PDF parsers, multi-region D2, frontend Module-Gateway, chat-binding tool-loop tests** — separate tracks (see Phase 30 §2 out-of-scope list).

---

## 3. Sub-phase decomposition

Cheap-dependency-first ordering. 31.1 (surface elevation) is a prerequisite for 31.3 (caller migrations); 31.4 (barrel strip) depends on 31.3 fully landing.

### 31.0 — Plan freeze (this PR)

- [ ] Land `PHASE_31_EXECUTION_PLAN.md` (this doc).
- [ ] Memory: create `project_phase_31_authority.md`; `MEMORY.md` index update.
- [ ] **Acceptance:** doc lands; CI 5/5 green.

### 31.1 — AI Types public-API read-helper surface elevation

- [ ] Add a controlled re-export block in `server/ai-types/public-api.ts`:
  - **Read helpers:** `getCatalogEntries`, `getCatalogEntryById`, `getCatalogEntryVersions`, `getActiveBundleForEntry`, `getActiveBundles`, `getBundleByHash`, `getPublishBundles`, `getCatalogAuditEvents`, `getExecutionRunById`, `listExecutionRuns`, `getTaxonomyNodes`, `getTaxonomyTree`, `getTaxonomyChildren`, `getEntryClassifications`.
  - **Type re-exports** as needed (callers will need `CatalogEntry`, `PublishBundle`, etc.; many are already in `types.ts`/`contracts.ts` — add only what's missing).
- [ ] **Writes are NOT re-exported.** `createCatalogEntry`, `updateCatalogEntry`, `approveCatalogEntry`, `deleteCatalogEntry`, `createPublishBundle`, `recallPublishBundle`, `setEntryClassifications`, `createCatalogAuditEvent`, `createExecutionRun`, `updateExecutionRun`, `seedTaxonomy` stay private. Callers that need writes MUST go through a gateway action.
- [ ] **Acceptance:** `tsc --noEmit` clean; new re-export block doesn't shadow existing `public-api.ts` exports.
- [ ] **Estimate:** 1 PR, ~30 LOC.

### 31.2 — Gateway-action audit for write callers

- [ ] Walk the 22 baselined callers; classify each call site:
  - **Read** → migrates to `from "../ai-types/public-api"` in §31.3.
  - **Write** that already has a gateway action (e.g., `aiTypes.catalog.register`) → migrates to `gatewayCall(...)` in §31.3.
  - **Write** with NO existing gateway action → flag here; either (a) ship a new gateway action in §31.2, or (b) accept that the caller is platform-internal (e.g., the `seedTaxonomy` boot path in `server/_core/index.ts`) and document the exemption.
- [ ] Likely outcomes (predicted, to be confirmed by audit):
  - `seedTaxonomy` — platform-bootstrap; document as architecturally permitted (boot path uses module init, not gateway).
  - `createCatalogAuditEvent` — internal observability; routes through existing register/lifecycle actions where used.
  - `createExecutionRun` / `updateExecutionRun` — execution sub-system; check if `aiTypes.execution.*` gateway actions cover the surface.
  - `createPublishBundle` / `recallPublishBundle` — publishing lifecycle; check `aiTypes.catalog.publish`/`deprecate` coverage.
  - `setEntryClassifications` — taxonomy admin; check if a new `aiTypes.taxonomy.classify` action is warranted.
- [ ] **Acceptance:** every baselined caller has a documented migration target (read-elevation, existing-gateway-action, new-gateway-action, or architecturally-exempt). Pause and surface if more than 2 require new gateway actions (cap is implicit; surfaces overscope).
- [ ] **Estimate:** audit-only; lands as part of §31.3a's plan ledger or as a separate stub PR if scope grows.

### 31.3 — Caller migrations (split by domain)

Each sub-PR migrates a coherent slice of callers and removes their entries from the baseline file.

- [ ] **31.3a — DB-domain callers** (the meatiest cluster).
  - `server/db/catalog.ts`, `server/governance/router.ts`, `server/llm/authority.ts`, `server/providers/router.ts`, `server/providers/catalog-guard.ts`, `server/routers/agents.ts`, `server/routers/bots.ts`, `server/routers/models.ts`, `server/sandbox-wf/seed-orchestrator.ts`.
  - All swap `from "../ai-types/db"` → `from "../ai-types/public-api"` for reads; gateway-call any writes per §31.2 audit.
- [ ] **31.3b — Modules + cross-cutting callers.**
  - `server/modules/pmt/context-translator-agent.ts`, `server/modules/pmt/idea-builder-agent.ts`, `server/ps/context-translator-router.ts`, `server/routers/catalog-registry.ts`, `server/routers/conversations.ts`.
  - These are likely cross-module calls; lean toward `gatewayCall` for writes and public-api for reads.
- [ ] **31.3c — Specialized callers** (catalog-import + agents + boot).
  - `server/catalog-import/router.ts` (uses `import-normalizer`, `projection`, `service`).
  - `server/agents/executor.ts`, `server/agents/stream.ts` (use `execution`, `invoke`).
  - `server/_core/index.ts` (uses `boot`, `execution`, `invoke` — bootstrap path).
  - These need careful per-callsite audit; some may need new public-api re-exports beyond the read-helper batch in §31.1.
- [ ] **31.3d — `routers/catalog-manage.ts`** (uses `service`).
  - LO-01 already resolved this file as "AI Types admin surface in wrong directory". Either (a) relocate it to `server/ai-types/admin-router.ts` (then the import is intra-module and the lint is satisfied automatically), or (b) elevate `service.ts`'s admin-write functions through `public-api.ts` with a clear "admin only" comment.
  - Pause and surface if the choice between (a) relocate and (b) elevate isn't obviously cleanest.
- [ ] **Acceptance per sub-PR:** the migrated files leave the baseline file; `tsc --noEmit` clean; CI 5/5 green.
- [ ] **Estimate:** 3–4 PRs total for §31.3, ~20 LOC each (mostly import-path swaps).

### 31.4 — Strip the three barrel re-exports + flip lint to strict

Once all 22 callers are migrated:

- [ ] **31.4a** — Strip the re-exports:
  - `server/db.ts:34` — remove `export * from "./ai-types/db";`.
  - `server/db/index.ts:19` — remove `export * from "../ai-types/db";`.
  - `server/db/catalog.ts:36` — remove the implicit reach (audit shows it imports from `../ai-types/db` indirectly; remove that import or replace with public-api re-export).
- [ ] **31.4b** — Delete `scripts/baseline/ai-types-public-api-boundary.txt` (now empty).
- [ ] **31.4c** — Flip `check:ai-types-public-api-boundary.ts` from baseline-allow to strict mode (error on ANY non-public AI Types import).
- [ ] **31.4d** — Update `LEGACY_EXCEPTION_REGISTER.md`: LA-01 + LA-02 → `migrated`.
- [ ] **Acceptance:** `npm run check:architecture` exits 0 with no warnings; the lint reports "Failures: 0, Baseline warnings: 0, OK".
- [ ] **Estimate:** 1 PR, ~50 LOC.

### 31.5 — Closure report

- [ ] Author `docs/evidence/provider-model-binding/PHASE_31_CLOSURE_REPORT.md` mirroring `PHASE_30_CLOSURE_REPORT.md`. Inventory: PR ledger; LR rows flipped; new public-api surface area; lessons.
- [ ] Update memory: `project_phase_31_authority.md` → CLOSED; `project_pmb_phase_31_complete.md` created with PR ledger + carry-forward lessons; `MEMORY.md` index update.
- [ ] **Acceptance:** all baselined callers migrated; lint in strict mode; CI 5/5 green.
- [ ] **Estimate:** 1 PR, ~250 LOC docs.

---

## 4. Decision matrix

Cap: **zero new TEMPORARY_EXCEPTION_WITH_DEADLINE entries.** If §31.2's audit surfaces more than 2 callers needing brand-new gateway actions (i.e., the AI Types public surface is meaningfully under-built), surface and pause for sign-off.

| # | Item | Decision | Sub-phase | Risk |
|---|---|---|---|---|
| 1 | Public-api re-export pattern | Controlled named-export list (NOT `export *`) | 31.1 | Low |
| 2 | Read helpers eligible for re-export | All `get*` / `list*` from `ai-types/db.ts` | 31.1 | Low |
| 3 | Write helpers handling | Stay private; require gateway-action migration in §31.3 | 31.1 | Low |
| 4 | Caller-migration grouping | By domain (DB-routers / modules+ps / specialized / catalog-manage) | 31.3 | Low |
| 5 | `catalog-manage.ts` resolution | Audit-decide between relocate (a) vs. elevate (b) — pause if unclear | 31.3d | Medium |
| 6 | Bootstrap-path callers (`_core/index.ts`) | Likely architecturally exempt; document inline rather than ship a stub gateway action | 31.3c | Medium |
| 7 | Lint mode after migration | Flip baseline-allow → strict; delete baseline file | 31.4 | Low |
| 8 | Test strategy | Existing CI matrix (no new tests required); typecheck + integration tests are the regression gate | All | Low |

---

## 5. Test strategy

### Per sub-phase

- **31.0 (this):** docs only; CI green sufficient.
- **31.1 (surface elevation):** `tsc --noEmit` clean; existing AI Types tests still pass.
- **31.2 (audit):** docs only.
- **31.3 (caller migrations):** each sub-PR runs `tsc --noEmit` + the existing CI matrix; integration tests are the safety net for behavior preservation.
- **31.4 (strip + lint flip):** `npm run check:architecture` exits 0 with no warnings; CI 5/5 green.
- **31.5 (closure):** docs only.

### Cross-cutting

- **CI fingerprint:** Phase 31 baseline is **5/5 green** at `7eb1f56`. Any sub-phase that regresses below 5/5 pauses for diagnosis.
- **Tripwire tests:** the AI Types boundary lint IS the tripwire — once flipped to strict in §31.4, any future PR that re-introduces a private import fails CI.
- **No new boundary lints needed** — the existing `check:ai-types-public-api-boundary` is the enforcement surface.

---

## 6. Sizing

| Sub-phase | PRs | LOC code | LOC docs |
|---|---|---|---|
| 31.0 (this) | 1 | — | ~250 |
| 31.1 (surface elevation) | 1 | ~30 | ~10 |
| 31.2 (audit) | (rolled into 31.3a) | — | — |
| 31.3 (caller migrations) | 3–4 | ~80 | ~30 |
| 31.4 (strip + lint flip) | 1 | ~50 | ~20 |
| 31.5 (closure report) | 1 | — | ~250 |
| **Total** | **6–7** | **~160** | **~560** |

Comparable to Phase 30 (5 PRs / ~1,150 LOC + docs) but smaller in code-LOC — Phase 31 is mostly import-path mechanical changes.

---

## 7. CI fingerprint expectation

Phase 31 baseline is **5/5 green** as of `7eb1f56` (post-Phase-30.5 close-out). Phase 31 does not change the CI matrix shape; the new "Layer 5: PMB unit tests" job from Phase 30.4 is unaffected (the lint flip in §31.4 lives inside `check:architecture`, which `ci` already runs).

---

## 8. Authority and pause conditions

**Authority:** full autonomous commit/push/merge for any PR scoped inside this plan, granted 2026-05-07 (Option A from end-of-Phase-30 framings).

**Pause and surface for sign-off if:**

1. Any sub-phase requires a *new* TEMPORARY_EXCEPTION_WITH_DEADLINE (cap: 0).
2. §31.2's audit finds more than 2 callers needing brand-new gateway actions — surfaces that the AI Types public surface is meaningfully under-built and warrants its own scoping pass.
3. §31.3d's `catalog-manage.ts` resolution can't pick between relocate vs. elevate — surface for ADR before locking the choice.
4. A caller migration breaks an existing test that's not trivially adjustable — pause and surface; behavior preservation is the gate.
5. Pre-existing red CI on a sub-phase PR not on the known-flaky-shard list.
