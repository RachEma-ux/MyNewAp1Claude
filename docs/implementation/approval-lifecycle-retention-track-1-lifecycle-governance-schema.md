# Approval-Lifecycle Retention — Track 1: Lifecycle-governance schema extension

**Status:** **SHIPPED ✓** (2026-05-13). Closed end-to-end via 17 PRs
(#682–#695, #699–#702). The eleven-step prerequisite sequence enumerated
below shipped in order; the three retention services are live on the
daily-sweep ladder at slots 18–20 UTC (90-day default per compliance-
significance rationale). The body of this document is preserved as
the **historical specification** for the work — future contributors who
hit a similar "schema-extension first" shape benefit from reading how
the deferral was framed *before* it shipped.

**Implementation reference:**
- 22-PR ledger and architectural summary: [Retention arc state-of-the-union §"Post-closure addendum"](./agent-studio-retention-arc-state-of-the-union.md#post-closure-addendum--approval-lifecycle-deferral-resolution-2026-05-13).
- Auto-memory record: `~/.claude/projects/-root/memory/project_approval_lifecycle_retention_complete.md`.
- Live-ASDB integration tests: `tests/integration/agent-studio/approval-lifecycle-retention.integration.test.ts` (20 cases, run via `pnpm run test:integration:staging`).

**Owner:** Shipped under the autonomous-execution authority recorded in
`feedback_autonomous_pmb_execution.md`.
**Source policy:** user 2026-05-12 §§0-9 (standing principle below) +
schema-gap audit 2026-05-12, with `agsNotePromotions` folded in 2026-05-13.
**Companion track:** [Track 2 — compliance archival workflow for
`agsReleaseAuditRefs`](./approval-lifecycle-retention-track-2-release-audit-refs-archival.md) **(SHIPPED at PRs #696–#698)**.
**Closure context:** [Retention arc state-of-the-union](./agent-studio-retention-arc-state-of-the-union.md).

## Standing principle (user §0)

> Do not weaken the retention predicate to fit the current schema. That
> would make the retention cron unsafe.

Schema first, retention second. Any future implementation that bypasses the
prerequisite sequence below is incorrect by construction.

## Scope tables

Track 1 owns retention prerequisites for **three** approval-lifecycle
tables. None may be added to the generic [`makeRetentionCron`
factory](../../server/agent-studio/services/retention/make-retention-cron.ts)
until every prerequisite below is satisfied.

| Table                  | Today's `state` / `status` vocabulary       | Phase  | Compliance shape                            |
| ---------------------- | ------------------------------------------- | ------ | ------------------------------------------- |
| `agsPublishRequests`   | `pending` \| `approved` \| `rejected` \| `withdrawn` | Phase 1 release pipeline | Approval ledger; FK target of `agsApprovalSteps` |
| `agsApprovalSteps`     | `pending` \| `approved` \| `rejected`       | Phase 1 release pipeline | Per-step approval ledger; FK to `agsPublishRequests` |
| `agsNotePromotions`    | `pending` \| `validating` \| `in_review` \| `approved` \| `rejected` \| `rolled_back` | Phase 10 note→graph promotion | Approval-bearing lifecycle row; carries `approvedByUserId`, `approvedAt`, `rejectedAt`, `rolledBackAt` |

Schema locations:
- `drizzle/tables/agent-studio.ts` lines ~564-600 (`agsPublishRequests`,
  `agsApprovalSteps`)
- `drizzle/tables/agent-studio-graph-promotion.ts` lines ~28-50
  (`agsNotePromotions`)

## Schema-gap audit (2026-05-12 / 2026-05-13)

The following gaps must be closed before retention is admissible. They
apply uniformly to all three Track 1 tables unless noted.

1. **Lifecycle state vocabulary is incomplete.**
   - `agsPublishRequests` needs additions: `cancelled`, `superseded`,
     `failed_terminal`.
   - `agsApprovalSteps` needs additions: `skipped`, `expired`,
     `cancelled`, `superseded`.
   - `agsNotePromotions` needs audit against the same set; today's
     `rolled_back` is the only explicit retire-after-active state.
2. **No canonical terminal-transition timestamp.** Age can only be
   computed from `createdAt` / `decidedAt` / `approvedAt` / `rejectedAt`.
   None of these is canonically "the moment the row reached its terminal
   state" — required to safely compute "row is older than retention window."
3. **No hold model at all.** Zero legal/audit/governance hold columns or
   reference rows. A retention sweep would happily delete rows under
   active legal hold.
4. **No active-deployment linkage.** `agsAgentReleases.state` is not
   classified into retention-blocker vs retention-eligible buckets; no
   separate `agsDeployments` table exists.
5. **No governance-review / audit-investigation linkage.** A row under
   open governance review or unresolved audit investigation has no schema
   way to surface "do not delete."
6. **`agsNotePromotions` Phase-10-specific gap:** rolled-back promotions
   may need a longer hold than the generic terminal-state window if the
   rollback is itself under review.

## Required schema-work sequence

The eleven steps below MUST complete in order. Steps 1-7 are schema;
step 8 is the derivation service; steps 9-11 are the retention surface
itself. Skipping ahead is unsafe.

1. **Extend lifecycle state vocabulary.** Add the missing terminal-states
   above to `agsPublishRequests` and `agsApprovalSteps`; audit
   `agsNotePromotions` for the same set.
2. **Add `terminalAt` + `terminalReason` columns** to all three tables.
   `terminalAt = null` for non-terminal rows; set exactly once when the
   lifecycle transitions to a terminal state. **Retention age must be
   computed from `terminalAt`, never from `createdAt`, `decidedAt`,
   `approvedAt`, or `rejectedAt`.**
3. **Add hold model.** Two implementation choices:
   - Inline columns per table: `legalHold` (bool) / `auditHold` (bool) /
     `governanceHold` (bool) / `holdReason` (text|null) / `holdSetBy`
     (text|null) / `holdSetAt` (timestamp|null) / `holdUntil`
     (timestamp|null), OR
   - **Preferred:** a shared `agsLifecycleHolds` reference table keyed by
     `(entityType, entityId, holdType)` — same model can serve multiple
     Agent Studio tables (and may absorb governance-review +
     audit-investigation linkage in step 6 if its `holdType` is
     open-set).
4. **Audit and standardize `agsAgentReleases.state` vocabulary.** Define
   `draft|pending|active|superseded|retired|failed|rolled_back` (or
   equivalent) and classify each as retention-blocker vs
   retention-eligible. Pin retention-blocker states explicitly:
   `active|pending|draft|rolled_back_under_review`. If deployment is
   conceptually separate from release, add `agsDeployments` +
   `agsDeploymentRefs` tables.
5. **Add active-release / active-deployment FK linkage.** A
   publish-request linked to an active release or deployment must be
   retention-blocked.
6. **Add governance-review + audit-investigation linkage.** Either
   inline status columns (`governanceReviewStatus`,
   `auditInvestigationStatus`) or reference tables
   (`agsGovernanceReviews`, `agsAuditInvestigations`). The shared
   `agsLifecycleHolds` table from step 3 can absorb these if its
   `holdType` is open-set.
7. **Backfill existing rows conservatively.** For approved/rejected/
   withdrawn rows with a reliable `decidedAt`, set `terminalAt =
   decidedAt`. For pending rows, `terminalAt = null`. For any row
   without a reliable timestamp, `terminalAt = null` — conservative null
   preserves the row from sweep until manual review.
8. **Add `isRetentionEligible` derivation service.** Returns
   `{ retentionEligible: boolean, retentionEligibleAt: Date|null,
   retentionBlockers: string[] }`. Derived from source-of-truth schema
   fields, never stored as truth.

   Blocker codes (non-exhaustive):
   - `NON_TERMINAL_STATE`
   - `ACTIVE_RELEASE_LINK`
   - `ACTIVE_DEPLOYMENT`
   - `LEGAL_HOLD`
   - `AUDIT_HOLD`
   - `GOVERNANCE_HOLD`
   - `OPEN_GOVERNANCE_REVIEW`
   - `UNRESOLVED_AUDIT_INVESTIGATION`
   - `PENDING_APPROVAL_CHAIN`
   - `MINIMUM_RETENTION_WINDOW_NOT_ELAPSED`

9. **Test the eligibility derivation service.** Cover every blocker code
   above. Tests must show that a row holding any single blocker is
   marked ineligible.
10. **Implement the retention service.** Mirrors the established prune
    pattern (DELETE…RETURNING, fail-soft on ASDB-null, empty-array
    short-circuit before the DB probe), but the eligibility predicate is
    `isRetentionEligible(...).retentionEligible === true` rather than an
    age-only check.
11. **Wire the cron.** Only after step 10's retention tests prove safe
    behavior end-to-end. Daily-sweep ladder slot to be assigned at that
    time; current ladder is 15 slots 03-17 UTC (see [state-of-the-union](./agent-studio-retention-arc-state-of-the-union.md)).

## Required tests at acceptance

Before any Track 1 retention service merges, the following must pass:

- Non-terminal publish requests not deleted
- Publish requests linked to active releases not deleted
- Publish requests linked to active deployments not deleted
- Publish requests under legal/audit/governance hold not deleted
- Publish requests linked to open governance review not deleted
- Publish requests linked to unresolved audit investigation not deleted
- Approval steps from pending approval chains not deleted
- Approval steps not deleted independently of parent lifecycle state
- Approval steps under hold not deleted
- Note promotions in non-terminal states (pending / validating /
  in_review) not deleted
- Rolled-back note promotions under review-hold not deleted
- Audit reconstruction fields preserved on every delete path
  (requester, artifact/version, request timestamp, decision state,
  decision timestamp, linked release/audit reference IDs)
- Procedure names are noun-qualified (see "Allowed procedure names"
  below)
- Retention factory is invoked **with** the eligibility predicate, never
  the generic age-only factory shape directly

## Allowed future procedure names

Only admissible after every prerequisite above is satisfied:

- `prunePublishRequestsRetention`
- `pruneApprovalStepsRetention`
- `pruneNotePromotionsRetention`

`pruneApprovalSteps` and `pruneNotePromotions` without the `Retention`
suffix already exist as user-driven CRUD operations on their respective
sub-routers; the `*Retention` suffix is what disambiguates the cron path.

## Forbidden shortcuts

The following are explicitly **not** acceptable workarounds:

- Pruning approval-lifecycle rows on `createdAt` or `decidedAt` instead
  of `terminalAt`.
- Adding any of the three Track 1 tables to the generic
  `makeRetentionCron` factory before steps 1-9 ship.
- Weakening the eligibility predicate to fit today's schema gaps.
- Treating `agsApprovalSteps` as independently prunable from its parent
  `agsPublishRequests` lifecycle state.
- Folding `agsReleaseAuditRefs` into Track 1 (it belongs to **Track 2**;
  it is **permanently excluded** from the generic factory pattern).

## Cross-references

- Track 2 (compliance archival): [`approval-lifecycle-retention-track-2-release-audit-refs-archival.md`](./approval-lifecycle-retention-track-2-release-audit-refs-archival.md)
- Retention arc state-of-the-union: [`agent-studio-retention-arc-state-of-the-union.md`](./agent-studio-retention-arc-state-of-the-union.md)
- Generic retention factory: [`server/agent-studio/services/retention/make-retention-cron.ts`](../../server/agent-studio/services/retention/make-retention-cron.ts)
  — its doc-block does NOT cover approval-lifecycle (correct).
- Schema files: `drizzle/tables/agent-studio.ts` (publish-requests +
  approval-steps), `drizzle/tables/agent-studio-graph-promotion.ts`
  (note-promotions).
