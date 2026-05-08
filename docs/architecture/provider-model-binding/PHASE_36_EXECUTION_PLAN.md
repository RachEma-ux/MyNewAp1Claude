# Phase 36 — Execution Plan

**Captured:** 2026-05-08 against `main@e4a214a` (post-Phase-35 closure).
**Branch (this doc):** `docs/pmb-phase-36-0-execution-plan`.
**Owner:** Planner role per AGENTS.md; full autonomous-execution authority granted by the 2026-05-07 standing instruction (continuous phase execution after each closure).

---

## 1. Why Phase 36 exists

Phase 35's closure named the architectural exception **`publish-flip-to-published-mismatch`**: `server/ai-types/publishing.ts:94-100` flips entry status to `"published"` post-publish; both real callers (`catalog-manage.ts`, `sandbox-wf/seed-orchestrator.ts`) want post-publish `status === "active"`. Migration was deferred with a future-phase scope: **"PMB Phase X — `aiTypes.catalog.publish` canonical contract redesign for production callers"** + ADR.

Phase 36 IS that phase. Two pause-and-surfaces in a row (Phase 34 PMT, Phase 35 publish) is the cue to **tackle a surfaced architectural exception** rather than generate a third deferral. Plan v3's tail end has shifted from bulk migration to architectural-exception resolution; this is the rhythm.

Phase 36 closes ONE of the two named exceptions (`publish-flip-to-published-mismatch`). The other (`PMT self-registration identity mismatch`) is left for Phase 37 if continuous-execution continues.

---

## 2. Pre-flight audit findings

### Production gateway-call sites of `aiTypes.catalog.publish`

```
$ grep -rn 'gatewayCall.*aiTypes\.catalog\.publish\|"aiTypes\.catalog\.publish"' --include="*.ts" | grep -v "\.test\."
server/ai-types/manifest.ts:35       — key declaration
server/ai-types/manifest.ts:78       — action registration
server/ai-types/manifest.ts:101      — descriptor key
server/governance/action-key-map.ts:481  — action key map
```

**Zero production gateway-call sites.** Only `tests/pmb/wiring.test.ts` exercises the action manifest. The contract change has near-zero blast radius.

### Test surface that depends on flip-to-published

`server/ai-types/publishing.test.ts:145-154`:

```ts
it("idempotent-emit: a second publish call still emits (decision D-LC-1)", async () => {
  getCatalogEntryByIdMock.mockResolvedValue({ ...baseEntry, status: "published" });
  // ...
  expect(updateCatalogEntryMock).not.toHaveBeenCalled(); // status already published
});
```

This test verifies "if entry is already published, don't re-flip." After contract redesign (no flip), the assertion `expect(updateCatalogEntryMock).not.toHaveBeenCalled()` becomes universally true — needs minor wording adjustment but no semantic change to the test's intent.

### Downstream readers of `entry.status === "published"`

```
$ grep -rn '"published"' --include="*.ts" server/agent-studio/services/ server/ai-types/
server/agent-studio/services/export-catalog.ts:549  — `if (catalog.status === "published")` branch
server/ai-types/execution.ts:74  — `tags.includes("published")` (tag check, not status)
```

**One real downstream reader:** `export-catalog.ts:549`. The branch fires when the catalog row's status is `"published"`. After contract redesign, no caller will set status to `"published"`, so this branch becomes dead code.

Two options:
- **(a)** Leave the dead branch; it becomes a no-op naturally and survives if a future caller wants to opt into the legacy flip behavior.
- **(b)** Delete the dead branch; tighten the type narrowing.

**Decision: (a)** for §36.1's minimal change — the dead branch is a safety net and removing it is a separate refactor. Tag in the closure report as a Phase 37+ cleanup candidate.

### Caller-side adaptation (sandbox-wf)

