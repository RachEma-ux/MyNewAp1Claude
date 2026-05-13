# Agent Studio Retention Arc — State of the Union (CLOSED 2026-05-13)

**Phase 22 follow-up cohort closure memo.** This document captures the final
state of the retention arc that ran across 2026-05-12 and 2026-05-13. The
arc is closed at PR #680. Future retention work should treat this memo as
the authoritative starting reference.

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

## Daily-sweep ladder (final state)

15 slots, 03:00–17:00 UTC, offset 1h each to spread ASDB write load:

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

## Deferred work — approval-lifecycle retention

Per **user 2026-05-12 policy §§0-9**, the following 4 tables remain
deferred. Implementation is blocked until the lifecycle-governance schema
extension lands.

| Table                       | Reason                                                 |
| --------------------------- | ------------------------------------------------------ |
| `agsPublishRequests`        | Lifecycle vocabulary missing `cancelled` / `superseded` / `failed_terminal`; no `terminalAt` column; no hold model |
| `agsApprovalSteps`          | Lifecycle vocabulary missing `skipped` / `expired` / `cancelled` / `superseded`; no parent-lifecycle-aware predicate |
| `agsReleaseAuditRefs`       | **Permanent exclusion** from generic retention factory — compliance long-retention table (min 7y if finite). Only `archiveReleaseAuditRefsRetention` workflow allowed |
| `agsNotePromotions`         | Approval-lifecycle table (Phase 10); shares same compliance-adjacency concerns. Added to deferral set 2026-05-13 |

Required schema work (must complete in order before retention implementation):

1. Add lifecycle state vocabulary (extend the enums)
2. Add `terminalAt` + `terminalReason` columns
3. Add hold model (`legalHold` / `auditHold` / `governanceHold` columns, OR
   shared `agsLifecycleHolds` reference table — preferred)
4. Audit + standardize `agsAgentReleases.state` vocabulary
5. Add active-release / active-deployment FK linkage
6. Add governance-review + audit-investigation linkage
7. Backfill existing rows conservatively (`terminalAt = decidedAt OR null`)
8. Add `isRetentionEligible` derivation service
9. Test eligibility derivation
10. Implement retention service
11. Cron only after retention tests prove safe behavior

Full deferral detail: `~/.claude/projects/-root/memory/project_phase_22_approval_lifecycle_deferral.md`.

**Standing principle (user §0)**: *"Do not weaken the retention predicate
to fit the current schema. That would make the retention cron unsafe."*
Schema first, retention second.

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

- **Approval-lifecycle / compliance-tier** — correctly deferred per user
  policy. Implementation blocked on schema-extension prerequisites.
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
