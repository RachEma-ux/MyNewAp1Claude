# Phase 38 — Closure Report

**Captured:** 2026-05-08 against `main@3012ce1` (post-Phase-38.2 merge).
**Branch (this doc):** `docs/pmb-phase-38-3-closure-report`.
**Owner:** Planner + Governance roles per AGENTS.md.

---

## TL;DR

Phase 38 was the **first phase post-finalist** — the architectural-exception register reached steady state in §37 (one permanent exception, two CLOSED), so heuristic #1 (direct carry-forward of a surfaced exception) no longer drives the pick. The phase pivoted from "dead-code cleanup" (which turned out not to be pure dead code) to **round-trip elimination**: extending `RegisterCatalogEntryResult` with `entry: CatalogEntry` and bulk-migrating 8 callers to drop the post-register `getCatalogEntryById(result.entryId)` hop.

The phase shipped:

1. **Plan freeze** (§38.0) — pivot from dead-code cleanup to round-trip elimination after audit surfaced that the "dead branch" handled legacy data.
2. **Canonical extension** (§38.1) — `RegisterCatalogEntryResult.entry: CatalogEntry`, threaded through both create and update paths. Zero extra DB reads (canonical already had the entry on both paths).
3. **Bulk caller migration** (§38.2) — 8 callers across §32, §34, §37 dropped their post-register fetch and tightened gateway-call type params to use `RegisterCatalogEntryResult`.

4 PRs total. **Zero new TEMPORARY_EXCEPTION_WITH_DEADLINEs.** CI fingerprint stayed at 5/5 green throughout. Net code change: +13 LOC code (canonical extension) +43 LOC tests; bulk migration was nearly LOC-neutral but **saves 8 DB round-trips per registration flow**.

---

## PR ledger

