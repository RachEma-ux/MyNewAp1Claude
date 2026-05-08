# Phase 35 — Closure Report

**Captured:** 2026-05-08 against `main@7746529` (post-Phase-35.1 merge).
**Branch (this doc):** `docs/pmb-phase-35-2-closure-report`.
**Owner:** Planner + Governance roles per AGENTS.md.

---

## TL;DR

Phase 35 was the **second phase under the continuous-execution standing instruction** and the **second phase to pause-and-surface a structural mismatch mid-execution**. Plan freeze (§35.0) called for migrating 3 direct `createPublishBundle` callers to `gatewayCall("aiTypes.catalog.publish", ...)`. Mid-execution audit (§35.1) surfaced a deeper gap: the canonical action's contract conflicts with what real callers expect.

The phase shipped a **mid-execution scope reduction**: pause-and-surface the migration; document the architectural exception (`publish-flip-to-published-mismatch`); ship only the orthogonal `Agents/` orphan delete. Migration is deferred to a future phase scoped explicitly as a canonical-action contract redesign + ADR.

3 PRs total. **Zero new TEMPORARY_EXCEPTION_WITH_DEADLINEs.** CI fingerprint stayed at 5/5 green throughout. Net code change: −340 LOC (orphan delete; no migration).

---

## PR ledger

