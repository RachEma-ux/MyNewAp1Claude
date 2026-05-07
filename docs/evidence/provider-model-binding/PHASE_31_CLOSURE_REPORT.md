# Phase 31 — Closure Report

**Captured:** 2026-05-07 against `main@ed630fc` (post-Phase-31.4 merge).
**Branch (this doc):** `docs/pmb-phase-31-5-closure-report`.
**Owner:** Planner + Governance roles per AGENTS.md.

---

## TL;DR

Phase 31 IS Phase 26.1: it strips the three `ai-types/db` barrel re-exports (LA-01) and migrates the 22 baselined callers (LA-02) off `from "../ai-types/db"` to either `from "../ai-types/public-api"` (read helpers + intra-platform writes) or onto sibling gateway actions. The boundary lint flips from baseline-allow to **strict mode**; the baseline file is deleted.

Mid-phase scope pivot: §31.2's audit found that gateway-call migration of the 6 mixed-write callers (the `<domain>.importToCatalog` family) would require behavior changes that `LEGACY_PATH_DEPRECATION.md` explicitly warned about — audit event shapes (`catalog.{agent,bot,model,provider}.submitted`) and duplicate-detection semantics differ from `aiTypes.catalog.register`'s canonical shape. Per the plan's §8 pause-condition #4 ("behavior preservation is the gate"), §31.3b pivoted: elevate the small set of write helpers through public-api with intent docs, defer gateway-call adoption to a follow-up phase explicitly scoped as a behavior-preservation refactor. The Phase-47 deprecation markers on the legacy procedures are unchanged; new callers continue to be steered to `aiTypes.catalog.register`.

5 PRs total. **Zero new TEMPORARY_EXCEPTION_WITH_DEADLINEs.** CI fingerprint stayed at 5/5 green through every PR (one rerun in §31.4 after the test-suite caught test files importing the deleted `db/catalog` shim — those tests bypass the boundary lint, so the failure was real, not a flake; fixed in the same PR with a 27-file bulk redirect).

After this PR, the **AI Types public-API surface is the only allowed import path** from outside `server/ai-types/`. The boundary lint will fail any future regression at PR-time.

---

## What shipped — PR ledger

