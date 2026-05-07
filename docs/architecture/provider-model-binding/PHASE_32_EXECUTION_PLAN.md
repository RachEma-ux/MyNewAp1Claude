# Phase 32 — Execution Plan

**Captured:** 2026-05-07 against `main@073699b` (post-Phase-31 closure).
**Branch (this doc):** `docs/pmb-phase-32-0-execution-plan`.
**Owner:** Planner role per AGENTS.md; full autonomous-execution authority granted by user 2026-05-07 (Option A — `<domain>.importToCatalog` gateway migration).

---

## 1. Why Phase 32 exists

Phase 31's §31.3b shipped a deliberate scope pivot: the 6 mixed-write callers (the 5 `<domain>.importToCatalog` procedures + the 2 PMT self-registration agents) kept their direct `createCatalogEntry` + `setEntryClassifications` + `createCatalogAuditEvent` pattern. The §31.2 audit found that adopting `gatewayCall("aiTypes.catalog.register", ...)` would change audit event shapes (legacy `catalog.{agent,bot,model,llm,provider}.submitted` → canonical `catalog.register.created`/`updated`), and the closure report flagged "behavior preservation is the gate" — the legacy event shapes might be filtered on by downstream consumers.

Phase 32 closes that follow-up. Concretely, it migrates the 5 `<domain>.importToCatalog` tRPC mutations to call `aiTypes.catalog.register` through the platform gateway, so:

1. Receipts are minted (Phase-25 invariant).
2. The Phase-24 duplicate-prevention guard runs (replacing the legacy structured-FK + JSON-config fallback checks).
3. The canonical `aiTypes.catalog.registered` event fires (Phase-39 invariant).

**Phase 32 is in scope:** the 5 importToCatalog procedures (`agents.importToCatalog`, `bots.importToCatalog`, `llm.importToCatalog`, `models.importToCatalog`, `providers.importToCatalog`).

**Phase 32 is NOT in scope:**

- The 2 PMT self-registration agents (`server/modules/pmt/{context-translator,idea-builder}-agent.ts`). Those are boot-time module-init flows, not user-driven mutations. Their migration to register is a different concern (boot-path receipt minting + system-actor handling).
- The `sandbox-wf/seed-orchestrator.ts` write site (`createCatalogEntry` + `createPublishBundle`). Seed orchestrator is dev-only fixture loading; it doesn't get exercised in production.

---

## 2. Audit findings — what we already know

A pre-flight audit (this PR) walked the codebase looking for behavior-preservation risk:

- **Downstream consumers of legacy event types:** zero. `grep -rn "catalog\.{agent|bot|model|llm|provider}\.submitted"` finds only the 5 emitting sites. No filter, no consumer, no test assertion.
- **Test assertions on event shapes:** zero. Two contract tests assert procedure existence (`models router has importToCatalog procedure`); both pass after the migration since the procedure name is preserved.
- **Auto-classification heuristic:** the legacy procedures auto-classify newly-imported entries to "first axis" via `getTaxonomyNodes({entryType, level:"axis"})` + `setEntryClassifications(entry.id, [axisNodes[0].id])`. This is a legacy convenience with no callers depending on it; admins re-classify entries through the dedicated taxonomy-management UI. Drop on migration.
- **Return shape:** legacy procedures return `{success: true, entry, imported}`. Register returns `{entryId, action, legacyImportState, guardReason}`. The migration translates register's result back to the legacy return shape (fetch the entry by id post-register, set `imported = (action === "created")`).
- **Duplicate-prevention semantics:** legacy procedures do a structured-FK check (`sourceType + sourceId`) plus a legacy JSON-config fallback. Register's `checkDuplicateLegacyImport` covers the structured-FK case + reconciliation rejection. The JSON-config fallback is dead-code drift — entries created in the modern era always have structured FK. Drop on migration; if a stale row surfaces in the wild, it would be flagged via the existing reconciliation process.

**Conclusion: behavior preservation is mechanical.** No new TEMPORARY_EXCEPTIONs; no scope creep.

