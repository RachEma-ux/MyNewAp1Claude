# Phase 38 — Execution Plan

**Captured:** 2026-05-08 against `main@dbce5ef` (post-Phase-37 closure).
**Branch (this doc):** `docs/pmb-phase-38-0-execution-plan`.
**Owner:** Planner role per AGENTS.md; full autonomous-execution authority granted by the 2026-05-07 standing instruction.

---

## 1. Why Phase 38 exists

Phase 37 closed the last open named architectural exception (PMT identity mismatch) and reached **Plan v3 architectural finalist state** — only one permanent exception (`catalog-manage-bespoke-publish-machinery`) remains. Phase 37's lesson #1 explicitly noted that pick heuristics evolve once the architectural-exception register is empty: heuristic #1 (direct carry-forward of a surfaced exception) becomes weaker; smaller indirect carry-forwards gain weight.

Phase 38 is the **first phase post-finalist**. The pick was framed as "smallest concrete cleanup" — initially I considered dead-code removal (`export-catalog.ts:549` `if (catalog.status === "published")` branch), but re-audit surfaced that the branch handles legacy data where `status="published"` still exists in older rows. **It's not pure dead code** — removing it would change behavior for legacy rows. Pivoted to **round-trip elimination**, a cleaner refactor with real value (saves a DB read per call).

This is the §32 + §34 + §37 follow-up: callers of `gatewayCall("aiTypes.catalog.register", ...)` immediately fetch the entry via `getCatalogEntryById(result.entryId)` to use entry fields. Canonical already has the entry internally on both create and update paths — exposing it on `RegisterCatalogEntryResult` saves the round-trip without adding DB reads.

---

## 2. Pre-flight audit findings

### Round-trip call sites

```
server/routers/agents.ts:669
server/routers/bots.ts:302
server/routers/llm.ts:515
server/routers/models.ts:295
server/providers/router.ts:1064
server/sandbox-wf/seed-orchestrator.ts:226
server/modules/pmt/context-translator-agent.ts:1276
server/modules/pmt/idea-builder-agent.ts:694
```

**8 call sites.** Pattern across all of them:

```ts
const result = await gatewayCall<unknown, { entryId: number; action: "created" | "updated" }>({...});
const entry = await getCatalogEntryById(result.entryId);  // ← round-trip
if (!entry) { /* defensive throw or null return */ }
// ... use entry ...
```

### Canonical already has the entry on both paths

`server/ai-types/register.ts`:

- **Update path** (line 125): `const updated = await getCatalogEntryById(guard.existingEntryId)` — fetches the post-update entry to extract `legacyImportState` for the result.
- **Create path** (line 158): `const created = await createCatalogEntry({...})` — `createCatalogEntry` returns the full inserted row (`Promise<CatalogEntry>` per `db.ts:68`).

**Zero extra DB reads** to expose the entry on the result — both paths already have the row in hand. Just thread it through.

### Result shape change is backwards-compatible

Adding `entry: CatalogEntry` to `RegisterCatalogEntryResult` is a strict superset of the current shape. Existing callers that don't read `result.entry` are unaffected.

### catalog-manage stays direct (permanent exception)

`server/routers/catalog-manage.ts:syncProviders` and similar paths call `createCatalogEntry` directly (not through register) — those are intra-platform writes, not gateway calls. Out of Phase 38 scope per `catalog-manage-bespoke-publish-machinery` permanent exception.

---

## 3. Sub-phase decomposition

### 38.0 — Plan freeze (this PR)

- [ ] Land `PHASE_38_EXECUTION_PLAN.md` (this doc).
- [ ] Memory: create `project_phase_38_authority.md`; `MEMORY.md` index update.
- [ ] **Acceptance:** doc lands; CI 5/5 green.

### 38.1 — Extend `RegisterCatalogEntryResult` with `entry` field

Single PR. Backwards-compatible canonical change:

- [ ] **Extend `RegisterCatalogEntryResult`** in `server/ai-types/register.ts`:
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
- [ ] **Update `registerCatalogEntry`**:
  - Update path: thread `updated` (already fetched) into `result.entry`.
  - Create path: thread `created` (already returned by `createCatalogEntry`) into `result.entry`.
- [ ] **Update `register.test.ts`**: existing tests' result shape assertions; add a contract test that `result.entry.id === result.entryId` on both paths.
- [ ] **Acceptance:** `tsc --noEmit` clean; existing tests pass with adjusted shape; CI 5/5 green.
- [ ] **Estimate:** 1 PR, ~15 LOC code, ~10 LOC tests.
- [ ] **Pause if:** any caller relies on `result.entry` being absent (highly unlikely — additive field).

### 38.2 — Bulk-migrate the 8 callers to drop the round-trip

Single PR. Mechanical replacement: drop `await getCatalogEntryById(result.entryId)` and the defensive null-check; rename `entry` references to `result.entry`.