| Sub-phase | PR | Merge SHA | Title |
|---|---|---|---|
| 31.0 | [#257](https://github.com/RachEma-ux/MyNewAp1Claude/pull/257) | `782bbd7` | Execution plan freeze (Option A — barrel-strip) |
| **31.1** | [#258](https://github.com/RachEma-ux/MyNewAp1Claude/pull/258) | `6a92d8e` | AI Types public-API read-helper surface elevation |
| **31.3a** | [#259](https://github.com/RachEma-ux/MyNewAp1Claude/pull/259) | `29a3c14` | Read-only caller migration (4 files) |
| **31.3b** | [#260](https://github.com/RachEma-ux/MyNewAp1Claude/pull/260) | `5033219` | Mixed-write caller migration + intra-platform write surface elevation |
| **31.3c** | [#261](https://github.com/RachEma-ux/MyNewAp1Claude/pull/261) | `05f1b29` | Service-layer caller migration |
| **31.3d** | [#262](https://github.com/RachEma-ux/MyNewAp1Claude/pull/262) | `ea7601b` | Execution / invoke / boot caller migration |
| **31.4** | [#263](https://github.com/RachEma-ux/MyNewAp1Claude/pull/263) | `ed630fc` | Strip 3 ai-types/db barrels + flip lint to strict + 27-file test bulk redirect |
| 31.5 | (this PR) | (TBD) | Closure report |

**Total: 8 PRs** (one over the planned 6–7 because §31.2's audit was rolled into §31.3a as a pre-flight rather than a separate stub PR, but §31.4 needed an in-place follow-up commit for the 27 test files that bypass the boundary lint).

---

## What changed in the Legacy Exception Register

Before Phase 31 (`main@7eb1f56` baseline — post-Phase-30 close-out):

| LR | Path | Status |
|---|---|---|
| LA-01 | `server/db.ts:34`, `server/db/index.ts:19`, `server/db/catalog.ts:36` | `in_progress` (deadline Phase 26.1) |
| LA-02 | 22 files in `scripts/baseline/ai-types-public-api-boundary.txt` | `in_progress` (deadline Phase 26.1) |

After Phase 31 (`main@ed630fc`):

| LR | Status | Notes |
|---|---|---|
| **LA-01** | **migrated** | Three barrel re-exports stripped. `server/db/catalog.ts` deleted entirely (zero importers). Boundary lint flipped to strict mode. |
| **LA-02** | **migrated** | All 22 baselined callers off `from "../ai-types/db"`. Baseline file deleted. |

**Net change: 2 of 2 Phase-26.1-deadline LRs flipped to `migrated`. Zero deferrals; zero new TEMPORARY_EXCEPTION_WITH_DEADLINEs.**

---

## What changed in the AI Types public-API surface

Before Phase 31 — minimal surface (Phase 7 + Phase 26):

```
public-api.ts re-exports:
  ./types, ./contracts, ./events, ./ports
  aiTypesManifest from ./manifest
  listAvailableProviderModels + types from ./provider-models-availability
```

After Phase 31 — comprehensive surface organized by intent:

```
public-api.ts re-exports:
  (Phase 7 + Phase 26 — unchanged)
  ./types, ./contracts, ./events, ./ports
  aiTypesManifest, listAvailableProviderModels, FORBIDDEN_AVAILABILITY_KEYS
  AvailableProviderModel + 3 related types

  (Phase 31.1 — read helpers)
  getCatalogEntries, getCatalogEntryById, getCatalogEntryVersions,
  getPublishBundles, getActiveBundles, getBundleByHash,
  getActiveBundleForEntry, getCatalogAuditEvents, getExecutionRunById,
  listExecutionRuns, getTaxonomyNodes, getTaxonomyTree,
  getTaxonomyChildren, getEntryClassifications

  (Phase 31.1 — drizzle-schema row + insert types for catalog tables)
  CatalogEntry, InsertCatalogEntry, CatalogEntryVersion,
  InsertCatalogEntryVersion, PublishBundle, InsertPublishBundle,
  CatalogAuditEvent, InsertCatalogAuditEvent, ExecutionRun,
  InsertExecutionRun, TaxonomyNode, InsertTaxonomyNode,
  CatalogEntryClassification

  (Phase 31.3b — intra-platform writes; flagged "prefer gateway register
   for cross-module")
  createCatalogEntry, updateCatalogEntry, approveCatalogEntry,
  deleteCatalogEntry, setEntryClassifications, createCatalogAuditEvent,
  createPublishBundle, recallPublishBundle, createExecutionRun,
  updateExecutionRun, seedTaxonomy

  (Phase 31.3c — service-runtime reads)
  resolveServiceAgentByName, resolveServiceAgent, checkServiceHealth,
  checkServiceHealthByName, isServiceBasedAgent
  + ServiceRuntimeConfig, ServiceRuntimeTarget, ServiceHealthResult

  (Phase 31.3c — domain-projection writers, intra-platform)
  createModel, updateModel, getModelById, createLlm, updateLlm,
  getLlmById, createProviderWithProjection, resolveDomainEntity,
  resolveProviderFromCatalogEntry

  (Phase 31.3c — projection helpers)
  buildCatalogFields, projectToCatalog, refreshCatalogProjection,
  findCatalogEntryBySource, linkCatalogToDomain

  (Phase 31.3c — pure import normalization)
  resolveProviderId, normalizeToModel, normalizeToLlm, getDomainTarget
  + ImportRowLike

  (Phase 31.3d — execution surface)
  resolveCatalogAgentExecutionTarget, resolveServiceAgentExecutionTarget,
  catalogExecutionQuerySchema, executeCatalogChatStream,
  executeServiceAgentStream, getExecutionRunForUi
  + CatalogAgentExecutionTarget, ServiceAgentExecutionTarget,
    CatalogExecutionEvent, ReasoningLlmContext

  (Phase 31.3d — invoke surface)
  resolveInvokeTarget, invokeCatalogEntry
  + CatalogInvokeInput, CatalogInvokeResolution

  (Phase 31.3d / 31.4 — platform-layer entrypoints)
  bootAiTypesModule
  aiTypesRouter
```

The surface is sectioned with header comments documenting intent. Cross-module callers should prefer `gatewayCall("aiTypes.catalog.register", ...)` for new write paths; the in-process write surface is preserved for the legacy callers that predate the gateway pattern.

---

## What changed in the boundary lint

Before Phase 31 — **baseline-allow** mode:

- 22 known offenders listed in `scripts/baseline/ai-types-public-api-boundary.txt` were warnings.
- New private imports were failures.

After Phase 31 — **strict** mode:

- ANY private AI Types import outside `server/ai-types/` is a hard FAIL.
- The baseline file is deleted.
- The lint code (`scripts/check-ai-types-public-api-boundary.ts`) was rewritten to drop the baseline-loading paths; `severity` is hard-coded to `"fail"`.

Run output on `main@ed630fc`:

```
AI Types Public-API Boundary
=============================

Failures: 0
OK — all AI Types imports go through the public-API surface.
```

---

## Decision matrix outcomes (vs. plan §4)

| # | Plan decision | Outcome | Notes |
|---|---|---|---|
| 1 | Public-api re-export pattern: controlled named-export list | **Locked** | No `export *` introduced; every section is named, sectioned, commented. |
| 2 | Read helpers eligible for re-export | **Locked** | All 14 `get*`/`list*` from `ai-types/db.ts` exposed. |
| 3 | Write helpers handling: stay private; require gateway migration in §31.3 | **Pivoted** | §31.2 audit found behavior-preservation risk; intra-platform writes elevated through public-api with intent docs. Cross-module callers still steered to gateway via Phase-47 deprecation markers. Documented in §31.3b PR body + this report's TL;DR. |
| 4 | Caller-migration grouping: by domain | **Locked** | 4 sub-PRs (#259/#260/#261/#262) shipped per the plan's grouping. |
| 5 | `catalog-manage.ts` resolution | **Adapted** — elevated `service.ts` writers through public-api (option b) | The relocate-vs-elevate question dissolved once §31.3b's "intra-platform writes through public-api" pivot landed. Same shape applied to catalog-manage.ts in §31.3c. |
| 6 | Bootstrap-path callers (`_core/index.ts`) | **Locked** — exposed through public-api | `bootAiTypesModule`, `seedTaxonomy`, `catalogExecutionQuerySchema`, `invokeCatalogEntry` re-exported. Cleaner than a per-file lint exception. |
| 7 | Lint mode after migration | **Locked** | Flipped baseline-allow → strict; baseline file deleted. |
| 8 | Test strategy | **Adapted** — bulk redirect for tests | The boundary lint skips `*.test.ts`; 27 test files transitively used the deleted `db/catalog` shim and surfaced as `test`-job failures in the §31.4 CI run. Fixed in-place via depth-aware sed redirect to `ai-types/public-api`. |

**Cap: 0 / 0 allowed new exceptions.** Used: 0. No new TEMPORARY_EXCEPTION_WITH_DEADLINEs introduced.

---

## Lessons (carry-forward for Phase 32+)

1. **Audit before refactor.** §31.2's audit was the load-bearing step that caught the gateway-call behavior-preservation risk before code shipped. Future barrel-strips with mixed read/write callers should always run a per-call-site audit between the surface-elevation PR and the caller-migration PRs. The audit's deliverable is "every caller has a documented migration target"; if any caller's target requires behavior change, that's a pause-and-surface event, not a forward-press.

2. **Boundary lint != tsc != tests.** The boundary lint (`check:architecture`) skips test files for good reason — tests routinely poke at internals. But that means the lint can pass while tests still depend on the old surface. When stripping a barrel, run the test suite — not just the lint — before merging the strip PR. §31.4 caught this inside the same PR via a CI-test-job failure; future strips should run `npx vitest run tests/contracts/` (or the analogous shard) locally before pushing.

3. **Pragmatic surface elevation > over-architected refactors.** The §31.3b pivot — elevating intra-platform writes through public-api with intent docs instead of forcing all callers through the canonical gateway action — was the right call. The actual goal (drain the baseline, lint enforces public-api) is achieved. The architectural-purity goal (every cross-module write through a receipted gateway action) stays on the roadmap as a behavior-preservation phase. Don't conflate "the public-api surface" with "the gateway surface" — they're complementary, not redundant.

4. **Sectioned public-api with intent docs.** The Phase 31 elevation block added 7 named sections (reads / intra-platform writes / service-runtime / domain-projection writers / projection helpers / import-normalization / execution / invoke / module-bootstrap / router). Each section's header comment names its consumer pattern. New AI Types features should land in the appropriate section (or open a new one); reviewers can quickly judge whether a new export belongs.

5. **Delete dead-code shims, don't preserve them.** `server/db/catalog.ts` was a backward-compat shim with zero actual importers. Deleting it surfaced 27 transitive test consumers via tsc + vitest errors — exactly the kind of feedback you want. Preserving "in case anyone needs it" shims hides ongoing dependencies on a path that's supposed to be deprecated. The boundary lint is the canonical "what's allowed"; backward-compat shims undermine it.

---

## CI fingerprint

| Phase 31 PR | Status |
|---|---|
| #257 (31.0 docs) | 5/5 ✅ first try |
| #258 (31.1 surface elevation) | 5/5 ✅ first try |
| #259 (31.3a read-only) | 5/5 ✅ first try |
| #260 (31.3b mixed-write) | 5/5 ✅ first try |
| #261 (31.3c service-layer) | 5/5 ✅ first try |
| #262 (31.3d execution) | 5/5 ✅ first try |
| #263 (31.4 strip + lint flip) | 4/5 first try (`test` failed: 27 test files used deleted db/catalog shim) → 5/5 after in-place test-redirect commit |
| (this PR — closure report) | (expected 5/5) |

**Phase 31 baseline: 5/5 green throughout merged state.** One real failure caught and fixed in-PR (not a flake — the boundary lint's `*.test.ts` skip is by design but means the strip PR needs a separate test-suite check).

---

## Memory updates after this PR

- `MEMORY.md` — Phase 31 entry flips to CLOSED; Phase 31 authority entry stays (closed-out form, mirrors Phase 28/29/30 pattern).
- `project_phase_31_authority.md` — flipped to CLOSED with PR ledger.
- `project_pmb_phase_31_complete.md` — created with PR ledger + the 5 carry-forward lessons above.
- `project_rac_progress.md` — updated to point at `main@<this-PR-merge-sha>` with Phase 31 marked CLOSED.
