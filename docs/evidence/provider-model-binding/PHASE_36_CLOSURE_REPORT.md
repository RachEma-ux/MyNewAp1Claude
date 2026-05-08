# Phase 36 — Closure Report

**Captured:** 2026-05-08 against `main@0c347f6` (post-Phase-36.2 merge).
**Branch (this doc):** `docs/pmb-phase-36-3-closure-report`.
**Owner:** Planner + Governance roles per AGENTS.md.

---

## TL;DR

Phase 36 was the **third phase under the continuous-execution standing instruction** and the **first phase to tackle a previously surfaced architectural exception** (rather than pause-and-surface a new one). The exception named in §35.1 — `publish-flip-to-published-mismatch` — is **CLOSED**.

The phase shipped:

1. An **ADR** (`PUBLISH_CANONICAL_CONTRACT_REDESIGN.md`) co-merged with the §36.0 plan freeze locking the rationale in advance.
2. **Canonical contract change** (§36.1): `publishCatalogEntry` no longer mutates `catalog_entries.status`. Caller-side concern.
3. **Sandbox-wf Step C migration** (§36.2): `seed-orchestrator.ts` now routes through `gatewayCall("aiTypes.catalog.publish", ...)`. Gate 5 invariant preserved (entry stays at `status="active"`).
4. A **permanent architectural exception** documented: `catalog-manage-bespoke-publish-machinery` — catalog-manage stays on direct `createPublishBundle` because its six bespoke layers don't fold into canonical without anti-pattern toggle flags.

4 PRs total. **Zero new TEMPORARY_EXCEPTION_WITH_DEADLINEs.** CI fingerprint stayed at 5/5 green throughout. Net code change: −20 LOC (canonical −10, sandbox-wf −10).

---

## PR ledger