| Sub-phase | PR | Merge SHA | Title |
|---|---|---|---|
| 38.0 | [#286](https://github.com/RachEma-ux/MyNewAp1Claude/pull/286) | `3a71b74` | Plan freeze (pivot to round-trip elimination) |
| 38.1 | [#287](https://github.com/RachEma-ux/MyNewAp1Claude/pull/287) | `03d3750` | Extend `RegisterCatalogEntryResult` with `entry` field; +3 contract tests |
| 38.2 | [#288](https://github.com/RachEma-ux/MyNewAp1Claude/pull/288) | `3012ce1` | Bulk-migrate 8 callers; tighten type params; re-export type via public-api |
| 38.3 | (this PR) | (TBD) | Closure report |

**Total: 4 PRs.** All sub-phases completed as planned.

---

## What shipped

### §38.0 — Plan freeze (the pivot itself was an audit finding)

The original §38.0 thinking was "dead-code cleanup of `export-catalog.ts:549` `if (catalog.status === "published")` branch" (per §36 closure's "future cleanup phase candidate" tag). Pre-flight re-audit surfaced that the branch handles legacy data where `status="published"` still exists in older rows — removing it would change behavior for legacy data. Pivoted to round-trip elimination, which has higher value (saves 8 DB reads per flow) and lower behavioral risk (additive contract change).

### §38.1 — Canonical extension

```ts
export interface RegisterCatalogEntryResult {
  entryId: number;
  action: "created" | "updated";
  legacyImportState: string | null;
  guardReason: string;
  /** Phase 38 — full row, populated on both create and update paths. */
  entry: CatalogEntry;
}
```

- **Update path:** thread `updated` (already fetched via `getCatalogEntryById` for `legacyImportState`) into `result.entry`. Promoted the previous loose `?.` access to a hard null-check.
- **Create path:** thread `created` (already returned by `createCatalogEntry`) into `result.entry`.
- **Tests:** 3 new contract tests in `register.test.ts` verifying `result.entry.id === result.entryId` on both paths + the new null-check on the update path.

**Backwards-compatible at the type level** (additive field). Existing callers that didn't read `result.entry` were unaffected.

### §38.2 — Bulk caller migration

8 files migrated:

```
server/routers/agents.ts
server/routers/bots.ts
server/routers/llm.ts
server/routers/models.ts
server/providers/router.ts
server/sandbox-wf/seed-orchestrator.ts
server/modules/pmt/context-translator-agent.ts
server/modules/pmt/idea-builder-agent.ts
```

Pattern per file:

- Drop `getCatalogEntryById` from imports (or leave if used elsewhere)
- Add `import type { RegisterCatalogEntryResult }` from public-api
- Tighten gateway-call type param: `{ entryId: number; action: "created" | "updated" }` → `RegisterCatalogEntryResult`
- Drop `const entry = await getCatalogEntryById(result.entryId)` line
- Drop the defensive null-check
- Use `result.entry` (or `const entry = result.entry`) downstream

Plus `server/ai-types/public-api.ts` re-exports `RegisterCatalogEntryInput` + `RegisterCatalogEntryResult` types so callers outside the ai-types module can import the tight result shape (boundary lint compliant).

### Decision matrix outcomes (vs. plan §4)

| # | Plan decision | Outcome | Notes |
|---|---|---|---|
| 1 | Round-trip elimination vs dead-code cleanup vs other | **Locked — round-trip** | Pivoted from dead-code after audit |
| 2 | Bulk-migrate vs per-file PRs for §38.2 | **Locked — bulk** | Same shape × 8; matches Phase 32 bulk pattern |
| 3 | `entry` field optional vs required | **Locked — required** | Both paths produce it; no extra reads |
| 4 | Test surface | **Locked — 3 contract tests** | Both paths + null-check assertion |
| 5 | dead-code branch removal | **Out of scope** | Handles legacy data, not pure dead code |
| 6 | catalog-manage direct callers | **Out of scope** | Permanent exception |

**Cap: 0 / 0 allowed new exceptions.** Used: 0.

---

## Architectural exception state after §38

**Unchanged from §37.** Phase 38 is a refactor, not an architectural change:

- ✅ `publish-flip-to-published-mismatch` — CLOSED §36
- ✅ PMT self-registration identity mismatch — CLOSED §37
- 🔒 `catalog-manage-bespoke-publish-machinery` — PERMANENT (no future-phase scope)

Plan v3 architectural finalist state preserved. Phase 38 closes a long-standing pattern-debt (round-trips after register) without touching the exception register.

---

## Lessons (carry-forward for Phase 39+)

1. **Pre-flight audit catches "dead code" that isn't.** §38.0 initially framed the phase as dead-code cleanup of `export-catalog.ts:549`. Re-audit surfaced that the branch handles legacy data where `status="published"` still exists in older rows. Removing it would silently change behavior for legacy rows. **Lesson generalized:** pre-flight audits for "remove dead code" phases must verify the code path is unreachable in production, not just unreachable from new canonical writes. Legacy data + manual SQL operations can keep "dead" branches reachable indefinitely.

2. **The cheap pivot has higher value than the bookkeeping pick.** When dead-code cleanup turned out not to be pure cleanup, the pivot to round-trip elimination took 5 minutes of thought and yielded a phase with real value (8 DB reads saved per registration flow). Future post-finalist phase picks should look for "indirect carry-forwards with concrete value" before settling on bookkeeping work. Round-trip elimination was tagged in §32 lesson #4 + §34 + §37 follow-ups but never made the front of the queue until §38 needed a substantive pick.

3. **Backwards-compatible canonical extensions are the safest contract changes.** §38.1 added `entry: CatalogEntry` as a required field on `RegisterCatalogEntryResult` — at the type level this looks breaking, but in practice it's additive (no caller was constructing a result without an entry; the canonical produces it). Compare with §36's removal of flip-to-published behavior or §37's "exactly one of" validation — those were behavior-affecting. **Convention:** when extending a canonical's return shape, prefer additive fields over reshape; when adding caller-side validation, document the invariant change in an ADR (§37 pattern).

4. **`getCatalogEntryById(result.entryId)` round-trips are an anti-pattern after canonical extensions.** The 8 callers all wrote essentially the same pattern: register, fetch, use. The fetch was redundant — canonical already had the row. Future canonicals that produce a row should consider returning it directly to spare the round-trip. **Convention:** when designing a new canonical write action, the result shape should include the resulting row by default unless there's a specific reason to omit it (e.g., privacy, cardinality concerns). Default to "return what you produced."

5. **Public-api re-exports are the scaling pattern for type sharing.** §38.2 needed `RegisterCatalogEntryResult` in 8 files outside ai-types. Re-exporting via `public-api.ts` (one line of `export type {...}`) gave all callers tight types without violating the boundary lint. Compare with each caller defining inline shape `{ entryId: number; action: "created" | "updated" }` (the pre-§38 pattern) — every caller drifts independently when canonical evolves. **Convention:** any canonical action whose result is consumed by callers outside the module should re-export its result type via `public-api.ts`.

---

## CI fingerprint

| Phase 38 PR | Status |
|---|---|
| #286 (38.0 plan) | 5/5 ✅ first try |
| #287 (38.1 canonical extension + 3 contract tests) | 5/5 ✅ first try |
| #288 (38.2 bulk migration) | 5/5 ✅ first try |
| (this PR — closure report) | (expected 5/5) |

**Phase 38 baseline: 5/5 green throughout.** No regressions; no flaky reruns.

---

## Memory updates after this PR

- `MEMORY.md` — Phase 38 entry flips to CLOSED.
- `project_phase_38_authority.md` — flipped to CLOSED with PR ledger + 8-callers-migrated note.
- `project_pmb_phase_38_complete.md` — created with PR ledger + the 5 carry-forward lessons above.
- `project_rac_progress.md` — updated to point at `main@<this-PR-merge-sha>` with Phase 38 marked CLOSED.
