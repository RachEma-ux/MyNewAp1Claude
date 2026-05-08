# Phase 35.1 — Publish migration deferral (architectural exception)

**Captured:** 2026-05-07 against `main@3ca26d7` (post-Phase-35.0 plan freeze).
**Branch:** `feat/pmb-phase-35-1-canonical-extension-catalog-manage-migration` → `feat/pmb-phase-35-1-orphan-delete-and-deferral` after pivot.
**Owner:** Planner + Governance roles per AGENTS.md.

---

## TL;DR

The Phase 35 plan freeze called for migrating **3 direct `createPublishBundle` callers** to `gatewayCall("aiTypes.catalog.publish", ...)`. Mid-execution audit of caller bodies surfaced a **structural mismatch between the canonical action's contract and real-caller expectations** that mirrors the §34 PMT identity mismatch: forcing the migration would require behavior-changing canonical extensions, not pure refactor.

Phase 35.1 pivots: pause-and-surface the migration; ship only the orthogonal orphan delete (`Agents/seed-orchestrator.ts` — broken imports, zero references). Migration is deferred to a future phase explicitly scoped as a canonical-action contract redesign + ADR.

This is the **second pause-and-surface under the continuous-execution standing instruction** (Phase 34's PMT mismatch was the first).

---

## What surfaced

### 1. Canonical action's "flip to published" contract conflicts with all production-shape callers

`server/ai-types/publishing.ts:94-100` has a hardcoded post-publish status flip:

```ts
if (entry.status !== "published") {
  await updateCatalogEntry(
    input.catalogEntryId,
    { status: "published" },
    input.publishedBy,
  );
}
```

**Real callers want post-publish `status === "active"`, not `"published"`:**

- **`server/routers/catalog-manage.ts:1192`** — explicitly sets entry to `"active"` post-publish (the procedure's "Restore to active after publishing" step).
- **`server/sandbox-wf/seed-orchestrator.ts`** — relies on `status === "active"` for **gate 5 of the 10 execution gates** (documented at `seed-orchestrator.ts:9`). Migrating to canonical would flip entry to `"published"`, break gate 5, and render the seed agents non-executable.

**Production gateway-call sites of `aiTypes.catalog.publish`:** zero. Only `tests/pmb/wiring.test.ts` exercises the action manifest. The canonical action's status-flip behavior has never been validated against a production caller.

### 2. catalog-manage has bespoke pre-publish gate + post-publish state machinery

The `catalog-manage.ts` publish procedure (lines 1100-1205) does:

1. Stage-review validation (`register` + `validate` must be `approved`)
2. Dependency guard for model/llm types (upstream provider must be available)
3. Triple Validation (`evaluateStageReview` → `review.passed`/`review.blockers`)
4. Transient `status: "publishing"` flip (revert-on-failure)
5. Bespoke snapshot fields: `validationStatus`, `lastValidatedAt`, `versionLabel`, `changeNotes` (canonical's snapshot does not include these)
6. Post-publish `audit("catalog.bundle.published", ...)` via the procedure's own `audit()` helper — a **different audit channel** from canonical's `createCatalogAuditEvent`. Migrating would either duplicate audit rows or lose the procedure-side channel.

These five layers are tied to the user-facing publish workflow. Folding them into the canonical action would require:
- A `setEntryStatusToPublished?: boolean` input flag (or removing the auto-flip)
- Caller-provided snapshot fields (or extending canonical snapshot to include the four extras)
- A `skipCanonicalAudit?: boolean` flag (or accepting duplicate audit events)
- Caller-side `evaluateStageReview` decoupled from canonical (which is already the case — canonical accepts `policyDecision` as input)

These are canonical-action contract changes. Plan v3 architectural change. Out of Phase 35's "carry-forward cleanup" scope.

### 3. sandbox-wf snapshot fields drift modestly but tolerably

`sandbox-wf/seed-orchestrator.ts` Step C builds a snapshot with `entryId` (canonical uses `id`) and `versionLabel` (canonical does not include in snapshot, but accepts on the bundle row). The drift is tolerable on the snapshot side — `versionLabel` lives on the `agsCatalogPublishBundles.versionLabel` column already; `entryId` vs `id` has zero downstream readers (per repo-wide grep).

The status-flip from §1 is the dealbreaker, not the snapshot.

---

## Why we didn't extend canonical

Three options were on the table when §35.1 started:

| Option | Cost | Why rejected |
|---|---|---|
| **(a)** Add `policyViolations`, `setEntryStatusToPublished`, `customSnapshotFields`, `skipCanonicalAudit` flags to `PublishCatalogEntryInput` | Inflates canonical action surface; each flag is a behavior toggle | Anti-pattern. The canonical action becomes a thin pass-through that callers configure to no-op the canonical bits. Same shape as the synthetic-identity anti-pattern from §34 lesson #3. |
| **(b)** Remove canonical's flip-to-published auto-behavior | 7-line diff in `publishing.ts`; updates one test | Behavior change to a canonical action without an ADR. Production callers haven't validated the change's downstream impact (events, export-catalog, etc.). |
| **(c)** Pause-and-surface; defer migration to a phase that includes a canonical-action contract redesign + ADR | Migration doesn't ship in §35; architectural exception documented | **Picked.** Same protocol as §34 PMT identity mismatch. |

---

## What §35.1 ships

This PR ships **two unrelated cleanups** — the architectural exception document (this file) plus a mechanical orphan delete:

### A. This deferral document

Establishes the canonical-action contract gap as a named exception ("**publish-flip-to-published-mismatch**"), so future readers can grep for it and find the architectural rationale.

### B. `Agents/seed-orchestrator.ts` orphan delete

Pre-modular-refactor experimental seed file at the repo root (capital `A`). Imports `from "../db/catalog"` — a path that resolves to `db/catalog` at repo root, which **does not exist** since Phase 31.4 deleted `server/db/catalog.ts`. Zero references repository-wide:

```
$ grep -rn "Agents/seed-orchestrator" --include="*.ts" --include="*.json" --include="*.yaml" --include="*.md"
(zero matches)
```

The same WF-Orchestrator seed logic lives in `server/sandbox-wf/seed-orchestrator.ts` (Phase 34 migrated to gateway register). The `Agents/` directory's three companion data files (`wf-orchestrator-agents.{csv,json,yaml}`) also have zero references — deleted alongside the orphan.

**Net delete:** 4 files (1 broken `.ts`, 3 unreferenced data files), ~340 LOC.

---

## Future phase scope

When the canonical-action contract redesign is in scope, the future phase should:

1. **Decide on the post-publish entry status** — two real callers want `"active"`; canonical currently flips to `"published"`. Either remove the auto-flip and let callers manage status (matches reality), or add an opt-in flag.
2. **Decide on snapshot extensibility** — catalog-manage has four extra snapshot fields (`validationStatus`, `lastValidatedAt`, `versionLabel`, `changeNotes`). Either extend canonical snapshot to include them, or accept that catalog-manage builds its own snapshot and passes it through (caller-side snapshot pattern).
3. **Decide on audit duality** — catalog-manage emits via its own `audit()` helper (governance receipt channel); canonical emits via `createCatalogAuditEvent` (catalog audit row channel). Either canonicalize one channel, or accept dual emission.
4. **Migrate all three callers** in one bundle once the canonical contract matches reality.
5. **Consider whether `policyViolations` belongs on the canonical input** — the underlying `createPublishBundle` DB helper already accepts it; canonical doesn't expose it. Easy add when the contract redesign happens.

Proposed future scope name: **"PMB Phase X — `aiTypes.catalog.publish` canonical contract redesign for production callers"** + ADR.

---

## Carry-forward lessons (preview for §35.2 closure)

1. **A "behavior-preservation migration" is only behavior-preservation if the canonical's behavior matches what real callers do.** Canonical actions designed pre-caller (or with one hypothetical caller in mind) can drift from production reality. Audit caller-side state machines + audit channels + snapshot shapes BEFORE migration, not just import-shape compatibility.
2. **Pause-and-surface scales.** Phase 34 paused-and-surfaced PMT (caller-side identity mismatch). Phase 35 pauses-and-surfaces publish (canonical-side contract mismatch + caller-side machinery mismatch). The protocol is the same: ship the orthogonal cleanup, document the architectural exception, defer to a dedicated future phase.
3. **Zero production gateway callers ≠ contract is correct.** The canonical action existed since Phase 30; tests-only exercise meant the flip-to-published bug never surfaced. When migrating, expect to find latent contract drift in actions that have never been called from production.
4. **Orthogonal cleanups belong in pause-and-surface PRs.** `Agents/seed-orchestrator.ts` was an unrelated dead file; bundling its delete with the deferral document keeps the migration phase from being PR-zero.
