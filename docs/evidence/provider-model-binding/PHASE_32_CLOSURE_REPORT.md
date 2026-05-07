# Phase 32 — Closure Report

**Captured:** 2026-05-07 against `main@51c851c` (post-Phase-32.1 merge).
**Branch (this doc):** `docs/pmb-phase-32-2-closure-report`.
**Owner:** Planner + Governance roles per AGENTS.md.

---

## TL;DR

Phase 32 closes the Phase 31.3b carry-forward — the 5 `<domain>.importToCatalog` tRPC mutations now delegate to `aiTypes.catalog.register` through the platform gateway instead of writing the catalog directly. The Phase-25 duplicate guard, Phase-39 `aiTypes.catalog.registered` event, and canonical `catalog.register.{created,updated}` audit chain all run on import. The legacy `catalog.{agent,bot,model,llm,provider}.submitted` audit event types and the auto-classify-first-axis heuristic are dropped (zero downstream consumers, zero test assertions — confirmed by §32.0 audit).

3 PRs total. Smallest PMB phase to date. **Zero new TEMPORARY_EXCEPTION_WITH_DEADLINEs.** CI fingerprint stayed at 5/5 green throughout.

This PR also updates the `@deprecated Plan v3 Phase 47` JSDoc tags on the 5 procedures: the old text said "bypasses aiTypes.catalog.register" which is no longer accurate post-32.1. New text reflects the procedures' role as backward-compat thin wrappers around the canonical gateway action.

---

## What shipped — PR ledger

