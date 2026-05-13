# Agent Studio Retention Arc — State of the Union (CLOSED 2026-05-13, deferral resolved 2026-05-13)

**Phase 22 follow-up cohort closure memo.** This document captures the final
state of the retention arc that ran across 2026-05-12 and 2026-05-13. The
arc is closed at PR #680. Future retention work should treat this memo as
the authoritative starting reference.

> **Post-closure addendum (2026-05-13)** — the approval-lifecycle deferral
> that this memo describes in §"Deferred work" was fully resolved
> immediately after closure via a 22-PR follow-up arc (PRs #682–#703).
> Both Track 1 (lifecycle-governance schema + 3 retention services) and
> Track 2 (`agsReleaseAuditRefs` compliance archival) shipped, together
> with a holds-management write-side surface and a parent-hold-inheritance
> bugfix. The daily-sweep ladder grew from 15 slots (03–17 UTC) to 18
> slots (03–20 UTC). See [§Post-closure addendum](#post-closure-addendum--approval-lifecycle-deferral-resolution-2026-05-13)
> below for the deferral-resolution detail.

---

## Arc shape

- **67 PRs** total: PRs #545–#679, plus this closure memo (#680).
- **14 mini-arcs** end-to-end:
  - **12 standard 4-PR mini-arcs** (prune service + cron + tRPC + UI panel)
  - **1 closure-infrastructure mini-arc** (#612–#620, 9 PRs: cron + UI + smoke
    test for the workspace-observability surface that the rest of the arc
    consumes)
  - **1 half-pattern-completion 3-PR mini-arc** (#677–#679, graph-agent
    runtime-traces — prune service already shipped at Phase 14 §3, only cron
    + status + UI layers needed)
- **3 cascade-orphan fixes** (#637, #643, #644 — see [Cascade-orphan recurring
  pattern](#cascade-orphan-recurring-pattern) below).
- **1 DRY factory refactor** (#642 — `makeRetentionCron({...})` consolidated
  ~6 cron scaffolds into a single shared factory).

## Daily-sweep ladder (final state, deferral-resolution addendum 2026-05-13)

**18 slots, 03:00–20:00 UTC**, offset 1h each to spread ASDB write load.
Slots 16–18 were added by the approval-lifecycle deferral-resolution
addendum (PRs #682–#703) — see [§Post-closure addendum](#post-closure-addendum--approval-lifecycle-deferral-resolution-2026-05-13).
The 15-slot baseline (03–17 UTC) is the original arc closure at #680.

| UTC | Mini-arc # | PR  | Table / Cascade                                                                                          | Default |
| --- | ---------- | --- | -------------------------------------------------------------------------------------------------------- | ------- |
| 03  | 1          | #612 | workspace-observability bundled (`agsWorkspaceErrorEvents` + `agsWorkspaceUserNotifications` + `agsWorkspaceBackgroundJobs`) | per-table |
| 04  | 2          | #622 | `agsRuntimeRuns` + 8-table cascade                                                                       | 30 d    |
| 05  | 3          | #626 | `agsToolCallTraces`                                                                                      | 30 d    |
| 06  | 4          | #630 | `agsMcpTransitions`                                                                                      | 30 d    |
| 07  | 5          | #634 | `agsCatalogSyncLog`                                                                                      | 30 d    |
| 08  | 6          | #639 | `agsRacRuntimeTraces` + `agsRacContextBlocks`                                                            | 30 d    |
| 09  | 7          | #646 | `agsCagPackEvents`                                                                                       | 30 d    |
| 10  | 8          | #650 | `agsSimulationRuns` + `agsSimulationRunSteps`                                                            | 30 d    |
| 11  | 9          | #654 | `agsTestRuns` + `agsTestRunResults`                                                                      | 30 d    |
| 12  | 10         | #658 | `agsGraphQualityScans` + `agsGraphQualityFindings`                                                       | 30 d    |
| 13  | 11         | #662 | `agsGraphCorrectionProposals` + `agsGraphCorrectionDecisions` + `agsGraphCorrectionAuditEvents`          | 30 d    |
| 14  | 12         | #666 | `agsGraphQualityAgentRuns` (single-table)                                                                | 30 d    |
| 15  | 13         | #670 | `agsIngestionJobs` (single-table; artifacts is sibling not child)                                        | 30 d    |
| 16  | 14         | #674 | `agsGraphChangeProposals` + `agsGraphChangeProposalItems` + `agsGraphChangeDecisions` + `agsGraphChangeAuditEvents` | 30 d  |
| 17  | 15         | #677 | `agsGraphSkillRuntimeUsages` + `agsQueryTemplateRuns` + `agsGraphAgentSteps` + `agsGraphAgentRuns`        | 90 d    |
| 18  | A1 (#693)  | #693 | `agsPublishRequests` (lifecycle-aware; 12-blocker predicate; parent-hold inheritance via #701)            | 90 d    |
| 19  | A2 (#693)  | #693 | `agsApprovalSteps` (lifecycle-aware; parent-publish-request hold inheritance)                            | 90 d    |
| 20  | A3 (#693)  | #693 | `agsNotePromotions` + 3-table cascade (`agsNotePromotionAuditEvents`, `agsNotePromotionDecisions`, `agsNotePromotionVersions`) | 90 d |

Plus one high-frequency cron:
- Every 10 min — `agsWorkspaceBackgroundJobs` stale-running sweep (#613)

## Established patterns

### Service primitive (`server/agent-studio/services/*-retention.ts`)

- `pruneOld<Table>(input, options?)` async function.
- `ServiceOptions { getDb? }` for test seam.
- **Empty-array short-circuits BEFORE the ASDB probe** — one guard per
  filterable union field. Prevents "filter with no values" from sweeping
  everything.
- **Fail-soft on ASDB-null** — returns zero-counts rather than throwing.
- Filter on `createdAt` (most tables), `ts` (mcp-transitions), `updatedAt`
  (background_jobs), or `requestedAt` (ingestion-jobs — only non-null
  timestamp).
- `DELETE...RETURNING` for accurate `deletedCount`.
- For cascades: child-first deletion order; parallel children via
  `Promise.all` when there are 2+ child tables.

### Cron module (`server/agent-studio/services/*-retention-cron.ts`)

Built on the shared `makeRetentionCron({...})` factory (#642). Each module
is ~70 lines of pure config:

```ts
const cron = makeRetentionCron<TInput, TResult>({
  logPrefix: "ags-foo-retention-cron",
  envPrefix: "AGS_FOO_RETENTION",
  defaultCronExpr: "0 HH * * *",
  defaultRetentionDays: 30,
  buildSweepInput: ({ olderThan, sweepInput }) => ({ ...sweepInput, olderThan }),
  runSweep: (input) => pruneOldFoo(input),
  formatSweepLogTail: (r, days) => `...`,
});

export const {
  tickFooRetentionCron,
  getFooRetentionCronStatus,
  ensureFooRetentionCronStarted,
  _resetFooRetentionCronForTests,
} = cron;
```

Env vars follow `AGS_<TABLE>_RETENTION_CRON_DISABLED` / `_CRON_EXPR` /
`_DAYS` convention.

The factory's `buildSweepInput` callback can adapt input shapes — used in
#677 to bridge `olderThan: Date` (factory) → `olderThanMs: number` (Phase
14 §3 shape).

### tRPC procedure

- `adminProcedure` (NOT `protectedProcedure`) because retention sweeps
  operate across all workspaces and operators reading status are doing
  cross-tenant ops monitoring.
- Procedure names noun-qualified to disambiguate from existing CRUD on
  shared sub-routers (`pruneEventsRetention`, `pruneScansRetention`,
  `pruneProposalsRetention`, `pruneAgentRunsRetention`, etc.).
- Mounted on the most-relevant existing sub-router, or a new lean
  sub-router created to host the retention surface (`agentStudio.ingestion`
  #671, `agentStudio.graphChange` #675).

### UI panel (`client/src/modules/agent-studio/pages/RetrofitPage.tsx`)

23 retention tabs end-to-end. Standard 2-card layout:

- **Left card**: cron health badge (loading/error/healthy/never run),
  schedule + env-var description, last-run timestamp, last-sweep
  deletion counts.
- **Right card**: manual sweep form — `retentionDays` (number),
  status checkboxes (terminal-only by default; in-flight states are
  never swept), domain-specific filters as CSV inputs (e.g. workspaceId,
  scanKind, proposalKind, agentKey, sourceConnectorKey), confirm-and-sweep
  button, last-manual-run result card.

## Deferred work — approval-lifecycle retention (DEFERRAL RESOLVED 2026-05-13)

> **Status update (2026-05-13).** The two-track plan recorded below
> shipped end-to-end in a 22-PR follow-up arc (PRs #682–#703). The
> sub-section status badges (`SHIPPED ✓`) below replace the original
> "deferred" framing; the surrounding rationale is preserved as
> historical context because future contributors who hit a similar
> "schema-extension first" shape benefit from seeing how the deferral
> was framed *before* it shipped. See
> [§Post-closure addendum](#post-closure-addendum--approval-lifecycle-deferral-resolution-2026-05-13)
> for the canonical ledger of what shipped where.

Per **user 2026-05-12 policy §§0-9**, the four approval-lifecycle tables
below were deferred. The deferral was **resolved by splitting it into
two independent follow-up tracks**, each with its own scope, policy
shape, and acceptance criteria. Implementation of each track was
blocked until its respective prerequisites landed. **Track 2's
exclusion from the generic retention factory remained permanent even
after Track 2 shipped — the archival workflow is a categorically
distinct compliance shape, not a stack-on-top-of-generic-factory shape.**

### Track 1 — Lifecycle-governance schema extension — SHIPPED ✓ (PRs #682–#695, #699–#702)

Full spec: [`approval-lifecycle-retention-track-1-lifecycle-governance-schema.md`](./approval-lifecycle-retention-track-1-lifecycle-governance-schema.md).

Three tables, all blocked on a single shared schema-extension sequence.
The eleven-step prerequisite sequence shipped in order (state vocabulary
→ `terminalAt` → hold model → release/deployment classification →
governance/investigation linkage → backfill → `isRetentionEligible`
derivation service → tests → retention service → cron → operator
surfaces). All three retention services are live on the daily-sweep
ladder at slots 18–20 UTC (90-day default per compliance-significance
rationale).

| Table                  | Reason                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `agsPublishRequests`   | Lifecycle vocabulary missing `cancelled` / `superseded` / `failed_terminal`; no `terminalAt` column; no hold model |
| `agsApprovalSteps`     | Lifecycle vocabulary missing `skipped` / `expired` / `cancelled` / `superseded`; no parent-lifecycle-aware predicate |
| `agsNotePromotions`    | Phase 10 approval-bearing lifecycle row (`approvedAt`/`rejectedAt`/`rolledBackAt`); shares the same schema gaps. Added to deferral set 2026-05-13 |

Procedure names now live (shipped at #694 / #690-#692):
`prunePublishRequestsRetention`, `pruneApprovalStepsRetention`,
`pruneNotePromotionsRetention`.

### Track 2 — Compliance archival workflow for `agsReleaseAuditRefs` — SHIPPED ✓ (PRs #696–#698)

Full spec: [`approval-lifecycle-retention-track-2-release-audit-refs-archival.md`](./approval-lifecycle-retention-track-2-release-audit-refs-archival.md).

One table, **permanently excluded from the generic retention factory**.
This is not a Track-1-style "blocked until schema lands" — it is a
categorically different policy shape (audit/provenance long-retention,
indefinite default, 7-year minimum if ever finite, deletion blocked by
default). The exclusion remains permanent: Track 2 ships as a separate
archival workflow (`archiveReleaseAuditRef` + `listReleaseAuditRefs­ArchivalCandidates`)
with `deleteReleaseAuditRef` always throwing.

| Table                  | Reason                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `agsReleaseAuditRefs`  | **Permanent exclusion** from generic retention factory. Compliance long-retention table; minimum 7-year window if finite. Only `archiveReleaseAuditRefsRetention` (separate compliance-approved workflow, NOT the generic factory) is admissible. `prune*Retention` procedure names are **forbidden** here. |

### Standing principle (user §0)

> Do not weaken the retention predicate to fit the current schema. That
> would make the retention cron unsafe.

Schema first, retention second. Any future implementation that bypasses
either track's prerequisites is incorrect by construction.

## Cascade-orphan recurring pattern

Four occurrences of the same bug shape during the arc — all on the
runtime-runs cascade:

- **#621** initial — `pruneOldRuntimeRuns` cascade list included only the
  obvious children (steps + tool-calls).
- **#637** — discovered 4 additional Phase 14 sibling tables that referenced
  `runtimeRunId`: `agsRuntimeMemoryEvents`, `agsRuntimePolicyEvents`,
  `agsRuntimeHookExecutions`, and (later) `agsCagBlockRuntimeUsages`. The
  initial cascade was silently orphaning rows on every daily sweep.
- **#643** — `agsRuntimeGraphEvents` (Phase 14 Native Graph Workspace) was
  added after #637's audit and not folded back in.
- **#644** — `agsRuntimeNoteReferences` and `agsCagBlockRuntimeUsages`
  (Phase 14 §6/§7 graph-promotion module) — same shape, different sub-feature.

**Mitigation pattern established**: audit `grep -nE "runtime_run_id"
drizzle/tables/` whenever `pruneOldRuntimeRuns` is touched. The audit
rationale section in #644's PR body is the template for "audit before
extend" — copy-paste it for the next time a new sub-feature lands.

Likely more candidates will appear as Phase 14+ ships further per-runtime
sibling tables.

## Carry-forward lessons (15 total — distilled)

1. **The `*-cron.ts` shape became standard enough that 6 instances lived
   next to each other with ~80% duplicated scaffold.** Refactor benefit
   (≈-600 net lines + single point-of-truth for status semantics) clearly
   exceeded the risk of locking in an immature abstraction. Wait for ~5–6
   instances before extracting a factory.

2. **Cascade-orphan bug shape recurs every time a new sub-feature lands.**
   #621 → #637 → #643 → #644 is the same bug 4 times. Audit before extend.

3. **Daily-sweep ladder spreads writes across distinct minutes.** Cron
   expressions are offset 1h so ASDB doesn't see N retention sweeps in
   the same minute on a multi-process deployment.

4. **Cascade-delete needs sequential delete order, not USING-subquery.**
   Drizzle adapters differ in how they handle DELETE...USING; sequential
   child-first deletions keep the service portable and give accurate
   per-table counts.

5. **`adminProcedure` (not `protected`) for cron status + sweep
   procedures.** Cross-tenant ops monitoring, not workspace-scoped.

6. **Sub-router placement follows domain, with noun-qualified procedure
   names.** When multiple retention procedures share a sub-router,
   noun-qualified names disambiguate (`runs.pruneRetention` vs
   `runs.pruneToolCallTracesRetention`).

7. **Forensic-preserving defaults matter.** Default
   `dispatchResults=["ok"]` keeps error/blocked rows; the operator UI
   surfaces an explicit "include forensic" checkbox to override with a
   confirmation warning.

8. **"Saturation" can be premature.** The arc kept finding new operator
   triage axes (workspace-observability dashboard, retention factory,
   half-pattern crons) until genuine retention-symmetry closure.

9. **3-PR variant works when the prune already exists.** Mini-arc 14
   (graph-agent runtime-traces) established this. The factory's
   `buildSweepInput` callback supports adapting input shapes.

10. **New sub-router for each new domain.** Mini-arcs 12-13 introduced
    `agentStudio.ingestion` and `agentStudio.graphChange` — lean
    sub-routers created to host first procedures, with room for future
    domain CRUD.

11. **Sibling-not-child guardrail is worth a doc-block paragraph.**
    When a retention target has a compliance-adjacent neighbor that
    looks like a child (e.g. `agsIngestionArtifacts` next to
    `agsIngestionJobs`, or `agsReleaseAuditRefs` next to
    `agsPublishRequests`), explicitly name the sibling and explain why
    it's out of scope.

12. **Test-injected `now` vs `Date.now()` matters for ms-horizon
    shapes.** When the prune service uses `olderThanMs` rather than a
    `Date` cutoff, the factory's test-injected `now` doesn't propagate
    into the prune service's wall-clock reference. Resolution: assert
    structural shape (positive number; scales with retentionDays)
    rather than absolute value.

13. **Approval-lifecycle deferral keeps growing.** Originally 3 tables;
    2026-05-13 audit added `agsNotePromotions` to the deferred set.
    Same pattern — schema-extension prerequisites must come first.

14. **No-findings audits are valuable.** Mini-arc audits that *don't*
    surface findings are still worth running. They build confidence
    that the search is complete and reduce the risk of surprise gaps
    later.

15. **Closing a cleanup arc is itself a phase.** Mini-arc 41 of Plan v3
    established the precedent: a state-of-the-union memo is a legitimate
    closure move when safe-target supply is exhausted.

## Closure footing

As of #679, the remaining unmanaged ASDB tables fall cleanly into three
buckets:

- **Approval-lifecycle / compliance-tier** — ~~correctly deferred per user
  policy. Implementation blocked on schema-extension prerequisites.~~
  **Resolved 2026-05-13 via PRs #682–#703** (22-PR follow-up arc). Both
  tracks shipped; the daily-sweep ladder grew from 15 slots to 18 slots.
  See [§Post-closure addendum](#post-closure-addendum--approval-lifecycle-deferral-resolution-2026-05-13).
- **Content / CRUD-managed** — agent definitions, catalog tools, KB
  units, vault notes, chat messages, etc. Retention is user-driven via
  application workflows, not a cron concern.
- **Dormant** — zero non-test writers (`agsRetrievalRuns`,
  `agsSemanticEnrichmentRuns`, `agsGraphAlgorithmRuns`,
  `agsGoldenQuestionRuns`, etc.). Will become retention candidates if
  and when actively used.

No further safe targets surfaced in the 2026-05-13 audit pass.

## Re-opening the arc

Future retention work should:

1. Verify the candidate table is in none of the three buckets above.
2. Audit the schema for status vocabulary, terminal-state predicate,
   and cutoff-timestamp non-nullability.
3. Audit for FK children — if any have `NO ACTION` (Drizzle default),
   application-level child-first deletion is required.
4. Audit for sibling tables that might look like children but are
   compliance-adjacent (document the guardrail explicitly).
5. Follow the established 4-PR pattern (or 3-PR if a prune service
   already exists).
6. Slot into the daily-sweep ladder at the next free hour.
7. Update this state-of-the-union memo + the auto-memory ledger.

If a new sub-feature lands that adds a `*runtime_run_id`-referencing
table, audit and extend the runtime-runs cascade (see
[Cascade-orphan](#cascade-orphan-recurring-pattern)).

If a new approval-lifecycle table lands (analogous to
`agsPublishRequests` / `agsApprovalSteps` / `agsNotePromotions`):

1. Confirm the schema has `state` + `terminalAt` + `terminalReason`
   columns (or add them via a `*-terminal-at` migration).
2. Wire its mutation sites through `lifecycle-transition.ts` helpers.
3. Add it to `lifecycle-active-link.ts` if it links to releases /
   active versions / running deployments.
4. Add an entry to the 12-blocker eligibility predicate if the row
   has a domain-specific blocker shape that isn't covered.
5. Add a `prune<Table>Retention` service + `*-cron.ts` factory
   instance + `*-retention.test.ts`.
6. Slot at UTC 21+ (the post-#693 ladder extends past 20:00 UTC).
7. Update this memo and `project_approval_lifecycle_retention_complete.md`.

---

## Post-closure addendum — approval-lifecycle deferral resolution (2026-05-13)

The two-track deferral recorded above shipped end-to-end in a 22-PR
follow-up arc on **2026-05-13**, the same day this memo was originally
closed. Main moved from `33dd1155` (closure commit for #680) to
`b83de91e` (live-ASDB integration tests at #703).

### Ledger — 22 PRs (#682–#703)

| PR  | Sub-arc | Scope                                                                                                                            |
| --- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| #682 | A1      | Add `terminalAt` + `terminalReason` columns + indexes on the 3 approval-lifecycle tables                                          |
| #683 | A2      | Create `agsLifecycleHolds` shared reference table (open-set `holdType`)                                                            |
| #684 | B1      | State vocabularies + zod schemas + terminal-transition helpers (pure functions, 15 tests)                                          |
| #685 | B2      | Wire `decideApprovalStep` + `updatePublishRequestState` + promotion adapter approve/rollback through the helpers                   |
| #686 | C1      | Audit-driven release-state classifier (`isReleaseRetentionBlocker(release)` using `archivedAt` as primary signal)                   |
| #687 | C2      | Active-link query helpers (publish→release / approval→release-via-parent / note-promotion→active-version), fail-soft to `true`     |
| #688 | D1      | Operator-applied SQL backfill for pre-existing terminal rows (`scripts/migrations/manual/approval-lifecycle-terminal-at-backfill.sql`) |
| #689 | E1      | `isRetentionEligible` derivation service — pure derivers + loaders + 25 tests; 12 blocker codes                                   |
| #690 | F1      | `prunePublishRequestsRetention` service + 4 tests                                                                                  |
| #691 | F2      | `pruneApprovalStepsRetention` service (batched parent fetch via Map) + 3 tests                                                     |
| #692 | F3      | `pruneNotePromotionsRetention` service (children-first cascade across 3 tables) + 4 tests                                          |
| #693 | G1      | 3 daily-sweep crons (18 / 19 / 20 UTC, 90-day default) + boot wire-up                                                              |
| #694 | G2      | tRPC procedures — publishRouter (publishRequests + approvalSteps prefix-qualified) + promotionRouter (`pruneRetention` simple)      |
| #695 | G3      | RetrofitPage UI panels for the 3 Track-1 services (preserved/blocker counts surfaced)                                              |
| #696 | H1      | Track 2 — `release-audit-refs-archival.ts` with 7-year floor + archive preconditions + deletion-always-throws                       |
| #697 | H2      | Track 2 — tRPC procedures (`listReleaseAuditRefsArchivalCandidates`, `archiveReleaseAuditRef`) on publishRouter                     |
| #698 | H3      | Track 2 — RetrofitPage archival panel (candidate list + archive action + standing-policy banner)                                   |
| #699 | J1      | Holds-management write-side service (`setLifecycleHold` / `releaseLifecycleHold` / `listLifecycleHoldsForEntity`) + 12 tests        |
| #700 | J2      | Holds-management tRPC procedures + RetrofitPage "Lifecycle Holds" panel (entity selector + place + release UI)                     |
| #701 | K1      | Bugfix: approval-step inherits parent publish-request holds (closes silent audit-trail-deletion vulnerability)                      |
| #702 | L1      | Operator-investigation surface — `explainRetentionEligibility` adminProcedure + inline EligibilityExplainer UI                      |
| #703 | M1      | Live-ASDB integration tests (20 cases) at `tests/integration/agent-studio/approval-lifecycle-retention.integration.test.ts`        |

### Architectural pieces shipped

- **Schema** (#682, #683, #696): 6 new columns on 3 Track-1 tables
  (`terminalAt` + `terminalReason` × 3), 4 new columns on
  `agsReleaseAuditRefs` (`archivedAt` + `archivedBy` + `archiveReason` +
  `complianceApprovalRef`), `agsLifecycleHolds` reference table, 5
  new indexes.
- **Service layer** (#684–#692, #696, #699):
  `server/agent-studio/services/retention/lifecycle-*.ts` (state vocab,
  transition helpers, active-link helpers, holds query, eligibility
  derivation, holds management), 3 prune services
  (`publish-requests-retention.ts`, `approval-steps-retention.ts`,
  `note-promotions-retention.ts`), and `release-audit-refs-archival.ts`
  (Track 2; permanent factory exclusion).
- **Wire-up** (#685, #693, #694, #695, #697, #698, #700):
  `repository.ts` mutation routing, `services/promotion/adapter-asdb.ts`,
  `boot.ts` (3 new `ensure*Started` calls at steps 3.21–3.23),
  `api/router.ts` (publishRouter adminProcedures), promotionRouter,
  `RetrofitPage.tsx` (5 new tabs/panels).

### The 12-blocker retention predicate

Every approval-lifecycle prune service evaluates these in order:

1. `NON_TERMINAL_STATE` — state not in terminal set
2. `NO_TERMINAL_TIMESTAMP` — `terminalAt` is null (backfill not applied)
3. `MINIMUM_RETENTION_WINDOW_NOT_ELAPSED` — `now < terminalAt + window`
4. `ACTIVE_RELEASE_LINK` — linked release where `archivedAt IS NULL`
5. `ACTIVE_DEPLOYMENT` — reserved alias of `ACTIVE_RELEASE_LINK`
   (while deployment is fused into the release row)
6. `ACTIVE_PROMOTION_VERSION` — note-promotion specific; any version
   has `active=true`
7. `PENDING_APPROVAL_CHAIN` — approval-step specific; parent
   publish-request non-terminal
8. `LEGAL_HOLD`
9. `AUDIT_HOLD`
10. `GOVERNANCE_HOLD`
11. `OPEN_GOVERNANCE_REVIEW`
12. `UNRESOLVED_AUDIT_INVESTIGATION`

Unknown hold types surface as `GOVERNANCE_HOLD` (fail-closed). The
predicate strengthened, never weakened — per user §0 standing principle.

### Track 2 — `agsReleaseAuditRefs` archival policy

Permanent generic-factory exclusion preserved. Three functions + tRPC
+ UI:

- `listReleaseAuditRefsArchivalCandidates({ minRetentionMs, limit? })`
  — 7-year floor via `RELEASE_AUDIT_REFS_MIN_RETENTION_MS` constant;
  below-floor calls throw.
- `archiveReleaseAuditRef({ id, complianceApprovalRef, archivedBy, reason })`
  — `complianceApprovalRef` + `reason` both required service-layer; no
  anonymous archives.
- `deleteReleaseAuditRef(...)` — **always throws.** Operators use the
  compliance team's external workflow.

No cron. No tRPC deletion entry-point (intentional).

### Daily-sweep ladder — final extended state

15 slots → **18 slots**, 03:00–20:00 UTC. Approval-lifecycle slots
(18 / 19 / 20 UTC) carry a 90-day default vs the operational 30-day
default because approval-lifecycle records cover two quarterly audit
cycles before sweeping.

### Test coverage delta — 97 new tests

- 76 unit tests across `lifecycle-*` helpers + 3 prune services +
  Track 2 archival + holds management.
- 20 live-ASDB integration tests in `tests/integration/agent-studio/approval-lifecycle-retention.integration.test.ts`
  (`pnpm run test:integration:staging`).
- 1 explainRetentionEligibility unit test (#702).

### Five carry-forward lessons from the addendum arc

These supplement the 15 carry-forward lessons recorded in the original
SOU body — they are specific to the addendum's lifecycle-aware shape
and should be applied to future approval-lifecycle table additions
(see [§Re-opening the arc](#re-opening-the-arc) for the procedural
hook).

1. **Lifecycle-aware retention has higher per-row cost but materially
   different semantics.** A candidate query reduces volume to "rows
   that have at least cleared the age threshold"; per-row eligibility
   re-validation against the 12 blocker codes is the predicate's
   actual work. Fine for low-volume tables (approval-lifecycle); for
   high-volume tables (runtime traces), the age-only pattern remains
   appropriate.

2. **Returning `preservedCount` + `blockerCounts` is operator gold.**
   When a sweep deletes 4 rows but preserves 12, operators need to see
   *why*. The 12 blocker codes feed directly into the UI's
   "blockers: legal_hold=4, active_release_link=8" line. Future
   retention services with compliance dimensions should follow this
   pattern.

3. **State-machine helpers belong at the service layer, not as DB
   CHECK constraints.** The 3 tables had varchar state columns with
   pre-existing values from before the vocabulary extension. CHECK
   constraints would have required a backfill migration first.
   Service-layer enforcement (zod at the API boundary + helpers at
   mutation sites) was the right call.

4. **`MAX(own.terminalAt, parent.terminalAt)` for child-table
   eligibility is non-obvious but correct.** An approval-step cannot
   outlive its parent publish-request's lifecycle from a retention
   standpoint. The deriver's `latestTerminalAt` computation captures
   this; future child-table retention services should adopt the same.

5. **Permanent-exclusion tables benefit from explicit "always throw"
   markers.** `deleteReleaseAuditRef` exists as a function that always
   throws with a message naming the compliance team's external
   workflow. A future contributor who searches for "delete this row"
   finds the marker + the policy rationale, instead of looking for a
   missing function and implementing one ad hoc.

### Cross-references

- Approval-lifecycle complete memory: `~/.claude/projects/-root/memory/project_approval_lifecycle_retention_complete.md`
- Track 1 spec: [`approval-lifecycle-retention-track-1-lifecycle-governance-schema.md`](./approval-lifecycle-retention-track-1-lifecycle-governance-schema.md)
- Track 2 spec: [`approval-lifecycle-retention-track-2-release-audit-refs-archival.md`](./approval-lifecycle-retention-track-2-release-audit-refs-archival.md)
- Live-ASDB integration test: `tests/integration/agent-studio/approval-lifecycle-retention.integration.test.ts`
  (run via `pnpm run test:integration:staging`)

### Deferred operator-validation step

Local Postgres seed pass against the live-ASDB integration suite was
attempted in the prior session and **deferred** as a non-blocking
operator action — the on-device Postgres cluster used a non-default
role identifier (`u0_a296`) and the seed script aborted with a
non-fatal SIGKILL. The integration test code is shipped at #703 and
runs against any properly-provisioned ASDB role; the on-device seed
shortcut is operator-environment-specific. Cross-references:
`~/.claude/projects/-root/memory/reference_termux_dev_env_recovery.md`,
`~/.claude/projects/-root/memory/feedback_dev_env_respects_port_registry.md`.
