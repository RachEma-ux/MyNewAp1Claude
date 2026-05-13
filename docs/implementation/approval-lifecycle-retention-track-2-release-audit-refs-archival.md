# Approval-Lifecycle Retention — Track 2: Compliance archival workflow for `agsReleaseAuditRefs`

**Status:** **SHIPPED ✓** (2026-05-13) — service + tRPC + UI live at
PRs #696 / #697 / #698. The body of this document is preserved as the
**historical specification** plus standing-policy reference; the
deletion-blocked / 7-year-floor / generic-factory-exclusion invariants
documented below remain in force in the shipped code.

**Standing policy preserved:** Track 2 is **NOT** convertible to a
routine cron and **MUST NEVER** produce a `prune*Retention` procedure.
The shipped `archiveReleaseAuditRef` workflow + `deleteReleaseAuditRef`
always-throws marker enforce this at the service layer.

**Implementation reference:**
- Service: `server/agent-studio/services/release-audit-refs-archival.ts`.
- tRPC: `publishRouter` adminProcedures `listReleaseAuditRefsArchivalCandidates` + `archiveReleaseAuditRef` (#697).
- UI: `client/src/modules/agent-studio/pages/RetrofitPage.tsx` archival panel (#698).
- 22-PR ledger: [Retention arc state-of-the-union §"Post-closure addendum"](./agent-studio-retention-arc-state-of-the-union.md#post-closure-addendum--approval-lifecycle-deferral-resolution-2026-05-13).

**Owner:** Shipped under the autonomous-execution authority recorded in
`feedback_autonomous_pmb_execution.md`.
**Source policy:** user 2026-05-12 §§0-9 + schema-gap audit 2026-05-12.
**Companion track:** [Track 1 — lifecycle-governance schema extension](./approval-lifecycle-retention-track-1-lifecycle-governance-schema.md) **(SHIPPED at PRs #682–#695, #699–#702)**.
**Closure context:** [Retention arc state-of-the-union](./agent-studio-retention-arc-state-of-the-union.md).

## Why this is its own track

Track 1 is "approval-lifecycle retention is blocked on schema work."
Track 2 is **categorically different**: `agsReleaseAuditRefs` is not a
normal operational table that needs a tighter eligibility predicate. It
is an **audit/provenance long-retention record** whose entire purpose is
to survive the release lifecycle it documents.

Folding it into Track 1 would conflate "approval ledger" (Track 1's
shape, where rows ARE eventually retention-eligible once their
lifecycle terminates and holds release) with "audit reference" (Track
2's shape, where rows are eventually **archival**-eligible but rarely
deletion-eligible). The risk of conflation is that a future contributor
ships Track 1's generic factory pattern over `agsReleaseAuditRefs`,
which would be a compliance violation.

## Scope table

`agsReleaseAuditRefs` — defined at `drizzle/tables/agent-studio.ts`
lines ~602-615.

Schema today:
- `id`, `releaseId` (FK to `agsAgentReleases.id`), `auditSystem` (varchar
  64), `externalRef` (text), `payload` (jsonb), `createdAt`.
- One row per (release × external-audit-system) reference.
- No state vocabulary; no terminal timestamp; no hold model.

Classification: **long-retention compliance record.** Audit/provenance
preservation table. Not an operational cleanup target.

## Retention policy

**Default retention window:** Indefinite.

**If a finite value is later required** (e.g., by counsel or external
regulator): **minimum 7 years** after the associated release is retired,
superseded, or legally/audit-finalized. The 7-year floor is not subject
to operator-side override.

## Permanent exclusion rules

`agsReleaseAuditRefs` MUST NEVER appear in any of the following:

- The shared
  [`makeRetentionCron`](../../server/agent-studio/services/retention/make-retention-cron.ts)
  factory.
- The daily-sweep cron ladder (currently 15 slots 03-17 UTC).
- Any age-only cleanup job.
- Any operational retention sweep, whether new or extending an existing
  cron.

These exclusions are **permanent** — they do not unblock if Track 1
ships. The two tracks are independent.

## Forbidden procedure names

These names must NEVER be created in any sub-router:

- `pruneReleaseAuditRefsRetention`
- `pruneReleaseAuditRefs`
- Any `*-retention.ts` / `*-retention-cron.ts` module that targets
  `agsReleaseAuditRefs`

## Only admissible future workflow

A separate compliance-approved archival path, named (suggested):

- `archiveReleaseAuditRefsRetention`

This path is **separate from the generic retention factory.** It must
run as its own procedure with its own governance surface, not as a
factory-config call. The archival workflow is reviewed and approved by
compliance before any code change ships.

### Allowed archival lifecycle actions

- `archive` → allowed (move row + payload to long-term archival
  storage; primary key + audit-system reference preserved for
  reconstructability).
- `compact non-essential metadata` → allowed **only if** audit
  reconstruction remains intact end-to-end.
- `delete` → **blocked by default.**

### When deletion may be considered

Deletion may be considered if and only if **all** of the following are
true simultaneously:

1. Legal/compliance retention period has expired (≥ 7 years if a finite
   window is in effect; never under indefinite default).
2. No legal hold exists on the associated release or referenced audit
   record.
3. No audit hold exists.
4. No governance hold exists.
5. No active audit or investigation references the row.
6. The associated release is no longer active and not under any review.
7. **Explicit governance/compliance approval exists for this specific
   delete.** The approval is per-row or per-batch, not blanket; it is
   logged at the time of approval, not retroactively.

If any condition fails, the only allowed action is `archive` or
`compact`. There is no fall-through to deletion.

## Forbidden shortcuts

The following are explicitly **not** acceptable, even with operator or
admin authorization:

- Adding `agsReleaseAuditRefs` to `makeRetentionCron` "to keep table
  count growing nicely with the rest of the ladder."
- Pruning `agsReleaseAuditRefs` rows whose `releaseId` points to a
  retired release without going through the archival workflow.
- Implementing the archival workflow as a fork of the generic prune
  service pattern; the two have different policy shapes and the shared
  scaffolding would invite future drift.
- Treating Track 1 closure as unblocking Track 2's permanent exclusion.

## Cross-references

- Track 1 (lifecycle-governance schema): [`approval-lifecycle-retention-track-1-lifecycle-governance-schema.md`](./approval-lifecycle-retention-track-1-lifecycle-governance-schema.md)
- Retention arc state-of-the-union: [`agent-studio-retention-arc-state-of-the-union.md`](./agent-studio-retention-arc-state-of-the-union.md)
- Generic retention factory (must NOT be used here): [`server/agent-studio/services/retention/make-retention-cron.ts`](../../server/agent-studio/services/retention/make-retention-cron.ts)
- Schema: `drizzle/tables/agent-studio.ts` lines ~602-615
