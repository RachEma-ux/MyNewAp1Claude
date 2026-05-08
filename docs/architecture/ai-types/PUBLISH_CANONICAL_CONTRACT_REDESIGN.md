# ADR: `aiTypes.catalog.publish` canonical contract redesign

**Status:** Proposed (Phase 36.0).
**Captured:** 2026-05-08.
**Supersedes:** the original Phase 30 contract (informally documented in `manifest.ts` + `publishing.ts` JSDoc).
**Tracking:** `publish-flip-to-published-mismatch` architectural exception (named in `docs/architecture/provider-model-binding/PHASE_35_PUBLISH_MIGRATION_DEFERRAL.md`).

---

## Context

`aiTypes.catalog.publish` was registered as a high-risk receipt-required gateway action in Phase 30, with `publishCatalogEntry` (in `server/ai-types/publishing.ts`) as its handler. The handler, as designed, had an opinionated post-publish behavior:

```ts
if (entry.status !== "published") {
  await updateCatalogEntry(input.catalogEntryId, { status: "published" }, input.publishedBy);
}
```

**Phase 35 surfaced** that this behavior conflicts with all production-shape callers:

- `server/routers/catalog-manage.ts:1192` explicitly resets entry status to `"active"` after calling `createPublishBundle` — the procedure's "Restore to active after publishing" step.
- `server/sandbox-wf/seed-orchestrator.ts` requires `status === "active"` for **gate 5 of the 10 execution gates** documented at `seed-orchestrator.ts:9`. Migrating to canonical would flip status to `"published"`, fail gate 5, and render the seed agents non-executable.

**Production gateway-call sites of `aiTypes.catalog.publish`: zero.** Only `tests/pmb/wiring.test.ts` exercises the action manifest. The contract drift had never surfaced because no production caller ever invoked the canonical action.

## Decision

**The canonical action no longer mutates entry status.** Caller-side concern.

Rationale:

1. **Real-caller alignment.** The two production-shape callers both want `status === "active"` post-publish. The canonical's flip-to-published auto-behavior was a hypothetical contract validated only by tests; removing it aligns canonical with how callers actually want to use it.

2. **Separation of concerns.** Bundle creation (immutable snapshot, supersession of prior active bundle, audit row, lifecycle event) is the canonical action's value-add. Entry state machine transitions (`draft → publishing → active`, `active → deprecated`, etc.) are caller-side workflow concerns. Conflating them in the canonical limited reusability.

3. **Zero blast radius.** No production gateway caller exists. The single test that depends on the flip behavior (`publishing.test.ts:145-154`) needs a one-line wording adjustment.

4. **Avoids the synthetic-identity anti-pattern (§34 lesson #3).** The rejected alternative — adding a `setEntryStatusToPublished?: boolean` opt-in flag — would have made the canonical a thin pass-through that callers configure to no-op. Removing the behavior outright is the cleaner shape.

## Contract (post-redesign)

```ts
export interface PublishCatalogEntryInput {
  catalogEntryId: number;
  publishedBy: number;
  versionLabel?: string;
  policyDecision?: string;
}

export interface PublishCatalogEntryResult {
  bundle: PublishBundle;
  versionLabel: string;
}
```

`publishCatalogEntry` does:

1. Fetch entry by id (throws if missing).
2. Build immutable snapshot from entry fields (canonical snapshot shape).
3. Compute snapshot hash.
4. Supersede any prior active publish bundle.
5. Insert the new bundle row.
6. Record a `catalog.publish` catalog audit event.
7. Emit `aiTypes.catalog.published` envelope (best-effort; bus failures don't roll back).

`publishCatalogEntry` does **NOT**:

- Mutate `catalog_entries.status`. **Caller-side concern.**
- Run policy gates / Triple Validation. **Caller-side concern.**
- Build caller-specific snapshot fields (`changeNotes`, `versionLabel` in snapshot, `validationStatus`, `lastValidatedAt`). Callers that need extra snapshot fields stay on direct `createPublishBundle`.

## Consequences

### Positive

- Sandbox-wf can migrate cleanly to `gatewayCall("aiTypes.catalog.publish", ...)` without breaking gate 5.
- Future system-actor publish callers can use canonical without status-flip side effects.
- Canonical action becomes a focused, composable primitive.

### Neutral

- `server/agent-studio/services/export-catalog.ts:549`'s branch (`if (catalog.status === "published")`) becomes dead-but-safe. It can be removed in a future cleanup phase or left as a safety net for any future caller that opts to set `status = "published"` directly.

### Negative / Architectural exceptions left open

- **`catalog-manage-bespoke-publish-machinery` permanent exception.** The `catalog-manage.ts` publish procedure has six bespoke layers (stage-review validation, dependency guard, Triple Validation, transient `publishing` status, snapshot extras, separate audit channel via its own `audit()` helper). These are caller-side business logic; they don't fold into canonical without behavior-toggle flags. catalog-manage stays on direct `createPublishBundle` permanently.

- **`policyViolations` exposure on canonical input deferred.** Only catalog-manage needs it; catalog-manage isn't migrating. Re-evaluate if a future caller needs the field.

## Implementation

Phase 36.1 will:

- Remove the flip-to-published block in `publishing.ts:94-100`.
- Update JSDoc in `publishing.ts:5-13` and `manifest.ts:73`.
- Adjust `publishing.test.ts:145-154` (idempotent-emit assertion becomes universal).
- Add a contract test: "publish never mutates entry status."

Phase 36.2 will migrate `sandbox-wf/seed-orchestrator.ts` Step C to the gateway-call path.

## Alternatives considered

### Alt 1 — Add `setEntryStatusToPublished?: boolean` opt-in flag

**Rejected.** Synthetic-identity anti-pattern. Canonical becomes a thin pass-through; callers configure it to no-op the canonical bits. Mirrors the rejection from Phase 35.1's deferral analysis.

### Alt 2 — Keep flip-to-published; force callers to opt out

**Rejected.** Forces every caller to re-set status post-call. Inverts the responsibility from canonical (one place) to all callers (many places). Worse ergonomics + duplicates entry-state knowledge across call sites.

### Alt 3 — Make the canonical accept caller-provided snapshot

**Rejected as part of this redesign.** Out of scope. catalog-manage's snapshot extras are caller-side workflow data, not canonical-action concerns. catalog-manage stays on direct `createPublishBundle`. If a future caller needs snapshot pass-through, evaluate it separately.

### Alt 4 — Pause-and-surface again; defer canonical change indefinitely

**Rejected.** Two pause-and-surface phases in a row already named two architectural exceptions. Generating a third deferral without progress on the first two is the spiral the standing instruction's heuristic #1 (direct carry-forward) is meant to avoid.

---

## Cross-references

- `docs/architecture/provider-model-binding/PHASE_35_PUBLISH_MIGRATION_DEFERRAL.md` — original surfacing of the mismatch.
- `docs/evidence/provider-model-binding/PHASE_35_CLOSURE_REPORT.md` — closure-report framing of the future scope.
- `docs/architecture/provider-model-binding/PHASE_36_EXECUTION_PLAN.md` — implementation plan.
- `server/ai-types/publishing.ts` — handler being redesigned.
- `server/ai-types/publishing.test.ts` — test surface.
- `server/sandbox-wf/seed-orchestrator.ts` — first caller to migrate after redesign.
- `server/routers/catalog-manage.ts` — permanent direct-call caller (`catalog-manage-bespoke-publish-machinery` exception).
