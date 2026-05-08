# Phase 37 — Closure Report

**Captured:** 2026-05-08 against `main@fe13781` (post-Phase-37.3 merge).
**Branch (this doc):** `docs/pmb-phase-37-4-closure-report`.
**Owner:** Planner + Governance roles per AGENTS.md.

---

## TL;DR

Phase 37 was the **fourth phase under the continuous-execution standing instruction** and the **second phase to tackle a previously surfaced architectural exception** (after §36 closed `publish-flip-to-published-mismatch`). The exception named in §34 — **PMT self-registration identity mismatch** — is **CLOSED**.

**Plan v3 reaches architectural finalist state** at this PR's merge:

- ✅ `publish-flip-to-published-mismatch` — CLOSED §36
- ✅ **PMT self-registration identity mismatch** — CLOSED §37 (this phase)
- 🔒 `catalog-manage-bespoke-publish-machinery` — PERMANENT (no future-phase scope)

The phase shipped:

1. An **ADR** (`PMT_NAME_BASED_IDENTITY.md`) co-merged with the §37.0 plan freeze locking the rationale (same shape as §36's closure-shape baseline).
2. **Canonical contract change** (§37.1): `RegisterCatalogEntryInput` accepts either `sourceId` (numeric, domain-backed) or `sourceName` (string, self-registered) with "exactly one of" validation. `checkDuplicateLegacyImport` dispatches by whichever is present. Phase 25 sealed-identity invariant weakened to bounded shape.
3. **Two PMT caller migrations** (§37.2 + §37.3): `context-translator-agent.ts` and `idea-builder-agent.ts` now route through `gatewayCall("aiTypes.catalog.register", ...)` using `sourceType: "self_registered_agent"` + `sourceName: AGENT_CATALOG_ID`.

5 PRs total. **Zero new TEMPORARY_EXCEPTION_WITH_DEADLINEs.** CI fingerprint stayed at 5/5 green throughout. Net code change: +87 LOC (canonical extension +50; PMT migrations +18 each = +36; less misc); +130 LOC tests.

---

## PR ledger

| Sub-phase | PR | Merge SHA | Title |
|---|---|---|---|
| 37.0 | [#281](https://github.com/RachEma-ux/MyNewAp1Claude/pull/281) | `ab08bac` | Plan freeze + ADR `PMT_NAME_BASED_IDENTITY.md` |
| 37.1 | [#282](https://github.com/RachEma-ux/MyNewAp1Claude/pull/282) | `0194350` | Register name-based identity (canonical extension + 10 new tests) |
| 37.2 | [#283](https://github.com/RachEma-ux/MyNewAp1Claude/pull/283) | `4626326` | Migrate context-translator-agent.ts |
| 37.3 | [#284](https://github.com/RachEma-ux/MyNewAp1Claude/pull/284) | `fe13781` | Migrate idea-builder-agent.ts |
| 37.4 | (this PR) | (TBD) | Closure report |

**Total: 5 PRs.** All sub-phases completed as planned (no scope reduction; no pause-and-surface).

---

## What shipped

### §37.1 — Canonical contract change

**Updated `RegisterCatalogEntryInput`:**

```ts
export interface RegisterCatalogEntryInput {
  entryType: string;
  sourceType: string;
  /** Numeric — required for domain-backed entries; mutually exclusive with sourceName. */
  sourceId?: number;
  /** String — required for self-registered system agents; mutually exclusive with sourceId. */
  sourceName?: string;
  fields: Omit<InsertCatalogEntry, "entryType" | "sourceType" | "sourceId">;
  registeredBy: number;
  // ... existing fields unchanged
}
```

**`registerCatalogEntry` validates "exactly one of" at top of function.** `checkDuplicateLegacyImport` accepts the same union; dispatches by whichever is present:

- `sourceId` path (Phase 25 contract): unchanged. Three outcomes: `would_duplicate_legacy`, `modern_row_update_path`, `no_existing_row`.
- `sourceName` path (Phase 37): skips legacy-import classification. Looks up modern rows by `(sourceType, name === sourceName)`. Two outcomes: `modern_row_update_path` or `no_existing_row`.

`CatalogRegisteredPayload.sourceRefId` widened from `number` to `number | string`. `deriveSourceModule("self_registered_agent")` returns `"pmt"`.

**Test surface:** 6 new tests in `register.test.ts` (`Phase 37 — sourceName path` describe); 4 new tests in `legacy-import.test.ts` (name-path duplicate guard). All numeric-path tests retained as regression guard.

### §37.2 + §37.3 — PMT caller migrations

Both PMT agents now route through the canonical write path. Pattern:

```ts
const result = await gatewayCall<unknown, { entryId: number; action: "created" | "updated" }>({
  ctx: {
    sourceModule: "pmt",
    targetModule: "aiTypes",
    actionKey: "aiTypes.catalog.register",
    governanceReceiptId: `pmt-<agent-key>-bootstrap-${AGENT_CATALOG_ID}-${Date.now()}`,
    actorId: 0,
  },
  input: {
    entryType: "agent",
    sourceType: "self_registered_agent",
    sourceName: AGENT_CATALOG_ID,
    fields: { /* same as legacy createCatalogEntry call */ },
    registeredBy: 0,
    sourceModule: "pmt",
    actorType: "system",
    initiatedByUserId: null,
  },
});
const entry = await getCatalogEntryById(result.entryId);
```

The find-or-update pre-flight in PMT stays — its runtime-config-drift patching is more granular than register's "modern row update" semantics; the canonical write only runs in the `no_existing_row` path of the existing pre-flight.

The redundant `createCatalogAuditEvent({ eventType: "agent_registered" })` calls were dropped (zero consumers per §34 audit; canonical's `aiTypes.catalog.registered` event replaces them).

`setEntryClassifications` calls after register remain — real-taxonomy classifications, intra-platform write through public-api.

### Phase 25 invariant after §37

Original: "every register call must have a source-of-record numeric ID for duplicate detection."

Post-§37: **"every register call must have a source-of-record (numeric `sourceId` for domain-backed entries, or string `sourceName` for self-registered system agents); the duplicate guard uses whichever is present."**

Strictly weaker than original but **bounded** + **explicit**. Documented in the ADR.

### Decision matrix outcomes (vs. plan §4)

| # | Plan decision | Outcome | Notes |
|---|---|---|---|
| 1 | Extend register input vs separate canonical action vs synthetic identity | **Locked — Option 1** (extend) | Per ADR |
| 2 | Phase 25 sealed-identity invariant | **Locked — weakened to bounded shape** | Documented |
| 3 | Duplicate guard for name-path | **Locked — skip legacy lookup; check by name** | §37.1 |
| 4 | `sourceType: "self_registered_agent"` | **Locked** | Future system agents reuse |
| 5 | PMT find-or-update pre-flight | **Kept** | Idempotency invariant beyond register |
| 6 | PMT `agent_registered` audit event | **Dropped** | Zero consumers |
| 7 | PMT `setEntryClassifications` | **Kept after register** | Real-taxonomy |
| 8 | Receipt sourcing | **Locked** — `pmt-<agent-key>-bootstrap-<id>-<timestamp>` |
| 9 | ADR placement | **Locked** — co-merged at plan freeze |

**Cap: 0 / 0 allowed new exceptions.** Used: 0.

---

## Closure of "PMT self-registration identity mismatch"

The §34-named architectural exception is **CLOSED** at this PR's merge. Verification:

- ✅ Canonical accepts `sourceName` for self-registered agents (§37.1 contract change)
- ✅ Both PMT agents migrated to gateway-call path (§37.2 + §37.3)
- ✅ Repo-wide search confirms no remaining direct `createCatalogEntry` callers from PMT modules
- ✅ ADR documents the redesign rationale + alternatives considered + bounded invariant
- ✅ Production gateway-call sites of `aiTypes.catalog.register` for self-registered agents: 2 (was 0 pre-§37)

After §37, **only `catalog-manage-bespoke-publish-machinery` (permanent) remains** in the architectural-exception register. Plan v3 architectural cleanup is in finalist state.

---

## Lessons (carry-forward for Phase 38+)

1. **Once the architectural-exception register approaches zero, the next phase pick gets harder.** §34 → §35 → §36 → §37 was a clean cadence: pause / pause / tackle / tackle. After §37, the only remaining named exception is permanent (`catalog-manage-bespoke-publish-machinery`) — there is no next "tackle the surfaced exception" pick. Phase 38+ phases need different selection heuristics: indirect carry-forwards (Phase 32 round-trip elimination, Phase 35 dormant-canonical audit, Phase 36 dead-code cleanup), or pivot to forward-looking work (DOCX/OCR-PDF parsers, multi-region readiness, etc.).

2. **Canonical contract changes that weaken invariants need explicit invariant documentation.** Phase 25's sealed-identity invariant was strict ("every register call has a numeric `sourceId`"). Phase 37 weakens it to "exactly one of `sourceId` or `sourceName`." The new invariant is bounded + explicit, but the ADR documents the change so future readers don't assume the original strict shape. **Convention: any phase that weakens a previously sealed invariant MUST document the new invariant in the same ADR that describes the change.** Don't let the original invariant rot in the original ADR while the new behavior diverges.

3. **`sourceType` enums are extension points; treat them as such.** `sourceType: "self_registered_agent"` was introduced as the marker for the name-path. Future system-agent registrations can reuse it. The pattern generalizes: when a canonical input gets a new dispatch branch, the marker that selects the branch is itself a future extension point. Worth naming it deliberately + documenting the convention in the ADR.

4. **Replicated migrations (§37.2 + §37.3) deserve to be in separate PRs even when shape is identical.** Both PMT migrations had identical shape (same gateway-call wrapper, same receipt pattern, same drop-audit-event pattern). Could have shipped in one PR. Splitting them gave each a focused review surface + clean per-file diff in `git log`. Cost: 1 extra PR. Benefit: future archeologists doing `git blame server/modules/pmt/idea-builder-agent.ts` see "Phase 37.3 — migrate idea-builder" as the precise commit, not "Phase 37.2 — migrate both PMT agents." The §37 cadence (5 PRs) cost very little and gave commit-history clarity. Future replicated migrations should follow the same pattern.

5. **Architectural finalist state is a milestone worth naming.** After §37, the architectural-exception register has 1 entry (permanent). That's the cleanup-phase tail-end the user has been driving toward. **The closure report should explicitly call out the finalist state**, both for the user (signaling that future phases shift focus) and for future readers (signaling that past phases were genuinely closing debt, not just kicking it down the road). This phrasing — "Plan v3 reaches architectural finalist state" — is the canonical phrase for this milestone; future reports can grep for it.

---

## CI fingerprint

| Phase 37 PR | Status |
|---|---|
| #281 (37.0 plan + ADR) | 5/5 ✅ first try |
| #282 (37.1 canonical extension + tests) | 5/5 ✅ first try |
| #283 (37.2 context-translator migration) | 5/5 ✅ first try |
| #284 (37.3 idea-builder migration) | 5/5 ✅ first try |
| (this PR — closure report) | (expected 5/5) |

**Phase 37 baseline: 5/5 green throughout.** No regressions; no flaky reruns.

---

## Memory updates after this PR

- `MEMORY.md` — Phase 37 entry flips to CLOSED; Plan v3 architectural state updated to finalist.
- `project_phase_37_authority.md` — flipped to CLOSED with PR ledger + "PMT self-registration identity mismatch" CLOSED note.
- `project_pmb_phase_37_complete.md` — created with PR ledger + the 5 carry-forward lessons above.
- `project_rac_progress.md` — updated to point at `main@<this-PR-merge-sha>` with Phase 37 marked CLOSED + finalist state called out.