---

## 3. Sub-phase decomposition

### 32.0 — Plan freeze (this PR)

- [ ] Land `PHASE_32_EXECUTION_PLAN.md` (this doc).
- [ ] Memory: create `project_phase_32_authority.md`; `MEMORY.md` index update.
- [ ] **Acceptance:** doc lands; CI 5/5 green.

### 32.1 — Migrate the 5 importToCatalog procedures

Single PR; the procedures all share the same shape, so doing them together preserves the review burden as "one decision, applied 5 times" rather than "5 nearly-identical PRs."

- [ ] Per procedure, replace the body with:
  ```ts
  const result = await gatewayCall<RegisterCatalogEntryInput, RegisterCatalogEntryResult>({
    ctx: {
      sourceModule: "<callerModule>",  // "agents" | "bots" | "llm" | "models" | "providers"
      targetModule: "aiTypes",
      actionKey: "aiTypes.catalog.register",
      governanceReceiptId: <receiptId>,  // sourced from input or minted
      actorId: ctx.user.id,
      workspaceId: <if-applicable>,
    },
    input: {
      entryType: "<entryType>",
      sourceType: "<entryType>",
      sourceId: <domainRowId>,
      fields: { name, displayName, description, scope, status, origin,
                reviewState, config, tags, capabilities, createdBy },
      registeredBy: ctx.user.id,
      sourceModule: "<callerModule>",
    },
  });
  const entry = await getCatalogEntryById(result.entryId);
  return { success: true, entry, imported: result.action === "created" };
  ```
- [ ] Drop the auto-classify block (`getTaxonomyNodes` + `setEntryClassifications`) — legacy heuristic with no consumers.
- [ ] Drop the inline `createCatalogAuditEvent({eventType: "catalog.{X}.submitted"})` — register emits the canonical audit event.
- [ ] Drop the legacy JSON-config fallback duplicate check — register's guard covers structured-FK; if a stale legacy row surfaces, the reconciliation process catches it.
- [ ] Keep the `getAuditLogger().log({action_type: "LIFECYCLE_TRANSITION"})` call — that's a separate cross-module audit (lifecycle log, not catalog-events).
- [ ] **Receipt sourcing:** since `aiTypes.catalog.register` is `receiptRequired: true`, each procedure either accepts a `governanceReceiptId` from the input schema (preferred — caller passes one), or mints a deterministic one (`<domain>-import-${domainRowId}-${Date.now()}`) for backward-compat with existing UI calls.
- [ ] Keep the existing pre-flight check that the domain row is in a state that allows catalog import (e.g., agents must be `deployable`). That's policy enforcement, not duplicate detection.
- [ ] **Cleanup:** the 5 import lines for write helpers (`createCatalogEntry`, `setEntryClassifications`, `createCatalogAuditEvent`, `getTaxonomyNodes`) become unused in 4 of the 5 procedures (some routers use them in OTHER mutations). Remove only the unused ones.
- [ ] **Acceptance:** the 2 contract tests pass (`agents router has importToCatalog procedure` / `models router has importToCatalog`); `tsc --noEmit` clean; CI 5/5 green; new register-driven flow exercised through any existing integration test that hits an importToCatalog mutation.
- [ ] **Estimate:** 1 PR, ~250 LOC removed, ~150 LOC added.
- [ ] **Pause if:** any procedure has bespoke state-transition logic that doesn't fit register's "duplicate-guard → create-or-update → audit" canonical flow (e.g., domain-specific approval gates wired into the procedure body) — surface and decide whether to (a) extend register's input or (b) keep that procedure's body, only swapping the catalog-write call.

### 32.2 — Closure report