| Sub-phase | PR | Merge SHA | Title |
|---|---|---|---|
| 35.0 | [#274](https://github.com/RachEma-ux/MyNewAp1Claude/pull/274) | `3ca26d7` | Plan freeze + pre-flight audit |
| 35.1 | [#275](https://github.com/RachEma-ux/MyNewAp1Claude/pull/275) | `7746529` | Pause-and-surface publish migration; orphan delete |
| 35.2 | (this PR) | (TBD) | Closure report |

**Total: 3 PRs** — same shape as Phases 32, 33, 34.

---

## Pause-and-surface — `publish-flip-to-published-mismatch` exception

### What surfaced (mid-§35.1)

The §35.0 pre-flight audit checked **call-site shape** (3 callers, canonical action exists, input field gap on `policyViolations`). That audit was correct as far as it went, but it **missed two layers** that surfaced when §35.1 actually started reading caller bodies:

#### Layer 1 — Canonical's "flip to published" auto-behavior

`server/ai-types/publishing.ts:94-100`:

```ts
if (entry.status !== "published") {
  await updateCatalogEntry(
    input.catalogEntryId,
    { status: "published" },
    input.publishedBy,
  );
}
```

Real callers want post-publish `status === "active"`, not `"published"`:

- **catalog-manage** explicitly sets status back to `"active"` post-publish (`catalog-manage.ts:1192`).
- **sandbox-wf** relies on `status === "active"` for **gate 5 of the 10 execution gates** documented at `seed-orchestrator.ts:9`. Migrating to canonical would flip status to `"published"` and break gate 5 — the seed agents would no longer be runnable.

**Production gateway-call sites of `aiTypes.catalog.publish`: zero.** Only `tests/pmb/wiring.test.ts` exercises the action manifest. The contract's status-flip behavior has never been validated against a production caller.

#### Layer 2 — catalog-manage has bespoke machinery on both sides of the publish

The `catalog-manage.ts` publish procedure (lines 1100-1205):

1. Stage-review validation gate (`register` + `validate` must be `approved`)
2. Dependency guard for model/llm types (upstream provider availability)
3. Triple Validation (`evaluateStageReview` → `review.passed` / `review.blockers`)
4. Transient `status: "publishing"` flip with revert-on-failure
5. Bespoke snapshot fields: `validationStatus`, `lastValidatedAt`, `versionLabel`, `changeNotes` (canonical does not include)
6. Post-publish `audit("catalog.bundle.published", ...)` via the procedure's own helper — a **different audit channel** from canonical's `createCatalogAuditEvent`. Migration would either duplicate audit rows or lose the procedure-side channel.

These six layers are tied to the user-facing publish workflow. They don't fold into the canonical action without behavior-toggle flags, which is exactly the synthetic-identity anti-pattern from §34 lesson #3.

### Decision: pause-and-surface

Three options on the table:

| Option | Why rejected |
|---|---|
| **(a)** Add `policyViolations`, `setEntryStatusToPublished`, `customSnapshotFields`, `skipCanonicalAudit` flags to `PublishCatalogEntryInput` | Canonical becomes a thin pass-through that callers configure to no-op the canonical bits. Synthetic-identity anti-pattern. |
| **(b)** Remove canonical's flip-to-published auto-behavior | Behavior change to a canonical action without an ADR. Downstream impact (events, export-catalog `status === "published"` reader at line 549) not vetted. |
| **(c)** Pause-and-surface; document; defer to a phase with a canonical-action contract redesign + ADR | **Picked.** Same protocol as §34 PMT identity mismatch. |

Architectural exception name: **`publish-flip-to-published-mismatch`**. Future readers can grep for that phrase to find the rationale (in `PHASE_35_PUBLISH_MIGRATION_DEFERRAL.md` and this report) and the proposed future scope.

### Future phase scope

Proposed: **"PMB Phase X — `aiTypes.catalog.publish` canonical contract redesign for production callers"** + ADR. Decisions in scope:

1. Post-publish entry status — keep auto-flip, remove it, or make opt-in?
2. Snapshot extensibility — fold catalog-manage's four extras into canonical's snapshot, or accept a caller-provided-snapshot pattern?
3. Audit duality — canonicalize `audit()` vs `createCatalogAuditEvent`, or accept dual emission?
4. `policyViolations` exposure on canonical input.
5. Migration of all three callers in one bundle once contract matches reality.

---

## What §35 actually shipped

### `Agents/` orphan delete

Pre-modular-refactor experimental seed file at the repo root (capital `A`). 4 files removed (~340 LOC):

- `Agents/seed-orchestrator.ts` — broken imports (`from "../db/catalog"` resolves to a non-existent path after §31.4 deleted `server/db/catalog.ts`)
- `Agents/wf-orchestrator-agents.csv`
- `Agents/wf-orchestrator-agents.json`
- `Agents/wf-orchestrator-agents.yaml`

Zero references to any of these files repository-wide. The same WF-Orchestrator seed logic lives in `server/sandbox-wf/seed-orchestrator.ts` (Phase 34 migrated to gateway register).

### Architectural exception document

`docs/architecture/provider-model-binding/PHASE_35_PUBLISH_MIGRATION_DEFERRAL.md` — establishes `publish-flip-to-published-mismatch` as a named exception, captures the three-options-rejected analysis, and proposes the future-phase scope.

### Decision matrix outcomes (vs. plan §4)

| # | Plan decision | Outcome | Notes |
|---|---|---|---|
| 1 | Extend `PublishCatalogEntryInput` with `policyViolations` | **Deferred** — folds into the future canonical-contract-redesign phase |
| 2 | catalog-manage `publishedBy: 1` → `ctx.user.id` | **Deferred** — behavior-fix carried to future phase (still wrong; flagged in deferral doc) |
| 3 | catalog-manage revert-on-failure block | **Deferred** — pause-and-surface |
| 4 | catalog-manage `audit("catalog.bundle.published")` call | **Deferred** — audit duality is one of the future-phase decisions |
| 5 | Sandbox-wf snapshot building | **Deferred** — gate-5 conflict pause-and-surface |
| 6 | `Agents/seed-orchestrator.ts` | **Locked — deleted** | Mechanical orphan cleanup; orthogonal to migration |
| 7 | `Agents/wf-orchestrator-agents.{csv,json,yaml}` | **Locked — deleted** | All three confirmed zero references |
| 8 | Receipt sourcing (sandbox-wf publish) | **N/A** | Migration deferred |
| 9 | Receipt sourcing (catalog-manage publish) | **N/A** | Migration deferred |

**Cap: 0 / 0 allowed new exceptions.** Used: 0. Architectural exception (`publish-flip-to-published-mismatch`) is documented, not a TEMPORARY_EXCEPTION_WITH_DEADLINE.

---

## Lessons (carry-forward for Phase 36+)

1. **Pre-flight audits should read caller bodies, not just call-site shapes.** The §35.0 audit confirmed 3 callers exist, the canonical action exists, and there's an input gap (`policyViolations`). All correct. What it missed: the canonical's status-flip behavior conflicts with real callers; catalog-manage has bespoke pre/post-publish machinery; sandbox-wf's seed pattern depends on `status === "active"`. Future migration audits should add: "for each caller, what does the post-action state look like, and does canonical produce that state?" If no, surface as a structural blocker before §X.1 starts. (This is the dual of §34 lesson #1 — input-shape audits matter; output-state audits matter equally.)

2. **Zero production gateway callers ≠ canonical contract is correct.** `aiTypes.catalog.publish` was registered in Phase 30 and has been live for two phases. Tests-only exercise meant the flip-to-published bug never surfaced. Other dormant canonical actions (manifest-registered but unrouted) deserve a once-over before being treated as "ready for caller migration." A canonical action's contract is only validated by production callers — until then, it's a hypothesis.

3. **Pause-and-surface is now the standing pattern for canonical-mismatch detection.** Phase 34 paused-and-surfaced PMT (caller-side identity mismatch with register's input). Phase 35 pauses-and-surfaces publish (canonical-side contract mismatch with caller expectations + caller-side machinery mismatch). Two phases in a row, same protocol: ship the orthogonal cleanup, document the architectural exception, defer to a dedicated future phase. This is becoming the rhythm of the tail end of Plan v3 — surface deferred items have hidden architectural shapes that need their own phases, not bulk migration sweeps.

4. **Orthogonal cleanups belong in pause-and-surface PRs.** §35.1's `Agents/` orphan delete was unrelated to the publish migration but kept the PR from being PR-zero. Bundling unrelated mechanical cleanups with deferral documents:
   (a) makes the PR ship something concrete,
   (b) clears unrelated tech debt that would otherwise rot,
   (c) doesn't muddy the architectural-exception story (orphan delete is in its own commit/section). The §34 closure didn't have an orthogonal cleanup; §35.1 did. Future pause-and-surface PRs should look for one.

5. **Name the architectural exception inside the deferral PR, not just the closure report.** §34's closure report named "PMT self-registration identity mismatch." §35.1's PR (the deferral itself) named `publish-flip-to-published-mismatch`. Naming the exception **at the moment of pause** (in the PR body + the deferral doc) means the canonical phrase is searchable from the moment the architectural debt is recorded — not just after the closure report lands.

---

## CI fingerprint

| Phase 35 PR | Status |
|---|---|
| #274 (35.0 plan) | 5/5 ✅ first try |
| #275 (35.1 deferral + orphan delete) | 5/5 ✅ first try |
| (this PR — closure report) | (expected 5/5) |

**Phase 35 baseline: 5/5 green throughout.** No regressions; no flaky reruns.

---

## Memory updates after this PR

- `MEMORY.md` — Phase 35 entry flips to CLOSED.
- `project_phase_35_authority.md` — flipped to CLOSED with PR ledger + `publish-flip-to-published-mismatch` exception note.
- `project_pmb_phase_35_complete.md` — created with PR ledger + the 5 carry-forward lessons above.
- `project_rac_progress.md` — updated to point at `main@<this-PR-merge-sha>` with Phase 35 marked CLOSED.
