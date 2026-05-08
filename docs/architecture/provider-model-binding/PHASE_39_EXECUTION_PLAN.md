# Phase 39 — Execution Plan

**Captured:** 2026-05-08 against `main@71e9a3d` (post-Phase-38 closure).
**Branch (this doc):** `docs/pmb-phase-39-0-execution-plan`.
**Owner:** Planner role per AGENTS.md; full autonomous-execution authority granted by the 2026-05-07 standing instruction.

---

## 1. Why Phase 39 exists

§38's audit while looking for round-trip victims surfaced an **unmigrated direct `createCatalogEntry` caller** that wasn't on §32, §34, or §37's radar:

```
server/catalog-import/router.ts:409
```

The `aiTypes-public-api-boundary` lint flagged this as compliant (the import is from `../ai-types/public-api`), but it bypasses the canonical write path that §32/§34/§37 migrations established. Phase 39 audits this caller and decides: extend register, or document as a second permanent architectural exception (mirroring `catalog-manage-bespoke-publish-machinery` from §36).

Phase 39 is the **second post-finalist phase** — the architectural-exception register may grow by one permanent entry, but the two CLOSED named exceptions (publish-flip-to-published-mismatch, PMT identity mismatch) stay closed. Plan v3 architectural finalist state preserved.

---

## 2. Pre-flight audit findings

### catalog-import call site

`server/catalog-import/router.ts:409` (within the `bulkCreate` mutation):

```ts
} else {
  // Provider, agent, bot — direct catalog write (existing behavior)
  const catalogEntry = await createCatalogEntry({
    name: row.name,
    displayName,
    description: row.description,
    entryType: row.type,
    scope,
    status: "draft",
    origin,
    reviewState: "needs_review",
    providerId: resolvedProviderId,
    config: finalConfig,
    tags: [row.source, ...fileTags],
    category,
    subCategory,
    capabilities,
    createdBy: ctx.user?.id ?? 1,
  });
  catalogEntryId = catalogEntry.id;
}
```

### catalog-import is structurally distinct from §32/§34/§37 callers

Three layers of difference:

#### Layer 1 — No source-of-record linkage

The createCatalogEntry call **does not include `sourceType` or `sourceId`**. catalog-import's `provider`/`agent`/`bot` entries are admin-defined (uploaded from CSV/JSON/YAML) — they don't have a domain-table row to link to. By data-model design, these are "admin-created entries with no source linkage."

§37 added the `sourceName` path for self-registered system agents, but those have an explicit identity (`AGENT_CATALOG_ID = "ps.agent.context_translator"`). catalog-import entries have only their `row.name` (which is the operator-defined name from the upload). Treating `row.name` as `sourceName` would conflate semantically different concepts.

#### Layer 2 — Dedup at preview time, not write time

catalog-import has its own dedup service:

```ts
// server/catalog-import/dedup-service.ts
const dedupedRows = await checkDuplicates(rawRows);
// ...
await updateSessionStatus(session.id, "previewing", summary);
```

The operator sees duplicates in the **preview** before approving the bulk write. By the time `createCatalogEntry` runs, the operator has consciously decided what to import (including any "overwrite existing" decisions).

The canonical `aiTypes.catalog.register` action's duplicate guard checks at write time — it would either:
- Reject writes the operator already approved (`would_duplicate_legacy` for legacy entries)
- Treat them as updates (`modern_row_update_path` — closer to operator intent, but still a behavior change vs. current "always insert new")

Either way: behavior change at the operator-visible layer.

#### Layer 3 — Bulk operator-driven write

catalog-import is a CSV/JSON/YAML upload flow. Operators expect:
- Predictable behavior: "what I uploaded is what gets created"
- No silent rejections at write time (preview is the rejection layer)
- Atomic-ish bulk writes (one upload = one operation)

The canonical's `RegisterDuplicateError` for `legacy_imported` rows would surface at write time as a per-row exception. catalog-import's bulkCreate wraps each row in try/catch (records failure but continues), so behavior preservation is technically possible — but the **operator-visible failure modes change**: instead of "all rows succeed because dedup was at preview" they become "some rows may fail at write time with `would_duplicate_legacy`." That's a UX regression.

### Three options on the table

| Option | Description | Pros | Cons |
|---|---|---|---|
| **(a)** Migrate via `sourceType: "admin_imported"` + `sourceName: row.name` | Treat catalog-import entries as a flavor of self-registered with admin provenance; reuse §37's name-path | Single canonical write path; consistent with §37 pattern | Conflates self-registered system agents with admin-uploaded entries; adds non-null `sourceType` to entries that currently have null `sourceType` (downstream filter break risk); operator-visible failure modes change at write time |
| **(b)** Add a third register path: "admin-imported, no source linkage" | Yet another canonical input shape | Stays admin-data-model accurate | Weakens Phase 25 invariant further (now "exactly one of sourceId or sourceName, OR neither for admin imports" — no longer bounded); over-engineers register; `register` becomes a multi-mode action with three branches |
| **(c)** Document as second permanent architectural exception (`catalog-import-bulk-admin-write`) | Same shape as catalog-manage's permanent exception (§36) | Keeps register's contract clean; respects catalog-import's bespoke pre-write dedup; preserves operator-visible behavior | Architectural-exception register grows by 1 permanent entry |

**Decision: (c).** catalog-import is structurally similar to catalog-manage — bespoke caller-side workflow logic (dedup at preview time, no source linkage by design, operator-driven bulk write semantics) that doesn't fold into canonical without behavior change. Document as permanent exception. Plan v3 finalist state grows from 1 permanent → 2 permanent, but remains a clean shape.

