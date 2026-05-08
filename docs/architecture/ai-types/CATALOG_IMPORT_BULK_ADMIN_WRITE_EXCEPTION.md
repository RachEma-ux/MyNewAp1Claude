# ADR: `catalog-import-bulk-admin-write` permanent architectural exception

**Status:** Accepted (Phase 39.1).
**Captured:** 2026-05-08.
**Related:** `catalog-manage-bespoke-publish-machinery` ADR (§36) — same shape.
**Tracking:** Plan v3 architectural-exception register (second permanent entry).

---

## Context

`server/catalog-import/router.ts` provides the operator-facing **bulk catalog import** flow: operators upload CSV/JSON/YAML files; the file is parsed; rows are previewed (with dedup against existing catalog entries); after operator approval, rows are written via `bulkCreate`. For `model` and `llm` types, the write goes through the domain-projection path (`createDomainModel` / `createDomainLlm` → catalog projection). For `provider`, `agent`, and `bot` types, the write is direct via `createCatalogEntry` (intra-platform write through `ai-types/public-api`).

Phase 38's audit (while looking for `getCatalogEntryById(result.entryId)` round-trip victims) surfaced `server/catalog-import/router.ts:409` as an unmigrated direct caller. Phase 39 audited the call site and concluded the migration is **not behavior-preserving** — catalog-import is structurally distinct from the §32, §34, and §37 callers that were migrated to gateway-call register.

## Decision

**catalog-import's direct `createCatalogEntry` call at `router.ts:409` is a permanent architectural exception.** Don't migrate it to `gatewayCall("aiTypes.catalog.register", ...)` in any future phase.

This is the **second permanent exception** alongside `catalog-manage-bespoke-publish-machinery` (§36). Both share the shape: bespoke caller-side workflow logic that doesn't fold into the canonical without anti-pattern toggle flags.

## Why migration is not behavior-preserving

### Layer 1 — No source-of-record linkage by data-model design

The `createCatalogEntry({...})` call at `router.ts:409` does **not** include `sourceType` or `sourceId`. catalog-import's provider/agent/bot entries are admin-defined: an operator uploads a file and decides what entries to create; these entries don't have a corresponding domain-table row to point at.

The canonical `aiTypes.catalog.register` action requires either:

- `sourceType` + numeric `sourceId` (Phase 25 contract — domain-backed entries)
- `sourceType` + string `sourceName` (Phase 37 contract — self-registered system agents)

catalog-import has neither. To migrate, we'd need to either:

- Reuse §37's `sourceName` path with `sourceName: row.name` and a synthetic `sourceType` like `"admin_imported"`. This conflates self-registered system agents (which have an explicit identity, e.g., `AGENT_CATALOG_ID = "ps.agent.context_translator"`) with admin-uploaded entries (which only have an operator-defined name). Different concepts, same field — semantic drift.
- Add a third register input shape: "admin-imported, no source linkage." This weakens Phase 25's invariant beyond the bounded shape from §37 (which was already a relaxation). Register becomes a multi-mode action with three branches; the input contract loses its current shape clarity.

Both paths add canonical surface area to accommodate a caller that doesn't fundamentally need the canonical's identity-tracking semantics.

### Layer 2 — Dedup at preview time, not write time

catalog-import has its own dedup service (`server/catalog-import/dedup-service.ts`):

```ts
const dedupedRows = await checkDuplicates(rawRows);
// ...
await updateSessionStatus(session.id, "previewing", summary);
```

The operator sees duplicates **in the preview** before approving the bulk write. By the time `createCatalogEntry` runs, the operator has consciously decided what to import (including any "overwrite existing" decisions made consciously at the preview stage).

The canonical `aiTypes.catalog.register` action's duplicate guard checks at write time:

- `would_duplicate_legacy` for legacy entries → throws `RegisterDuplicateError`
- `modern_row_update_path` for modern rows at the same `(sourceType, sourceId)` → silently updates

Neither matches catalog-import's intent. The operator already made the dedup decision upstream; the write site shouldn't re-check.

### Layer 3 — Operator-driven bulk semantics

catalog-import is a CSV/JSON/YAML upload flow. Operators expect:

- **Predictable behavior** — "what I uploaded is what gets created" (with the preview as the rejection layer).
- **No silent rejections at write time** — write-time errors are surfaced row-by-row in `bulkCreate`'s try/catch, but they're *meant* to be operational failures (DB errors, validation errors), not "this row is a duplicate" rejections that the preview already handled.
- **Atomic-ish bulk writes** — one upload = one operation; per-row success/failure is reported back, but the operator's mental model is "I uploaded N rows; here's what happened."