After contract redesign:
- `seed-orchestrator.ts` Step C migrates to `gatewayCall("aiTypes.catalog.publish", ...)` cleanly
- Entry remains at `status: "active"` (the seed's gate-5 invariant)
- Seed agents pass all 10 execution gates as before

### catalog-manage permanent deferral

The §35 closure documented six bespoke layers in `catalog-manage.ts`'s publish procedure: stage-review validation, dependency guard, Triple Validation, transient `publishing` status, snapshot extras, separate audit channel. Even after `publish-flip-to-published-mismatch` is closed, these don't fold into canonical without behavior-toggle flags (synthetic-identity anti-pattern). **catalog-manage stays on direct `createPublishBundle` permanently.** This is documented as a permanent architectural exception named **`catalog-manage-bespoke-publish-machinery`**.

---

## 3. Sub-phase decomposition

### 36.0 — Plan freeze + ADR draft (this PR)

- [ ] Land `PHASE_36_EXECUTION_PLAN.md` (this doc).
- [ ] Land `docs/architecture/ai-types/PUBLISH_CANONICAL_CONTRACT_REDESIGN.md` ADR alongside the plan freeze (the redesign is small enough that the ADR + plan can co-merge).
- [ ] Memory: create `project_phase_36_authority.md`; `MEMORY.md` index update.
- [ ] **Acceptance:** docs land; CI 5/5 green.

### 36.1 — Canonical contract change (remove flip-to-published)

Single PR. Three coupled changes:

- [ ] **Remove the flip-to-published block** in `server/ai-types/publishing.ts:94-100`. Canonical action no longer mutates entry status; callers manage status flow.
- [ ] **Update `publishing.ts` JSDoc** to reflect the new contract: "Builds an immutable snapshot, supersedes prior active bundle, inserts the new bundle, records a catalog audit event. Does NOT mutate entry status — caller-side concern."
- [ ] **Update `manifest.ts:73`** comment matching the new contract (currently says "flips entry status to 'published'").
- [ ] **Update `publishing.test.ts`** — adjust the idempotent-emit test wording (assertion `expect(updateCatalogEntryMock).not.toHaveBeenCalled()` is now universal, not conditional on starting status). Add a new test that asserts the contract: "publish never mutates entry status."
- [ ] **Acceptance:** `tsc --noEmit` clean; existing tests pass with adjustments; CI 5/5 green.
- [ ] **Estimate:** 1 PR, ~15 LOC removed, ~5 LOC test additions.
- [ ] **Pause if:** any production gateway-call site of `aiTypes.catalog.publish` is found that the §36.0 audit missed (highly unlikely — manifest greps confirmed zero), OR `export-catalog.ts:549`'s branch turns out to be exercised in production by some non-publish path (not via the canonical action).

### 36.2 — Migrate sandbox-wf Step C

Single PR. Sandbox-wf seed-orchestrator's Step C migration, now safe after §36.1:

- [ ] Replace `createPublishBundle({...})` direct call in `seed-orchestrator.ts:252` with:
  ```ts
  await gatewayCall<PublishCatalogEntryInput, PublishCatalogEntryResult>({
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
- [ ] Drop the procedure-side snapshot + snapshotHash building (canonical handles both).
- [ ] **Verify gate 5** by reading the seed's documented invariants: entry stays at `status: "active"` post-publish. Seed agents remain runnable.
- [ ] **Acceptance:** sandbox-wf no longer calls `createPublishBundle` directly; `tsc --noEmit` clean; CI 5/5 green; the documented 10 execution gates remain passable.
- [ ] **Estimate:** 1 PR, ~25 LOC removed, ~15 LOC added (~10 LOC net removal).
- [ ] **Pause if:** sandbox-wf's snapshot includes a field that breaks downstream consumption (recheck `agsCatalogPublishBundles.snapshot` readers — confirmed zero in §35 audit, but reverify).

### 36.3 — Closure report

- [ ] Author `docs/evidence/provider-model-binding/PHASE_36_CLOSURE_REPORT.md`.
- [ ] Update memory: `project_phase_36_authority.md` → CLOSED; `project_pmb_phase_36_complete.md` created with PR ledger + carry-forward lessons; `MEMORY.md` index update; RAC-progress head SHA bump.
- [ ] **Acceptance:** all 4 PRs merged; CI fingerprint stable; `publish-flip-to-published-mismatch` exception marked CLOSED in the architectural-exception register; `catalog-manage-bespoke-publish-machinery` documented as permanent.
- [ ] **Estimate:** 1 PR, ~150 LOC docs.

---

## 4. Decision matrix

Cap: **zero new TEMPORARY_EXCEPTION_WITH_DEADLINE entries.**

| # | Item | Decision | Sub-phase | Risk |
|---|---|---|---|---|
| 1 | Remove flip-to-published from canonical | **Remove cleanly** — zero production callers, one test assertion to adjust | 36.1 | Low (zero blast radius) |
| 2 | `export-catalog.ts:549` `status === "published"` branch | **Leave as dead-but-safe** — separate cleanup phase if desired | 36.1 audit | Low |
| 3 | catalog-manage migration | **Permanently deferred** — bespoke business logic; document as `catalog-manage-bespoke-publish-machinery` | 36.3 closure | N/A |
| 4 | sandbox-wf Step C migration | **Migrate** — clean after §36.1 | 36.2 | Low |
| 5 | `policyViolations` field on canonical input | **Out of scope** — only catalog-manage needs it; catalog-manage isn't migrating | 36 | N/A |
| 6 | `publishedBy: 1` hardcoded in catalog-manage | **Out of scope** — caller-side bug fix; not migration-blocking | 36 | N/A (legacy) |
| 7 | Receipt sourcing for sandbox-wf publish | **Pattern from §34.1** — `<source>-publish-<resource>-${Date.now()}` | 36.2 | Low |
| 8 | ADR placement | **`docs/architecture/ai-types/PUBLISH_CANONICAL_CONTRACT_REDESIGN.md`** | 36.0 | Low |

---

## 5. Test strategy

### Per sub-phase

- **36.0 (this):** docs only.
- **36.1 (canonical contract change):** `tsc --noEmit`; adjust existing `publishing.test.ts` idempotent-emit test; add new test asserting "publish never mutates entry status" as the contract.
- **36.2 (sandbox-wf migration):** `tsc --noEmit`; sandbox-wf has fixture-load integration tests that exercise the seed path.
- **36.3 (closure):** docs only.

### Cross-cutting

- **CI fingerprint:** Phase 36 baseline is **5/5 green** at `e4a214a`. No matrix-shape changes.

---

## 6. Sizing

| Sub-phase | PRs | LOC code | LOC docs |
|---|---|---|---|
| 36.0 (this) | 1 | — | ~250 + ADR ~120 |
| 36.1 (canonical) | 1 | -10 net | ~10 |
| 36.2 (sandbox-wf) | 1 | -10 net | ~10 |
| 36.3 (closure) | 1 | — | ~150 |
| **Total** | **4** | **-20 net** | **~540** |

Smaller LOC change than Phase 35 (-340 net) because no orphan delete is bundled this time.

---

## 7. CI fingerprint expectation

Phase 36 baseline is **5/5 green** as of `e4a214a` (post-Phase-35 close-out). No changes expected.

---

## 8. Authority and pause conditions

**Authority:** full autonomous commit/push/merge for any PR scoped inside this plan. Phase 36 is the third phase under the **continuous-execution standing instruction**. Picked autonomously after Phase 35 closed at `e4a214a`. Surface of my reasoning in the kickoff: two pause-and-surface phases in a row generated two named architectural exceptions; the standing instruction's heuristic #1 (direct carry-forward) + #4 (behavior-preservation > greenfield) supports tackling one of them; `publish-flip-to-published-mismatch` is the smaller of the two and has zero production gateway callers, making the canonical change near-zero blast radius. PMT mismatch (the other named exception) is deferred to Phase 37 if the loop continues.

**Pause and surface for sign-off if:**

1. A hidden production gateway-call site of `aiTypes.catalog.publish` surfaces during §36.1 implementation.
2. `export-catalog.ts:549`'s "status published" branch turns out to have a non-canonical-action source that fires in production.
3. Sandbox-wf migration breaks any of the documented 10 execution gates beyond gate 5 (gate 5 is what we're fixing for).
4. Pre-existing red CI on a sub-phase PR not on the known-flaky-shard list.