| Sub-phase | PR | Merge SHA | Title |
|---|---|---|---|
| 32.0 | [#265](https://github.com/RachEma-ux/MyNewAp1Claude/pull/265) | `4b68833` | Execution plan freeze (Option A — importToCatalog gateway migration) |
| **32.1** | [#266](https://github.com/RachEma-ux/MyNewAp1Claude/pull/266) | `51c851c` | Migrate 5 importToCatalog procedures to `gatewayCall(register)` |
| 32.2 | (this PR) | (TBD) | Closure report + JSDoc steering-text refresh |

**Total: 3 PRs** — exactly as planned.

---

## What changed in the 5 importToCatalog procedures

Before Phase 32 — direct table writes:

```ts
// Find existing entry by FK or by config JSON fallback → return early if exists
// createCatalogEntry({ name, displayName, description, ..., createdBy: ctx.user.id })
// try { setEntryClassifications(entry.id, [first-axis-node]) } catch warn
// createCatalogAuditEvent({ eventType: "catalog.{X}.submitted", payload: { deprecated: true, ... } })
// getAuditLogger().log({ action_type: "LIFECYCLE_TRANSITION" })
// return { success, entry, imported: true }
```

After Phase 32 — delegation through the canonical gateway action:

```ts
// FK pre-flight check → return { imported: false } if exists (preserves idempotency)
// gatewayCall("aiTypes.catalog.register", { entryType, sourceType, sourceId, fields, registeredBy, sourceModule })
// const entry = await getCatalogEntryById(result.entryId)
// getAuditLogger().log({ action_type: "LIFECYCLE_TRANSITION" })  // unchanged
// return { success, entry, imported: result.action === "created" }
```

Net effect:

| Surface | Before | After |
|---|---|---|
| Catalog write | `createCatalogEntry` direct table insert | `gatewayCall("aiTypes.catalog.register", ...)` — runs duplicate guard, mints receipt, emits `aiTypes.catalog.registered` |
| Audit event | Custom `catalog.{X}.submitted` per procedure | Canonical `catalog.register.created` from register's `emitRegisterAudit` |
| Auto-classification | `setEntryClassifications(entry.id, [first-axis])` heuristic | Dropped — admins re-classify via the dedicated taxonomy UI |
| Duplicate detection | Structured-FK + JSON-config fallback (legacy) | Structured-FK pre-flight check (legacy fallback dropped — modern entries always have structured FK) |
| Lifecycle audit | `getAuditLogger().log({action_type: "LIFECYCLE_TRANSITION"})` | **Unchanged** — separate cross-module log |
| Return shape | `{success, entry, imported}` | **Unchanged** — `imported = (action === "created")` |
| Phase-47 deprecation tag + warning | "bypasses aiTypes.catalog.register" | "thin wrapper around aiTypes.catalog.register" — refreshed in this PR |

Files touched in §32.1: `server/routers/agents.ts`, `server/routers/bots.ts`, `server/routers/llm.ts`, `server/routers/models.ts`, `server/providers/router.ts`. Net **−53 LOC**.

---

## §32.0 pre-flight audit findings

The plan-freeze PR (#265) ran a structured pre-flight audit on the 5 procedures' behavior-preservation surfaces. Results:

| Surface | Audit method | Finding |
|---|---|---|
| Downstream consumers of legacy `catalog.{X}.submitted` events | `grep -rn` across `server/`, `client/`, `tests/`, `shared/` | **Zero consumers.** Only the 5 emitting sites match. Events are forensic-only (written to `catalog_audit_events`, never read with shape constraints). |
| Test assertions on legacy event shapes | `grep -rn "catalog\..*\.submitted"` in `tests/` | **Zero assertions.** The 2 contract tests that mention `importToCatalog` assert procedure existence (still pass post-migration). |
| Auto-classify-first-axis consumers | `grep -rn "axisNodes\[0\]"` + manual review | **Zero consumers.** Heuristic was internal convenience; admins re-classify through the dedicated taxonomy UI. |
| Return-shape callers | UI search for `importToCatalog.mutate` + result shape | UI branches on `imported: true|false` for "imported" vs "already in catalog" toast. **Preserved** via the FK pre-flight + `imported = (action === "created")` mapping. |

Behavior preservation was therefore mechanical, not architectural. No new TEMPORARY_EXCEPTIONs needed.

---

## Decision matrix outcomes (vs. plan §4)

| # | Plan decision | Outcome | Notes |
|---|---|---|---|
| 1 | Bulk single-PR migration | **Locked** | All 5 in #266; same shape × 5 = consistent diff. |
| 2 | Drop auto-classification heuristic | **Locked** | No consumers; admins re-classify through the dedicated UI. |
| 3 | Drop custom audit event types | **Locked** | Zero downstream filters; register's canonical event replaces them. |
| 4 | Drop legacy JSON-config duplicate-fallback | **Locked** | Modern entries always have structured FK; reconciliation catches stale rows. |
| 5 | Preserve `{success, entry, imported}` return shape | **Locked** | FK pre-flight returns `imported: false` for existing entries; register's `action: "created" | "updated"` maps to `imported: (action === "created")`. |
| 6 | Receipt sourcing: deterministic per-procedure | **Locked** | `<domain>-import-to-catalog-${rowId}-${userId}-${Date.now()}` per call. |
| 7 | Phase-47 `@deprecated` tag disposition | **Refresh** — keep tag, update text | Old text said "bypasses register" which is no longer accurate post-32.1. New text describes the procedures as backward-compat thin wrappers; new callers should hit the gateway action directly. The `warnLegacyImportToCatalog` first-call console.warn stays unchanged (still steers callers correctly). |
| 8 | PMT self-registration agents + sandbox-wf seed | **Out of scope** — confirmed | Separate flow shapes; tracked for a future phase if/when needed. |

**Cap: 0 / 0 allowed new exceptions.** Used: 0.

---

## Lessons (carry-forward for Phase 33+)

1. **Pre-flight audit unblocks bold decisions.** The §32.0 audit confirmed three behavior-preservation surfaces (event shape, test assertions, return shape callers) had zero risky consumers — that finding turned the migration from "5 procedures × N PRs of careful per-callsite work" into "5 nearly-identical procedure bodies × 1 PR." Future phases that look intimidating because of "behavior preservation" should run a structured audit FIRST; the audit either confirms the migration is mechanical or reveals the real risk surface that warrants a longer plan.

2. **Idempotency invariants matter as much as event shapes.** The legacy procedures' "no-op on duplicate" semantics (return existing entry without touching it) differ from register's "update on duplicate" semantics. Without the FK pre-flight check, idempotent UI calls would silently overwrite catalog entry fields. This wasn't caught by the §32.0 audit because no consumer SAID "I rely on no-op on duplicate" — but UI flows often assume idempotency. Future migrations should ask "is the legacy semantic for the duplicate path different?" before assuming behavior preservation is just about events.

3. **Gateway wrappers are a legitimate architectural shape.** The 5 importToCatalog procedures could have been deleted entirely, forcing UI callers to hit `aiTypes.catalog.register` directly. Keeping them as thin wrappers (tRPC procedure → gatewayCall) preserves the existing UI integration without forcing a frontend refactor. The `@deprecated` tag steers new callers correctly without breaking old ones. This is an OK long-term shape; the cleanup decision (remove the wrappers entirely) belongs to a future frontend-Module-Gateway-migration phase, not Phase 32.

4. **JSDoc text rots silently.** The pre-32.1 `@deprecated Plan v3 Phase 47 — bypasses aiTypes.catalog.register` text was accurate when it landed. After 32.1 it was actively misleading — bodies now USE register, not bypass it. Future migrations that touch deprecated surfaces should sweep the JSDoc text in the same PR; deferring the text refresh to a later closure phase (as I did here) is OK only if you remember to do it. A linter rule that flags `@deprecated` blocks containing specific phrases ("bypasses", "do not use") could catch drift.

5. **Receipt minting at the gateway boundary is fine for backward-compat wrappers.** Register's `receiptRequired: true` descriptor needs a `governanceReceiptId` on every call. The deterministic ID pattern (`<domain>-import-to-catalog-${rowId}-${userId}-${Date.now()}`) satisfies the receipt invariant without forcing existing UI callers to start passing receipts. The tRPC layer's `governedProcedure` already mints a procedure-level receipt; the gateway's receipt is a separate identifier for the cross-module hop. Both are correct; both are auditable. Future cross-module migrations from `governedProcedure` mutations can follow this same shape.

---

## CI fingerprint

| Phase 32 PR | Status |
|---|---|
| #265 (32.0 docs) | 5/5 ✅ first try |
| #266 (32.1 migration) | 5/5 ✅ first try |
| (this PR — closure report) | (expected 5/5) |

**Phase 32 baseline: 5/5 green throughout.** No regressions; no flaky reruns.

---

## Memory updates after this PR

- `MEMORY.md` — Phase 32 entry flips to CLOSED; Phase 32 authority entry stays (closed-out form, mirrors Phase 28/29/30/31 pattern).
- `project_phase_32_authority.md` — flipped to CLOSED with PR ledger.
- `project_pmb_phase_32_complete.md` — created with PR ledger + the 5 carry-forward lessons above.
- `project_rac_progress.md` — updated to point at `main@<this-PR-merge-sha>` with Phase 32 marked CLOSED.