Adding canonical's duplicate guard at write time changes the operator-visible failure surface. Even if behavior is technically preserved (per-row errors recorded), the **failure mode shifts from "preview catches it" to "preview catches it OR write rejects it"** — UX regression.

## Alternatives considered (rejected)

### Alt 1 — Reuse §37 sourceName path with `sourceType: "admin_imported"`

Rejected. Semantic conflation (admin-uploaded ≠ self-registered system agent); adds non-null `sourceType` to entries that currently have null `sourceType` (downstream filter break risk for any code that checks `sourceType IS NULL` to identify admin-created entries); operator-visible UX regression per Layer 3.

### Alt 2 — Add a third "admin-imported, no source linkage" register path

Rejected. Weakens Phase 25 invariant beyond §37's bounded shape ("exactly one of sourceId or sourceName"). Register becomes a three-way dispatcher; future readers have to mentally branch on three input shapes; over-engineers a canonical action to fit a caller whose semantics fundamentally differ.

### Alt 3 — Migrate model/llm callers (which DO go through domain projection) to `gatewayCall`

Rejected — out of scope. The model/llm path goes through `createDomainModel` / `createDomainLlm`, which in turn use `linkCatalogToDomain` to project into the catalog. Those projection functions are intra-platform writes through `ai-types/public-api` (boundary-lint compliant). They don't bypass the canonical's identity model — they just write through a different code path. If a future phase wants to gateway-call those, it's a separate scope from `catalog-import-bulk-admin-write`.

## Consequences

### Positive

- **Plan v3's canonical action contracts stay clean.** Register's input shape is "exactly one of sourceId or sourceName"; not weakened to a three-way dispatcher.
- **catalog-import's operator-visible behavior is preserved.** Predictable bulk-write semantics; preview is the rejection layer.
- **The architectural-exception register is honest.** Two permanent exceptions reflect real bespoke caller-side workflow logic, not migration debt.

### Neutral

- The architectural-exception register grows from 1 permanent to 2 permanent. Plan v3 architectural finalist state preserved (still 0 open exceptions; permanent count is informational, not a debt indicator).

### Negative

- **Future readers of `server/catalog-import/router.ts:409`** may not realize the direct `createCatalogEntry` call is intentional. Mitigated by:
  - This ADR
  - Inline comment at the call site cross-referencing this ADR
  - `scripts/governance/check-invariants.ts` exemption note

## Convention for future direct-caller audits

When a future phase audits for unmigrated direct `createCatalogEntry` callers, the **decision tree** is:

1. Does the caller have `sourceType + sourceId` (numeric) or `sourceName` (string)? → Migrate via existing canonical paths.
2. Does the caller have bespoke pre-write logic that conflicts with canonical's duplicate guard or post-write side effects? → Pause-and-surface; document as architectural exception.
3. Does the caller fit a NEW pattern that should justify extending the canonical (like §37's sourceName extension for self-registered agents)? → Plan v3 architectural change with its own ADR.

The two permanent exceptions both fall into bucket 2:

- `catalog-manage-bespoke-publish-machinery` — bespoke pre-publish gates (Triple Validation, transient `publishing` status, snapshot extras, separate audit channel)
- `catalog-import-bulk-admin-write` — bespoke pre-write dedup at preview time, no source linkage by design, operator-driven bulk semantics

Both are caller-side workflow logic that doesn't fold into canonical without anti-pattern toggle flags.

## Don't file a phantom future-phase

Future phases should NOT propose a "Phase Y — migrate catalog-import to gateway-call register" task. This ADR locks the decision: catalog-import stays on direct `createCatalogEntry`. If a future architectural change in Plan v3 OR Plan v4+ wants to revisit, the change must explicitly cite this ADR and overturn it with new rationale.

---

## Cross-references

- `docs/architecture/provider-model-binding/PHASE_39_EXECUTION_PLAN.md` — implementation plan.
- `docs/evidence/provider-model-binding/PHASE_39_CLOSURE_REPORT.md` — phase closure (when authored in §39.2).
- `docs/architecture/ai-types/PMT_NAME_BASED_IDENTITY.md` — §37 ADR for the sourceName path that this ADR explicitly does NOT generalize to.
- `server/catalog-import/router.ts:409` — the direct caller this ADR exempts.
- `server/routers/catalog-manage.ts` — first permanent exception (`catalog-manage-bespoke-publish-machinery`).