| Sub-phase | PR | Merge SHA | Title |
|---|---|---|---|
| 36.0 | [#277](https://github.com/RachEma-ux/MyNewAp1Claude/pull/277) | `3287fd6` | Plan freeze + ADR |
| 36.1 | [#278](https://github.com/RachEma-ux/MyNewAp1Claude/pull/278) | `135c430` | Remove flip-to-published from canonical |
| 36.2 | [#279](https://github.com/RachEma-ux/MyNewAp1Claude/pull/279) | `0c347f6` | Migrate sandbox-wf Step C to gateway publish |
| 36.3 | (this PR) | (TBD) | Closure report |

**Total: 4 PRs.** All sub-phases completed as planned (no scope reduction; no pause-and-surface).

---

## What shipped

### §36.1 — Canonical contract change

`server/ai-types/publishing.ts:94-100` removed:

```ts
// REMOVED:
if (entry.status !== "published") {
  await updateCatalogEntry(input.catalogEntryId, { status: "published" }, input.publishedBy);
}
```

JSDoc updated to document the new contract:

> Phase 36 contract: never mutates `catalog_entries.status`. Callers own entry state machine transitions.

`server/ai-types/manifest.ts:73` comment updated to match. New contract test added in `publishing.test.ts`:

```ts
it("contract: never mutates entry status, regardless of starting state", async () => {
  for (const startingStatus of ["draft", "active", "published", "deprecated"]) {
    updateCatalogEntryMock.mockReset();
    getCatalogEntryByIdMock.mockResolvedValue({ ...baseEntry, status: startingStatus });
    await publishCatalogEntry({ catalogEntryId: 100, publishedBy: 7 });
    expect(updateCatalogEntryMock).not.toHaveBeenCalled();
  }
});
```

### §36.2 — Sandbox-wf Step C migration

`server/sandbox-wf/seed-orchestrator.ts:252` migrated from direct `createPublishBundle` to:

```ts
await gatewayCall<unknown, { bundle: { id: number }; versionLabel: string }>({
  ctx: {
    sourceModule: "sandbox-wf",
    targetModule: "aiTypes",
    actionKey: "aiTypes.catalog.publish",
    governanceReceiptId: `sandbox-wf-publish-${entry.name}-${Date.now()}`,
    actorId: 1,
  },
  input: {
    catalogEntryId: entry.id,
    publishedBy: 1,
    versionLabel: "v1.0.0",
    policyDecision: "approved",
  },
});
```

17 lines of caller-side snapshot building deleted (canonical builds the snapshot). `createHash` and `createPublishBundle` imports dropped. Inline §34.1 comment about "Step C keeping its direct call" updated to reflect the §36 closure.

### Permanent architectural exception: `catalog-manage-bespoke-publish-machinery`

Documented in the §36.0 ADR (`PUBLISH_CANONICAL_CONTRACT_REDESIGN.md` §"Negative / Architectural exceptions left open"). `server/routers/catalog-manage.ts` stays on direct `createPublishBundle` because its publish procedure has six bespoke layers that don't fold into canonical:

1. Stage-review validation gate
2. Dependency guard for model/llm types
3. Triple Validation (`evaluateStageReview`)
4. Transient `status: "publishing"` flip with revert-on-failure
5. Snapshot extras (`validationStatus`, `lastValidatedAt`, `versionLabel`, `changeNotes`)
6. Separate audit channel (governance receipt via the procedure's own `audit()` helper)

These are caller-side business logic. Folding them into canonical would require behavior-toggle flags — synthetic-identity anti-pattern from §34 lesson #3.

This is a **permanent** exception, distinct from the deferred-to-future-phase exceptions of §34 (PMT) and §35 (publish before §36 closed it). Future phases should leave catalog-manage's publish procedure alone.

### Decision matrix outcomes (vs. plan §4)

| # | Plan decision | Outcome | Notes |
|---|---|---|---|
| 1 | Remove flip-to-published from canonical | **Locked** — §36.1 |
| 2 | `export-catalog.ts:549` `status === "published"` branch | **Left as dead-but-safe** | Future cleanup phase candidate |
| 3 | catalog-manage migration | **Permanent exception** — `catalog-manage-bespoke-publish-machinery` |
| 4 | sandbox-wf Step C migration | **Locked** — §36.2 |
| 5 | `policyViolations` field on canonical input | **Out of scope** — only catalog-manage needed it |
| 6 | catalog-manage `publishedBy: 1` hardcoded | **Out of scope** — caller-side bug fix |
| 7 | Receipt sourcing for sandbox-wf publish | **Locked** — `<source>-publish-<resource>-${Date.now()}` pattern shipped |
| 8 | ADR placement | **Locked** — `docs/architecture/ai-types/PUBLISH_CANONICAL_CONTRACT_REDESIGN.md` |

**Cap: 0 / 0 allowed new exceptions.** Used: 0.

---

## Closure of `publish-flip-to-published-mismatch`

The architectural exception named in §35.1 is **CLOSED** at this PR's merge. Verification:

- ✅ Canonical no longer mutates entry status (`publishing.ts` flip block removed; contract test asserts the invariant)
- ✅ Sandbox-wf Step C migrated; gate 5 invariant preserved
- ✅ ADR documents the redesign rationale + alternatives considered + permanent exception
- ✅ Production gateway-call sites of `aiTypes.catalog.publish`: 1 (sandbox-wf), up from 0 pre-§36

The other §34 architectural exception — **PMT self-registration identity mismatch** — remains open. Future scope: "PMB Phase X — register name-based identity for self-registered system agents" + ADR. **Phase 37 candidate** if continuous-execution continues.

---

## Lessons (carry-forward for Phase 37+)

1. **Two pause-and-surface phases in a row is the cue to tackle a surfaced exception, not generate a third deferral.** §34 paused-and-surfaced PMT. §35 paused-and-surfaced publish. §36 picked the smaller of the two named exceptions and shipped its closure. The standing instruction's heuristic #1 (direct carry-forward) supports this — direct carry-forward includes both "the next mechanical step" and "the surfaced architectural exception waiting for a redesign phase." Future tail-end phases should look at the architectural-exception register first when deciding what to pick.

2. **Canonical contracts validated only by tests are hypotheses; production callers validate them.** `aiTypes.catalog.publish`'s flip-to-published behavior was hardcoded in Phase 30 and lived for two phases of caller migrations (Phases 32, 34). Tests-only exercise meant the gate-5-conflict bug never surfaced — only the §35.1 caller-body audit caught it. Other dormant canonical actions deserve a once-over before migration starts: list every manifest-registered action with zero production gateway-call sites; for each, surface the contract decisions that would matter if a real caller showed up.

3. **Removing dead-code branches is a separate cleanup, not bundled with contract changes.** `server/agent-studio/services/export-catalog.ts:549`'s `if (catalog.status === "published")` branch became dead-but-safe after §36.1. The plan deliberately left it alone (decision matrix item #2). Reasoning: the contract change should be the smallest-possible diff so the closure focus stays on the architectural shift; downstream cleanup is its own decision. This is the discipline equivalent of "don't bundle refactors with bug fixes" — and it's why §36 only shipped −20 LOC despite touching contract semantics.

4. **Permanent architectural exceptions are distinct from deferred-to-future-phase exceptions.** §34 (PMT identity mismatch) and §35 (publish-flip-to-published-mismatch) named exceptions deferred to future phases — implicit promise to revisit. §36's `catalog-manage-bespoke-publish-machinery` is **permanent** by design — catalog-manage's six bespoke layers will always be caller-side business logic, regardless of how canonical evolves. Documenting this distinction in the ADR (§"Negative / Architectural exceptions left open") prevents future readers from filing a phantom "Phase Y — migrate catalog-manage" task. Architectural exceptions register should distinguish: deferred (named, owned, scope-proposed) vs permanent (named, locked, no future-phase scope).

5. **ADRs that ship with the plan freeze (rather than after the contract change) lock the rationale in advance.** §35.1 named `publish-flip-to-published-mismatch` at the moment of pause — improvement over §34's "name the exception in the closure report." §36 went further: ADR (`PUBLISH_CANONICAL_CONTRACT_REDESIGN.md`) co-merged with the §36.0 plan freeze, **before** the canonical change in §36.1. Future readers grep for the contract redesign and find: rationale + alternatives considered + permanent exception list, all locked at plan-freeze time. The implementation PR (§36.1) referenced the ADR rather than re-stating its case. This is the new closure-shape baseline for canonical-contract-change phases.

---

## CI fingerprint

| Phase 36 PR | Status |
|---|---|
| #277 (36.0 plan + ADR) | 5/5 ✅ first try |
| #278 (36.1 canonical change + new test) | 5/5 ✅ first try |
| #279 (36.2 sandbox-wf migration) | 5/5 ✅ first try |
| (this PR — closure report) | (expected 5/5) |

**Phase 36 baseline: 5/5 green throughout.** No regressions; no flaky reruns.

---

## Memory updates after this PR

- `MEMORY.md` — Phase 36 entry flips to CLOSED.
- `project_phase_36_authority.md` — flipped to CLOSED with PR ledger + `publish-flip-to-published-mismatch` closed + `catalog-manage-bespoke-publish-machinery` permanent exception note.
- `project_pmb_phase_36_complete.md` — created with PR ledger + the 5 carry-forward lessons above.
- `project_rac_progress.md` — updated to point at `main@<this-PR-merge-sha>` with Phase 36 marked CLOSED.