- [ ] **Migrate each of the 8 callers**:
  ```ts
  // BEFORE:
  const result = await gatewayCall<...>({...});
  const entry = await getCatalogEntryById(result.entryId);
  if (!entry) throw new Error(...);
  // ... use entry ...

  // AFTER:
  const result = await gatewayCall<unknown, RegisterCatalogEntryResult>({...});
  // ... use result.entry directly ...
  ```
- [ ] Drop `getCatalogEntryById` from imports where it was used only for the round-trip.
- [ ] Tighten the gateway-call type parameter to use the actual `RegisterCatalogEntryResult` shape (was `{ entryId: number; action: "created" | "updated" }`).
- [ ] **Acceptance:** all 8 callers migrated; `tsc --noEmit` clean; existing tests pass; CI 5/5 green.
- [ ] **Estimate:** 1 PR, ~50 LOC removed (8 fetches + 8 null-checks), ~10 LOC added (tightened types).
- [ ] **Pause if:** a caller's downstream logic depends on `getCatalogEntryById` triggering a fresh read (e.g., reading post-classification state set by a parallel write). Audit suggests no caller does this, but flag if found.

### 38.3 — Closure report

- [ ] Author `docs/evidence/provider-model-binding/PHASE_38_CLOSURE_REPORT.md`.
- [ ] Update memory: `project_phase_38_authority.md` → CLOSED; `project_pmb_phase_38_complete.md` created with PR ledger + carry-forward lessons; `MEMORY.md` index update; RAC-progress head SHA bump.
- [ ] **Acceptance:** all 4 PRs merged; CI fingerprint stable.
- [ ] **Estimate:** 1 PR, ~150 LOC docs.

---

## 4. Decision matrix

Cap: **zero new TEMPORARY_EXCEPTION_WITH_DEADLINE entries.**

| # | Item | Decision | Sub-phase | Risk |
|---|---|---|---|---|
| 1 | Round-trip elimination vs dead-code cleanup vs other indirect carry-forwards | **Round-trip elimination** — cleaner refactor; real value (saves DB read); 8 callers | 38.0 | Low |
| 2 | Bulk-migrate vs per-file PRs for §38.2 | **Bulk** — same shape × 8; mechanical; matches Phase 32's bulk pattern | 38.2 | Low |
| 3 | `entry` field optional vs required on `RegisterCatalogEntryResult` | **Required** — both canonical paths produce it; no extra reads needed | 38.1 | Low |
| 4 | Test surface for new field | **Add a contract test** that `result.entry.id === result.entryId` on both paths | 38.1 | Low |
| 5 | dead-code branch removal (`export-catalog.ts:549`) | **Out of scope** — handles legacy data, not pure dead code | — | N/A |
| 6 | catalog-manage direct callers | **Out of scope** — permanent exception | — | N/A |

---

## 5. Test strategy

- **38.0 (this):** docs only.
- **38.1 (canonical extension):** `tsc --noEmit`; existing `register.test.ts` tests pass with adjusted result shape; add contract test for `result.entry.id === result.entryId`.
- **38.2 (caller migrations):** `tsc --noEmit`; existing tests for each caller pass.
- **38.3 (closure):** docs only.

**CI fingerprint:** Phase 38 baseline is **5/5 green** at `dbce5ef`. No matrix-shape changes.

---

## 6. Sizing

| Sub-phase | PRs | LOC code | LOC docs |
|---|---|---|---|
| 38.0 (this) | 1 | — | ~250 |
| 38.1 (canonical extension) | 1 | +15 net | +10 tests |
| 38.2 (caller migrations) | 1 | -40 net | ~5 |
| 38.3 (closure) | 1 | — | ~150 |
| **Total** | **4** | **-25 net** | **~415** |

Smaller LOC change than Phase 37 (+87 net) because it's pure refactor without new test scenarios. Same shape as Phase 36 (-20 net).

---

## 7. CI fingerprint expectation

Phase 38 baseline is **5/5 green** as of `dbce5ef` (post-Phase-37 close-out). No changes expected.

---

## 8. Authority and pause conditions

**Authority:** full autonomous commit/push/merge for any PR scoped inside this plan. Phase 38 is the **fifth phase under the continuous-execution standing instruction** and the **first post-finalist phase**. Picked autonomously after Phase 37 closed at `dbce5ef`.

**Surface of my reasoning in the kickoff:** Per §37 lesson #1, post-finalist phases need different selection heuristics. The dead-code cleanup framing was rejected after audit (the obvious candidate handles legacy data — not pure dead code). Pivoted to round-trip elimination: clean refactor, 8 callers across §32 + §34 + §37, real DB-read savings, backwards-compatible canonical change.

**Pause and surface for sign-off if:**

1. A caller's `getCatalogEntryById(result.entryId)` is doing more than fetching the just-written row (e.g., reading post-classification state from a parallel write). Audit suggests no such caller exists, but flag if found.
2. The `entry` field addition surfaces a downstream typing issue (e.g., a Partial<RegisterCatalogEntryResult> consumer that doesn't expect the field).
3. Pre-existing red CI on a sub-phase PR not on the known-flaky-shard list.
