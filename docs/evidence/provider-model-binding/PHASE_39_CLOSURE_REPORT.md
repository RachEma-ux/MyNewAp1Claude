# Phase 39 — Closure Report

**Captured:** 2026-05-08 against `main@7f0d91e` (post-Phase-39.1 merge).
**Branch (this doc):** `docs/pmb-phase-39-2-closure-report`.
**Owner:** Planner + Governance roles per AGENTS.md.

---

## TL;DR

Phase 39 was the **second post-finalist phase** and the **first phase to surface a new permanent architectural exception** (vs. closing previously surfaced exceptions like §36 and §37, or pause-and-surfacing deferred ones like §34 and §35).

The phase audited `server/catalog-import/router.ts:409` — an unmigrated direct `createCatalogEntry` caller surfaced during §38's round-trip audit — and concluded the migration is not behavior-preserving. **Documented as `catalog-import-bulk-admin-write` permanent exception** (second permanent, mirroring `catalog-manage-bespoke-publish-machinery` from §36).

**Plan v3 architectural finalist state preserved:** 0 open architectural exceptions; 2 permanent (informational, not debt).

3 PRs total. **Zero new TEMPORARY_EXCEPTION_WITH_DEADLINEs.** CI fingerprint stayed at 5/5 green throughout. Net code change: +10 LOC (comments only); +130 LOC ADR; +18 LOC governance comment.

---

## PR ledger

| Sub-phase | PR | Merge SHA | Title |
|---|---|---|---|
| 39.0 | [#290](https://github.com/RachEma-ux/MyNewAp1Claude/pull/290) | `a0c046e` | Plan freeze + audit (3-options analysis) |
| 39.1 | [#291](https://github.com/RachEma-ux/MyNewAp1Claude/pull/291) | `7f0d91e` | ADR `CATALOG_IMPORT_BULK_ADMIN_WRITE_EXCEPTION.md` + inline comment + governance check note |
| 39.2 | (this PR) | (TBD) | Closure report |

**Total: 3 PRs.** Same shape as §35 (pause-and-surface) and earlier mostly-docs phases.

---

## What shipped

### §39.0 — Plan freeze + audit

3-options analysis on `server/catalog-import/router.ts:409`:

- **(a)** Migrate via §37 sourceName path with `sourceType: "admin_imported"` → rejected (semantic conflation; downstream filter break risk; UX regression)
- **(b)** Add a third register input shape → rejected (weakens Phase 25 invariant beyond §37's bounded shape)
- **(c)** Document as permanent exception → picked (mirrors §36 `catalog-manage-bespoke-publish-machinery`)

### §39.1 — ADR + inline comment + governance check note

- **ADR `CATALOG_IMPORT_BULK_ADMIN_WRITE_EXCEPTION.md`** documenting:
  - Three layers of structural distinction (no source linkage, dedup at preview time, operator-driven bulk semantics)
  - Three options considered + rejection rationale
  - Future direct-caller audit decision tree (the ADR's most reusable artifact)
  - "Don't file a phantom future-phase" admonition
- **Inline comment at `server/catalog-import/router.ts:409`** cross-referencing the ADR
- **`scripts/governance/check-invariants.ts`** updated with explicit comment listing both permanent exceptions

### Architectural exception register after §39

- ✅ `publish-flip-to-published-mismatch` — CLOSED §36
- ✅ PMT self-registration identity mismatch — CLOSED §37
- 🔒 `catalog-manage-bespoke-publish-machinery` — PERMANENT (§36)
- 🔒 **`catalog-import-bulk-admin-write` — PERMANENT (§39, this phase)** ← new

**0 open exceptions; 2 permanent.** Plan v3 architectural finalist state preserved (permanent count is informational, not debt).

### Decision matrix outcomes (vs. plan §4)

| # | Plan decision | Outcome | Notes |
|---|---|---|---|
| 1 | Migrate vs document permanent exception | **Locked — permanent exception** | Option (c) |
| 2 | Inline comment placement | **Locked — at the createCatalogEntry call site** | with ADR cross-reference |
| 3 | governance/check-invariants.ts cross-reference | **Locked — explicit exemption note** | Lists both permanent exceptions |
| 4 | Update §37 ADR? | **Locked — no** | New ADR gets its own file |
| 5 | Other future direct callers | **Locked — out of scope** | Audit tree in new ADR for future phases |

**Cap: 0 / 0 allowed new exceptions.** Used: 0 (architectural exception is documented, not a TEMPORARY_EXCEPTION_WITH_DEADLINE).

---

## Lessons (carry-forward for Phase 40+)

1. **Audits during one phase surface candidates for the next phase.** §38's round-trip audit was looking for `getCatalogEntryById(result.entryId)` callers. While doing that audit, surfaced an unmigrated direct `createCatalogEntry` caller (catalog-import) that wasn't on §32/§34/§37's radar. **Convention:** audit phases should produce a "surfaced candidates" list as a side artifact; future phases pick from that list when no obvious primary carry-forward exists. This phase was the surfaced-candidate harvest from §38.

2. **The "structural distinction audit" is the right tool when a candidate caller surfaces.** Phase 39's pre-flight didn't try to migrate first and pause-and-surface on failure (§34/§35 pattern). It looked at the caller's data model, pre-write logic, and operator-visible semantics first — and concluded the migration is structurally not behavior-preserving. Pause-and-surface protocol still works mid-execution if the audit misses something, but **structural-distinction-first audits cost less time** when the caller is genuinely architecturally distinct.

3. **Permanent architectural exceptions are not failure states.** Two permanent exceptions (catalog-manage, catalog-import) reflect real bespoke caller-side workflow logic that doesn't fold into the canonical without anti-pattern toggle flags. They're not migration debt; they're architectural decisions documented explicitly. Future readers grep for "permanent" and find: bespoke caller-side workflow logic, alternatives considered, and explicit "don't migrate" admonitions. **Convention:** the architectural-exception register's permanent count is informational metadata, not a bug count.

4. **The future direct-caller audit decision tree is reusable infrastructure.** The §39 ADR's decision tree (does the caller have sourceType+sourceId/sourceName? bespoke pre-write logic? new pattern that justifies extending canonical?) is a reusable artifact for any future phase that surfaces a new direct `createCatalogEntry` caller. Future phases shouldn't re-derive the analysis; they should walk the tree. The tree itself is a lesson worth preserving.

5. **Sub-phase shape can match phase substance.** Phase 39 shipped 3 PRs (plan, doc, closure) — no implementation sub-phase, because the "implementation" was just adding documentation + comments. This is the **smallest viable phase shape** for "decide and document" architectural decisions. Compare with §36 (4 PRs: plan + ADR / canonical change / migration / closure) which had concrete implementation. Future phases that are decision-only can collapse to 3 PRs without losing rigor.

---

## CI fingerprint

| Phase 39 PR | Status |
|---|---|
| #290 (39.0 plan + audit) | 5/5 ✅ first try |
| #291 (39.1 ADR + comment + governance note) | 5/5 ✅ first try |
| (this PR — closure report) | (expected 5/5) |

**Phase 39 baseline: 5/5 green throughout.** No regressions; no flaky reruns.

---

## Memory updates after this PR

- `MEMORY.md` — Phase 39 entry flips to CLOSED; architectural-exception state updated to show 2 permanent.
- `project_phase_39_authority.md` — flipped to CLOSED with PR ledger + permanent exception note.
- `project_pmb_phase_39_complete.md` — created with PR ledger + the 5 carry-forward lessons above.
- `project_rac_progress.md` — updated to point at `main@<this-PR-merge-sha>` with Phase 39 marked CLOSED.