- [ ] Author `docs/evidence/provider-model-binding/PHASE_32_CLOSURE_REPORT.md` mirroring `PHASE_31_CLOSURE_REPORT.md`. Inventory: PR ledger; deprecation-marker disposition (the `@deprecated Plan v3 Phase 47` JSDoc tags can stay as steering signals or be removed since the bodies now use the canonical path); lessons.
- [ ] Update memory: `project_phase_32_authority.md` → CLOSED; `project_pmb_phase_32_complete.md` created with PR ledger + carry-forward lessons; `MEMORY.md` index update.
- [ ] **Acceptance:** the 5 procedures all use `gatewayCall(register)`; CI 5/5 green.
- [ ] **Estimate:** 1 PR, ~200 LOC docs.

---

## 4. Decision matrix

Cap: **zero new TEMPORARY_EXCEPTION_WITH_DEADLINE entries.**

| # | Item | Decision | Sub-phase | Risk |
|---|---|---|---|---|
| 1 | Procedure-by-procedure or bulk? | **Bulk** (single PR) — same shape applied 5 times | 32.1 | Low — same shape across all 5; isolating into 5 PRs would burn review cycles on near-identical diffs |
| 2 | Auto-classification heuristic | **Drop** — no consumers; admins re-classify via the dedicated UI | 32.1 | Low |
| 3 | Custom audit event types | **Drop** — register emits the canonical event; zero downstream consumers filter on the legacy types | 32.1 | Low |
| 4 | Legacy JSON-config duplicate fallback | **Drop** — modern entries always have structured FK; reconciliation catches stale rows | 32.1 | Low |
| 5 | Return shape | **Preserve** — translate register's `{entryId, action, ...}` back to `{success, entry, imported}` via post-fetch | 32.1 | Low |
| 6 | Receipt sourcing | **Accept from input OR mint deterministic** — backward-compatible with existing UI calls | 32.1 | Low |
| 7 | Phase-47 `@deprecated` JSDoc tags | **Decide in 32.2** — either remove (bodies now use canonical path) or keep (steering signal for any new caller copying the procedure as a template) | 32.2 | Low |
| 8 | PMT self-registration agents + sandbox-wf seed | **Out of scope** — different flow shapes; tracked separately | All | N/A |

---

## 5. Test strategy

### Per sub-phase

- **32.0 (this):** docs only; CI green sufficient.
- **32.1 (migration):** existing contract tests + integration tests are the regression gate. The 2 `*.contract.test.ts` assertions on procedure existence still pass. Running `npx vitest run tests/contracts/ tests/governance/ tests/integration/` locally before push catches anything else.
- **32.2 (closure):** docs only.

### Cross-cutting

- **CI fingerprint:** Phase 32 baseline is **5/5 green** at `073699b`.
- **No new tests required** — existing coverage exercises the migrated paths (the procedures are the same; only the implementation changed).
- **Tripwire:** the AI Types boundary lint (now strict mode after Phase 31.4) catches any regression where a procedure reverts to private `ai-types/db` imports.

---

## 6. Sizing

| Sub-phase | PRs | LOC code | LOC docs |
|---|---|---|---|
| 32.0 (this) | 1 | — | ~200 |
| 32.1 (migration) | 1 | -100 net (~250 removed, ~150 added) | ~10 |
| 32.2 (closure report) | 1 | — | ~200 |
| **Total** | **3** | **-100 net** | **~410** |

Smallest PMB phase to date — the audit confirmed behavior preservation is mechanical.

---

## 7. CI fingerprint expectation

Phase 32 baseline is **5/5 green** as of `073699b` (post-Phase-31.5 close-out). No matrix-shape changes expected.

---

## 8. Authority and pause conditions

**Authority:** full autonomous commit/push/merge for any PR scoped inside this plan, granted 2026-05-07 (Option A from end-of-Phase-31 framings).

**Pause and surface for sign-off if:**

1. Any procedure requires a *new* TEMPORARY_EXCEPTION_WITH_DEADLINE (cap: 0).
2. A procedure has bespoke state-transition logic that doesn't fit register's canonical flow — surface and decide.
3. The §32.1 PR breaks an existing test that's not trivially adjustable — pause; behavior preservation is the gate.
4. Pre-existing red CI on a sub-phase PR not on the known-flaky-shard list.