---

## 3. Sub-phase decomposition

### 39.0 — Plan freeze + audit (this PR)

- [ ] Land `PHASE_39_EXECUTION_PLAN.md` (this doc).
- [ ] Memory: create `project_phase_39_authority.md`; `MEMORY.md` index update.
- [ ] **Acceptance:** doc lands; CI 5/5 green.

### 39.1 — Document `catalog-import-bulk-admin-write` permanent exception

Single PR. Two coupled changes:

- [ ] **Author** `docs/architecture/ai-types/CATALOG_IMPORT_BULK_ADMIN_WRITE_EXCEPTION.md` documenting the permanent exception with same shape as `catalog-manage-bespoke-publish-machinery` (§36 ADR pattern):
  - Why catalog-import bypasses register
  - Three options considered + rejection rationale
  - Operator-visible failure mode preservation
  - "Don't file a phantom Phase Y to migrate this" admonition
- [ ] **Inline comment** at `server/catalog-import/router.ts:409` cross-referencing the doc:
  ```ts
  // Provider, agent, bot — direct catalog write. catalog-import is a
  // permanent architectural exception (`catalog-import-bulk-admin-write`)
  // — bespoke pre-write dedup at preview time + no source-of-record
  // linkage by data-model design. See ADR
  // `docs/architecture/ai-types/CATALOG_IMPORT_BULK_ADMIN_WRITE_EXCEPTION.md`.
  ```
- [ ] **Update `scripts/governance/check-invariants.ts`**: the existing "no createCatalogEntry in domain routers" rule should explicitly note that `server/catalog-import/router.ts` is a permitted exception (currently it's permitted by being outside the DOMAIN_ROUTERS list, but make the exemption explicit + cross-referenced).
- [ ] **Acceptance:** doc lands; inline comment + invariant-check note; `tsc --noEmit` clean; CI 5/5 green.
- [ ] **Estimate:** 1 PR, ~150 LOC docs + ~10 LOC code comments.

### 39.2 — Closure report

- [ ] Author `docs/evidence/provider-model-binding/PHASE_39_CLOSURE_REPORT.md`.
- [ ] Update memory: `project_phase_39_authority.md` → CLOSED; `project_pmb_phase_39_complete.md` created with PR ledger + carry-forward lessons; `MEMORY.md` index update; RAC-progress head SHA bump.
- [ ] **Acceptance:** all 3 PRs merged; CI fingerprint stable; architectural-exception register updated to show 2 permanent entries.
- [ ] **Estimate:** 1 PR, ~150 LOC docs.

---

## 4. Decision matrix

Cap: **zero new TEMPORARY_EXCEPTION_WITH_DEADLINE entries.**

| # | Item | Decision | Sub-phase | Risk |
|---|---|---|---|---|
| 1 | Migrate vs document permanent exception | **Permanent exception** (Option c) | 39.0 + 39.1 | Low |
| 2 | Inline comment placement | **At the createCatalogEntry call site** with ADR cross-reference | 39.1 | Low |
| 3 | governance/check-invariants.ts cross-reference | **Add explicit exemption note** | 39.1 | Low |
| 4 | Update §37 ADR? | **No** — §37 ADR is sealed; new ADR (`CATALOG_IMPORT_BULK_ADMIN_WRITE_EXCEPTION.md`) gets its own file | 39.1 | Low |
| 5 | Other future direct callers | **Out of scope** | — | N/A |

---

## 5. Test strategy

- **39.0:** docs only.
- **39.1:** docs + inline comment + invariant-check note. `tsc --noEmit` clean.
- **39.2:** docs only.

**CI fingerprint:** Phase 39 baseline is **5/5 green** at `71e9a3d`. No matrix-shape changes.

---

## 6. Sizing

| Sub-phase | PRs | LOC code | LOC docs |
|---|---|---|---|
| 39.0 (this) | 1 | — | ~250 |
| 39.1 (permanent exception doc + inline) | 1 | ~10 (comments) | ~150 ADR |
| 39.2 (closure) | 1 | — | ~150 |
| **Total** | **3** | **+10** | **~550** |

Smaller LOC change than recent phases — pure documentation phase, mirroring §35 (pause-and-surface, mostly docs).

---

## 7. CI fingerprint expectation

Phase 39 baseline is **5/5 green** as of `71e9a3d` (post-Phase-38 close-out). No changes expected.

---

## 8. Authority and pause conditions

**Authority:** full autonomous commit/push/merge for any PR scoped inside this plan. Phase 39 is the **sixth phase under the continuous-execution standing instruction** and the **second post-finalist phase**. Picked autonomously after Phase 38 closed at `71e9a3d`.

**Surface of my reasoning in the kickoff:** Per §38 lesson #1 ("pre-flight audits catch dead code that isn't"), audited the surfaced catalog-import direct caller and found three layers of structural distinction (no source linkage, dedup at preview time, operator-driven bulk semantics). Migration via the §37 sourceName path was an option but conflates semantics + risks operator-visible behavior change. Picked Option (c) — document as second permanent architectural exception (mirrors `catalog-manage-bespoke-publish-machinery` from §36).

**Pause and surface for sign-off if:**

1. catalog-import has hidden gateway-call paths beyond the bulkCreate mutation (audit suggests no).
2. The "Provider, agent, bot — direct catalog write" branch is hit from a non-operator-driven path (e.g., some automated import that does NOT go through the preview/dedup flow).
3. Pre-existing red CI on a sub-phase PR not on the known-flaky-shard list.
