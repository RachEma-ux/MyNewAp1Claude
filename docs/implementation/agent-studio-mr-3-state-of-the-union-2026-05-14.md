# MR-3 (Phase MR-1 Phase-1 Shim) — State of the Union

**Date:** 2026-05-14 (rev 2: 2026-05-15, rev 3: 2026-05-15)
**Status:** **76 batches landed** (35 by rev 2, +41 in rev 3 — Path-B mutation arc + Path-X read promotion arc both substantively complete); major asymmetries closed across `repository.ts` (every mutation), Phase-0b child tables (Hooks/McpServers/Skills/Subagents/Plugins/PermissionRules), vault writes + reads, canvas writes + reads, ingestion + provenance + knowledge-unit reads, RAC reads, approval-gate read+write, bindings reads, extensions reads. Remaining `getAsDb()` callers are now predominantly intentional Cat C (cross-workspace observability / global registries / system health) or Cat B reads where row is local.
**Predecessor:** `docs/implementation/agent-studio-mr-3-getasdb-inventory.md` (the *plan*; this doc is the *progress snapshot* keyed to that plan).

**Rev 2 addendum (2026-05-15):** §1 extended with batches 30–35; §2 expanded with new "all mutations Cat A" files (`vault/repository-asdb.ts`); §3.1 trimmed (4 entries promoted Cat B→A: `removeAgentProviderBinding`, vault `addMember` / `createNote` / `updateNote` / `deleteNote`, extension `recordInvocation`); new §11 diagnoses the **schema-level workspace-scoping gap** that blocks approval-gate / repository.ts / tool-approvals-router from Phase-1 caller migration — agsAgents / agsAgentDrafts / agsRuntimeRuns predate workspace scoping at the schema level. Phase-2 unblock requires either (a) backfilling workspaceId to those tables, or (b) indirect resolver through agsAgentProviderBindings.workspaceId.

**Rev 3 addendum (2026-05-15):** Path B primitive (§11 of rev 2) shipped at `services/region/draft-workspace-resolver.ts` and now has **22 consumers** across 14 files. New §12 documents the **17 sister resolvers** added to `repository.ts` (1 Path B + 1 helper × 16 other identifier-shape tables: agentId/draftId/bindingId/suiteId/caseId/testRunId/simulationRunId/publishRequestId/approvalStepId/simulationScenarioId/runtimeRunId/hookId/mcpServerId/skillId/subagentId/pluginId/permissionRuleId). New §13 documents the read-path Path-X promotion sub-arc (14 batches across cag/store, cag/events, rac/sources, rac/trace, canvas, ingestion, vault, bindings, extensions, approval-gate). Rev 3 sub-arc closure: every `repository.ts` mutation is now Path-B-routed (the §11 schema-level gap is closed at the runtime layer via Path B indirection).

---

## 0. Why this doc exists

The original `agent-studio-mr-3-getasdb-inventory.md` describes the *first-batch plan* (PR-V1-43 / #794). Since then, ~27 follow-up batches have shipped (#806 third-batch through #848 twenty-ninth-batch). This snapshot captures:

- **What's landed** (per-file + per-function status, keyed to the PR ledger in the V1+ execution plan)
- **What stays Cat B by intent** (read-only paths, system-level paths, intentionally workspace-agnostic)
- **What's deferred** (Cat C bootstrap exceptions, Cat D/E follow-ups, Phase-2 of the shim)

The categorization preserves the original inventory's taxonomy:
- **Cat A** = `getAsDbForWorkspace(<input>.workspaceId)` — workspaceId already in scope.
- **Cat B** = `getAsDb()` — needs workspaceId plumbing through callers (split-handle / JOIN resolver).
- **Cat C** = `getAsDb()` — intentionally workspace-agnostic (system-level / cross-workspace / bootstrap).
- **Cat D** = tRPC router; widens a private `asdb(workspaceId)` helper.
- **Cat E** = Architectural decision needed (ADR-blocked).

---

## 1. Landed batches (chronological)

The ledger lives in `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md` §6.1. Brief index:

| Batch | PR | File / function(s) | Pattern |
|---|---|---|---|
| 1st | #794 | `services/extensions/manifest.ts::installExtension` + `listExtensionsByWorkspace` | Direct Cat A |
| 2nd | #803 | `services/cag/store.ts::createPack` | Direct Cat A |
| 3rd | #806 | `services/ingestion/ingestion-job-service.ts::startJob` | Direct Cat A |
| 4th | #807 | `services/ingestion/knowledge-unit-service.ts::insertUnit` | Direct Cat A |
| 5th | #808 | `services/ingestion/provenance-service.ts::recordProvenance` | Direct Cat A |
| 6th | #818 | `services/canvas/projection-events-sink-asdb.ts::recordCanvasProjectionEvent` (sink-side) | Resolver-passthrough |
| 7th | #819 | `services/rac/sources/store.ts::createProfile` + `createSource` + `upsertPolicy` | Direct Cat A (3 fns) |
| 8th | #820 | `services/cag/store.ts::getPackById` + Cat-B inventory | Direct Cat A + inventory |
| 9th | #821 | `services/runtime/trace-writer.ts::recordToolCallTrace` | Direct Cat A |
| 10th | #822 | `services/canvas/note-mention-resolver-asdb.ts` (3 fns) | Direct Cat A |
| 11th | #823 | `services/rac/sources/store.ts` Cat B inventory + read sites | Audit |
| 12th | #824 | `services/rac/trace/store.ts` (6 Cat A migrations) | Direct Cat A |
| 13th | #825 | `services/rac/ingestion/knowledge-unit-adapter.ts::search` | Direct Cat A |
| 14th | #826 | `api/kb-router.ts` widening `asdb(workspaceId)` | Cat D |
| 15th | #827 | `api/tool-knowledge-router.ts` widening `asdb(workspaceId)` | Cat D |
| 16th | #828 | canvas lazy-loaders (reader + sink-asdb) | Cat D-shaped + Cat C exception |
| 17th | #829 | `services/rac/trace/store.ts::writeContextBlocks` | Rows[0]-discovery |
| 18th | #831 | `services/cag/store.ts::markPackStale` | Split-handle (SELECT-then-UPDATE) |
| 19th | #838 | `cag/store.ts::markPackUsed` + `recordPackTokenActual` | Split-handle (UPDATE-only) |
| 20th | #839 | `rac/sources/store.ts::updateProfile` + `updateSource` + `deleteSource` | Split-handle (3 fns) |
| 21st | #840 | `extensions/manifest.ts::approveExtension` + `setExtensionStatus` | Split-handle (2 fns) |
| 22nd | #841 | `runtime/trace-writer.ts::patchRacRuntimeTrace` | Split-handle + H4-c7 early-return preserved |
| 23rd | #842 | `ingestion/ingestion-job-service.ts::completeJob` | Split-handle + soft-return on vanished id |
| 24th | #843 | `ingestion/knowledge-unit-service.ts::archiveUnit` | Split-handle + soft-return |
| 25th | #844 | `canvas/canvas-service.ts::createCanvas` | Vault→workspace split-handle |
| 26th | #845 | `canvas/canvas-service.ts::createCanvasNode` + `createCanvasEdge` | Canvas→vault→workspace JOIN |
| 27th | #846 | `workspace-default-bindings.ts` (4 fns, file 100% Cat A) | Direct Cat A |
| 28th | #847 | `bindings.ts::upsertAgentProviderBinding` | Direct Cat A |
| 29th | #848 | `bindings.ts::validateBindingPolicy` refresh-branch UPDATE | Already-loaded-binding split-handle |
| 30th | #850 | `bindings.ts::removeAgentProviderBinding` | Split-handle (binding-row workspaceId) |
| 31st | #851 | `extensions/runtime.ts::recordInvocation` | Extension→workspace lookup via getDb test seam |
| 32nd | #852 | `vault/repository-asdb.ts::addMember` | Vault→workspace split-handle |
| 33rd | #853 | `vault/repository-asdb.ts::createNote` | Vault→workspace split-handle (single conn for 3 writes) |
| 34th | #854 | `vault/repository-asdb.ts::updateNote` | Note→vault→workspace JOIN (single conn for up to 3 writes) |
| 35th | #855 | `vault/repository-asdb.ts::deleteNote` | **Widened pre-existing SELECT** to also pull vault.workspaceId — zero-cost migration |

---

## 2. Files now 100% Cat A (no bare `getAsDb()`)

These files have had their bare `getAsDb()` import dropped entirely (Phase-1 shim still delegates to `getAsDb()` internally, but no caller-visible direct call):

- `server/agent-studio/api/kb-router.ts` (#826)
- `server/agent-studio/api/tool-knowledge-router.ts` (#827)
- `server/agent-studio/workspace-default-bindings.ts` (#846)
- `server/agent-studio/services/extensions/manifest.ts` — only `getExtensionById` (read-only Cat B) retains a bare call; all mutations migrated.
- `server/agent-studio/services/canvas/canvas-service.ts` — all mutations migrated; read helpers stay on `getAsDb()` by intent.
- `server/agent-studio/services/ingestion/ingestion-job-service.ts` — `startJob` + `completeJob` migrated; only the read `getJob` retains a bare call.
- `server/agent-studio/services/ingestion/knowledge-unit-service.ts` — `insertUnit` + `archiveUnit` migrated; only read helpers remain.
- `server/agent-studio/services/runtime/trace-writer.ts` — `recordToolCallTrace` + `patchRacRuntimeTrace` migrated; read helpers Cat B by intent.

---

## 3. Cat B remaining (deferred, named)

### 3.1 Read-only paths (intentional Cat B)

Read paths benefit less from region routing — single-region replicas are typically sufficient, and the cost of a discovery SELECT round-trip outweighs the routing win.

| File | Function(s) |
|---|---|
| `services/cag/store.ts` | `getLatestPack(agentDraftId)`, `listPacks(agentDraftId)` |
| `services/cag/events.ts` | `listPackEvents(agentDraftId, limit)` |
| `services/rac/sources/store.ts` | `getProfile`, `listProfilesForDraft`, `getSource`, `listSourcesForProfile`, `getPolicyForProfile` |
| `services/rac/trace/store.ts` | `listContextBlocks(traceId)` |
| `services/ingestion/ingestion-job-service.ts` | `getJob(jobId)` |
| `services/ingestion/provenance-service.ts` | `getProvenance(provenanceId)` |
| `services/extensions/manifest.ts` | `getExtensionById(extensionId)` |
| `services/canvas/canvas-service.ts` | `getCanvasById`, `listCanvasesByVault`, `getCanvasSnapshot`, `listNoteReferencesForCanvas` |
| `services/rac/ingestion/knowledge-unit-adapter.ts` | `health()` |
| `bindings.ts` | `getAgentProviderBinding`, `listBindingsForAgent`, `removeAgentProviderBinding`, `refreshBindingValidation` |

### 3.2 Cross-table mutations needing JOIN resolver (deferred sub-arc)

These mutations need a JOIN to discover workspaceId (e.g., draft→agent→workspace, approval→draft→agent→workspace). Pattern is the same as #845 but each file has a different JOIN shape. Per-function sub-arc when the routing benefit is high enough to justify the extra round-trip.

| File | Function(s) | JOIN chain |
|---|---|---|
| `services/approval/approval-gate.ts` | `evaluateApprovalGate`, `createApprovalRequest`, `decideApprovalRequest` | approval → agentDrafts → agents.workspaceId |
| `api/tool-approvals-router.ts` | `list`, `listByDraft`, `getByHash`, `decide` (4 procedures) | same as approval-gate |
| `services/export-catalog-lookups.ts` | `resolveAgentBinding`, `resolveActiveReleaseId`, `loadCatalogEntryForAgent`, `loadCurrentSyncRow` | mixed (some agent-scoped, some catalog-entry-scoped) |
| `api/router.ts::explainRetentionEligibility` | `ags_note_promotions` branch | note_promotion → vault_note → vault.workspaceId |

---

## 4. Cat C kept intentionally (system-level / cross-workspace)

These tables have NO `workspaceId` column OR are explicitly system-wide observability paths. Routing wouldn't make sense:

| File | Rationale |
|---|---|
| `services/runtime-runs-retention.ts` + sibling `*-retention.ts` files | Cron retention scans across all workspaces |
| `services/graph/health-alert.ts` | `agsRuntimeAlerts` has no workspaceId — alerts are system-level by design |
| `services/graph/projection/drift-cron.ts` | Cron-level scan across all graph nodes |
| `services/graph/repository/postgres-graph-repository-asdb.ts` | GraphRepository core; `agsGraphNodes.workspaceId` is nullable; routing decision lives with Phase-7 graph backend ADR |
| `services/graph-quality/router.ts` | `agsGraphQualityScans` has no workspaceId — system-level audit surface |
| `db/seed-*.ts` | Boot-time seed scripts; fixed-region by definition |
| `boot.ts` adapter wiring | Boot path; not workspace-scoped |
| `manifest.ts` getDb barrel | Default-handle for tests / dynamic imports |

---

## 5. Cat D status (tRPC routers)

| Router | Status |
|---|---|
| `api/kb-router.ts` | 100% Cat A (#826) |
| `api/tool-knowledge-router.ts` | 100% Cat A (#827) |
| `api/tool-approvals-router.ts` | **Deferred** — needs approval → draft → agent → workspace JOIN resolver |
| `api/router.ts` | 1 remaining bare call site (`explainRetentionEligibility` → `agsNotePromotions`) |
| `services/graph-quality/router.ts` | Cat C (intentionally workspace-agnostic) |

---

## 6. Cat E status (ADR-blocked)

The original inventory named ~4 Cat E files. As the broader Native Graph Workspace plan has progressed, several of those have been re-classified:

- `services/graph/repository/postgres-graph-repository-asdb.ts` — Cat E in spirit; the graph backend ADR (`docs/architecture/agent-studio-active-graph-backend-decision.md`) governs the routing decision. Unchanged.
- Approval-gate chain — Cat E pending the agentDrafts→workspaceId JOIN resolver decision; tracked in §3.2.
- `services/export-catalog-lookups.ts` — Cat B/E hybrid; cross-DB (ASDB + main DB) makes routing non-trivial.

---

## 7. Phase-1 shim acceptance state

The shim `getAsDbForWorkspace(workspaceId)` in `server/agent-studio/db/connection.ts` still delegates to `getAsDb()` — Phase-1 contract preserved (single-region bit-for-bit). The 29 batches above establish the **routing surface** at call sites; Phase-2 will land the actual region-aware implementation behind the shim without caller changes.

The shim's signature **accepts `number | null | undefined`** (per #794 contract) so cross-table chains that may surface a null workspaceId (vault.workspaceId IS NULL legacy rows) don't need explicit fallback handling — the shim treats null as "use the default region."

Most batch sites do still use an explicit `workspaceId != null ? getAsDbForWorkspace(...) : lookupDb` fallback for clarity; that's intentional belt-and-suspenders, not a contract requirement.

---

## 8. Test coverage shape

Every batch ships a source-scan test under `tests/agent-studio/mr-3-<ordinal>-batch-*.test.ts`. The tests are deliberately *structural* (no DB / no boot): they assert call-site shape, ordering invariants, and the bare-`getAsDb`-absent property where the file is 100% migrated. This pattern catches regressions when a file is touched by an unrelated PR.

29 source-scan suites currently exist; the third-batch test was amended by #842 to weaken its `it.each` Cat B array as functions migrated.

---

## 9. Next batches (when scheduled)

Bounded follow-ups expected to ship in subsequent batches as time/load permits. Each is its own PR with one named scope:

1. **30th batch** — `getAgentProviderBinding(draftId, role)` Cat B→A via `agsAgentDrafts.workspaceId` lookup helper (split-handle, mirrors #843).
2. **31st batch** — `listBindingsForAgent(agentId)` Cat B→A via `agsAgents.workspaceId` lookup helper.
3. **32nd batch** — `removeAgentProviderBinding(draftId, role)` Cat B→A via split-handle.
4. **33rd batch** — Approval-gate sub-arc PR-1: `evaluateApprovalGate(input)` Cat B→A via approval → draft → agent JOIN.
5. **34th+** — Approval-gate sub-arc PR-2/3/4 (`createApprovalRequest`, `decideApprovalRequest`, `tool-approvals-router` procedures).
6. **Eventually** — Phase-2 of the shim (real region routing) lands behind the existing call surface.

---

## 10. References

- `docs/implementation/agent-studio-mr-3-getasdb-inventory.md` — first-batch plan (the *contract*)
- `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md` — V1+ execution plan + per-PR ledger
- `docs/architecture/agent-studio-multi-region.md` — Phase MR-1 ADR (the *destination*)
- `server/agent-studio/db/connection.ts` — `getAsDb()` + `getAsDbForWorkspace(workspaceId)` shim
- `server/agent-studio/services/region/connection-helper.ts` — `getDbForRegion`, `getDbForWorkspace` (region-aware helpers; #763)

---

## 11. Schema-level workspace-scoping gap (REV 2 — 2026-05-15)

After 35 batches we hit a **structural limit** with Phase-1 caller migration: a class of files cannot become Cat A even via split-handle, because the parent tables they read/write **do not carry `workspaceId` at the schema level**. These tables predate workspace scoping in Agent Studio:

| Table | Has `workspaceId`? | Notes |
|---|---|---|
| `agsAgents` | **No** | Agent identity table. ownerId scopes by user, not workspace. |
| `agsAgentDrafts` | **No** | Carries `agentId` FK. Inherits agent's lack of workspaceId. |
| `agsRuntimeRuns` | **No** | Carries `agentId` FK. |
| `agsPendingPermissionRequests` | **No** | Carries `agentDraftId` + `runtimeRunId`. |
| `agsRuntimePolicyEvents` | **No** | Carries `runId`. Cross-workspace observability. |
| `agsAgentProviderBindings` | **Yes** | The escape hatch — has `(workspaceId, agentId, draftId, ...)`. |
| `agsExtensions` | **Yes** | Used in #851 recordInvocation chain. |
| `agsVaults` | **Yes (nullable)** | Used in #844/#845/#852/#853/#854/#855 chains. |
| `agsCagCapabilityPacks` | **Yes** | Used in #831/#838 chains. |
| `agsRacRuntimeTraces` | **Yes** | Used in #821/#841 chains. |
| `agsKnowledgeUnits` | **Yes** | Used in #843. |
| `agsIngestionJobs` | **Yes** | Used in #842. |

The files blocked by the agent-tier gap:

- `services/approval/approval-gate.ts` — `evaluateApprovalGate` / `createApprovalRequest` / `decideApprovalRequest` all key on `approvalRequestId` or `agentDraftId`. Neither chain ends at a workspaceId column today.
- `api/tool-approvals-router.ts` — 4 procedures, all approval-row-scoped.
- `repository.ts` — most reads/mutations key on agentId, draftId, bindingId, or versionId.
- `api/router.ts::explainRetentionEligibility` `ags_note_promotions` branch — note_promotion → vault_note → vault.workspaceId (3-hop JOIN; technically possible but architecturally fragile).

### Phase-2 unblock paths (named, not yet chosen)

**Path A — Backfill `workspaceId` to agent-tier tables.** Add a NOT NULL `workspaceId` column to `agsAgents` with a migration script that reads the workspace from each agent's owning vault or default fallback. Once the column exists, all draftId/agentId/runId-scoped functions in `bindings.ts`, `repository.ts`, `approval-gate.ts`, and `tool-approvals-router.ts` become trivial Cat A migrations. **Cost:** one migration + ADR + 7-10 small follow-up PRs. **Benefit:** unblocks the entire agent-tier surface at once.

**Path B — Indirect resolver through `agsAgentProviderBindings.workspaceId`.** For approval/draft chains, add a helper `resolveWorkspaceIdForDraft(lookupDb, draftId)` that JOINs `agsAgentProviderBindings` (which DOES have workspaceId) on draftId. Per-function migration through the resolver. **Cost:** one helper + per-function migrations. **Benefit:** zero schema changes. **Drawback:** fragile when bindings are absent (legacy drafts pre-Phase-11) — those drafts have no resolvable workspaceId.

**Path C — Add `workspaceId` resolver as a tRPC-context layer.** At the router boundary, resolve workspaceId from `ctx.workspaceId` (which the platform-level workspace gate already injects) and pass it down. Each procedure plumbs workspaceId through to the service. **Cost:** signature changes across every procedure. **Benefit:** uses existing ctx infrastructure. **Drawback:** large surface area for plumbing.

---

## 12. Path B sister resolvers — `repository.ts` mutation arc (rev 3)

The Path B primitive `resolveWorkspaceIdForDraft(lookupDb, draftId)` (introduced in PR #857) is the foundation. To cover the full mutation surface of `repository.ts`, **17 sister resolvers** were added — each composes a single SELECT on top of the next-deeper resolver to map a different identifier shape to workspaceId:

| Helper | Identifier | Chain shape | Used by | Introduced |
|---|---|---|---|---|
| `resolveAgentRoutedConn` | agentId | agentId → agsAgentDrafts → resolveWorkspaceIdForDraft | updateAgentLifecycleState, updateAgentCore, archiveAgent, createVersion, createPublishRequest, publishRelease, createSimulationRun | #865 (PR-V1-114) |
| `resolveDraftRoutedConn` | draftId | direct Path B | updateDraft, attachToolBinding, replaceToolBindings, replaceKnowledgeBindings, replaceMemoryConfigs, replaceWorkflowGraph, updateRuntimeConfig, updateScheduleConfig (+ INSERT branches across child tables) | #864 (PR-V1-113) |
| `resolveBindingRoutedConn` | bindingId | bindingId → agsDraftToolBindings.draftId → resolveDraftRoutedConn | updateToolBinding, removeToolBinding | #863 (PR-V1-112) |
| `resolveSuiteRoutedConn` | suiteId | suiteId → agsTestSuites.agentId → resolveAgentRoutedConn | saveTestSuite (UPDATE), saveTestCase (INSERT), createTestRun | #868 (PR-V1-117) |
| `resolveCaseRoutedConn` | caseId | caseId → agsTestCases.suiteId → resolveSuiteRoutedConn | saveTestCase (UPDATE), removeTestCase | #869 (PR-V1-118) |
| `resolveTestRunRoutedConn` | runId | runId → agsTestRuns.agentId → resolveAgentRoutedConn | updateTestRun, recordTestResult | #870 (PR-V1-119) |
| `resolveSimulationRunRoutedConn` | runId | runId → agsSimulationRuns.agentId → resolveAgentRoutedConn | appendSimulationStep, updateSimulationRun | #871 (PR-V1-120) |
| `resolvePublishRequestRoutedConn` | publishRequestId | publishRequestId → agsPublishRequests.agentId → resolveAgentRoutedConn | updatePublishRequestState, createApprovalStep | #872 (PR-V1-121) |
| `resolveApprovalStepRoutedConn` | stepId | stepId → agsApprovalSteps.publishRequestId → resolvePublishRequestRoutedConn (5-hop total) | decideApprovalStep | #872 (PR-V1-121) |
| `resolveSimulationScenarioRoutedConn` | scenarioId | scenarioId → agsSimulationScenarios.agentId → resolveAgentRoutedConn | saveSimulationScenario (UPDATE) | #873 (PR-V1-122) |
| `resolveRuntimeRunRoutedConn` | runId | runId → agsRuntimeRuns.agentId → resolveAgentRoutedConn | updateRuntimeRun + 5 append* (RunStep/ToolCall/MemoryEvent/PolicyEvent/HookExecution) + createPendingPermissionRequest | #874 (PR-V1-123) |
| `resolveHookRoutedConn` | hookId | hookId → agsDraftHooks.draftId → resolveDraftRoutedConn | saveHook (UPDATE), removeHook | #875 (PR-V1-124) |
| `resolveMcpServerRoutedConn` | serverId | serverId → agsDraftMcpServers.draftId → resolveDraftRoutedConn | saveMcpServer (UPDATE), removeMcpServer, updateMcpServerStatus, setMcpServerEnabled, updateMcpServerOAuth, recordMcpTransition | #876 (PR-V1-125), reused #881 (PR-V1-130) |
| `resolveSkillRoutedConn` | skillId | skillId → agsDraftSkills.draftId → resolveDraftRoutedConn | removeSkill | #877 (PR-V1-126) |
| `resolveSubagentRoutedConn` | subagentId | subagentId → agsDraftSubagents.draftId → resolveDraftRoutedConn | saveSubagent (UPDATE), removeSubagent | #878 (PR-V1-127) |
| `resolvePluginRoutedConn` | pluginId | pluginId → agsDraftPlugins.draftId → resolveDraftRoutedConn | savePlugin (UPDATE), removePlugin | #879 (PR-V1-128) |
| `resolvePermissionRuleRoutedConn` | ruleId | ruleId → agsDraftPermissionRules.draftId → resolveDraftRoutedConn | savePermissionRule (UPDATE), removePermissionRule | #879 (PR-V1-128) |

**Invariant**: every helper is a single SELECT (3-table JOIN max for the deepest case `resolveApprovalStepRoutedConn`); each composes on top of the next-deeper resolver so the dependency graph is a strict DAG. Falls back to `lookupConn` (bootstrap handle) on any null in the chain — preserves pre-Phase-11 semantics for legacy drafts without bindings.

With this resolver family in place, **every `repository.ts` mutation** routes via `getAsDbForWorkspace` under Phase-2 — closing the Rev 2 §11 schema gap at the runtime layer without requiring a schema-backfill migration.

---

## 13. Read-path Path-X promotion sub-arc (rev 3)

After every mutation in agent-studio routed via Path A/B by rev 2 + the first half of rev 3, the secondary read-path arc began. Each batch promotes one or more SELECT-only consumers from Cat B-read to Cat A-read by adding a pre-projection SELECT on workspaceId (or chaining through Path B for draftId-scoped tables) and routing the actual data SELECT to the home region:

| # | Batch | File / function(s) | Pattern |
|---|---|---|---|
| 1 | #884 (PR-V1-133) | `services/cag/store.ts::getLatestPack` + `listPacks` | Path B (dynamic import) |
| 2 | #885 (PR-V1-134) | `services/cag/events.ts::listPackEvents` | Path B (dynamic import) |
| 3 | #886 (PR-V1-135) | `services/rac/sources/store.ts::listProfilesForDraft` | Path B (dynamic import) |
| 4 | #887 (PR-V1-136) | `services/rac/sources/store.ts::getSource` + `listSourcesForProfile` | Path A (pre-projection on own/parent row) |
| 5 | #888 (PR-V1-137) | `services/rac/sources/store.ts::getProfile` + `getPolicyForProfile` | Path A (pre-projection on own/parent row) |
| 6 | #889 (PR-V1-138) | `services/canvas/canvas-service.ts::getCanvasById` + `listCanvasesByVault` + `getCanvasSnapshot` + `listNoteReferencesForCanvas` | Reuses existing `resolveWorkspaceIdForCanvas` cross-table JOIN |
| 7 | #890 (PR-V1-139) | `services/ingestion/ingestion-job-service.ts::getJob` + `services/ingestion/provenance-service.ts::getProvenance` | Path A (pre-projection on own row) |
| 8 | #891 (PR-V1-140) | `services/vault/repository-asdb.ts::getNoteById` + `getNoteVersion` + `getLatestNoteVersion` | Notes × Vaults JOIN |
| 9 | #892 (PR-V1-141) | `services/vault/repository-asdb.ts::listNotesInVault` | Pre-projection from agsVaults |
| 10 | #893 (PR-V1-142) | `bindings.ts::getAgentProviderBinding` | Pre-projection on agsAgentProviderBindings.workspaceId |
| 11 | #894 (PR-V1-143) | `services/extensions/manifest.ts::getExtensionById` | Pre-projection on agsExtensions.workspaceId |
| 12 | #895 (PR-V1-144) | `services/rac/trace/store.ts::listContextBlocks` | Pre-projection on parent agsRacRuntimeTraces |
| 13 | #896 (PR-V1-145) | `services/approval/approval-gate.ts::evaluateApprovalGate` | **Hoist** of pre-existing Path B resolver (was UPDATE-only #107) to cover SELECT + UPDATE share — single resolver call replaces the prior pair |
| 14 | #897 (PR-V1-146) | `services/extensions/runtime.ts::loadExtensionById` | Mirrors #894 manifest version |

**Pattern catalog:**
- **Path A (own-row pre-projection)** — SELECT workspaceId FROM table WHERE id=X, then full SELECT on routed handle. Used where the read target's own table has `workspaceId`.
- **Path A (parent-row pre-projection)** — SELECT workspaceId FROM parent_table WHERE id=parentId, then SELECT on child table. Used where the read target's table lacks workspaceId but a parent does (e.g. agsRacPolicies → agsRacProfiles, agsRacContextBlocks → agsRacRuntimeTraces).
- **Path A (cross-table JOIN)** — `agsVaultNotes innerJoin agsVaults` walks note→vault→workspace in one round-trip. Reused via existing helpers (`resolveWorkspaceIdForCanvas`, the inline Notes × Vaults pattern across vault repo).
- **Path B (dynamic import)** — `await import("./services/region/draft-workspace-resolver")` for draftId-scoped reads. Falls back to bootstrap when the draft has no binding.
- **Hoist** — pre-existing Path B in the function gets moved to the top so the SELECT also routes on the same handle that was previously used only for the UPDATE.

**Net invariant after rev 3**: every read in agent-studio that targets a workspace-scoped table now routes via `getAsDbForWorkspace` under Phase-2 — with the same bootstrap fallback semantics as the mutation arc.

**Remaining `getAsDb()` callers** are now in one of these categories:
- **Cat C cross-workspace observability**: `repository.ts::getHomeSummary` / `getReviewQueue` / `listScheduledAgents`, `services/graph/health-alert.ts::persistHealthAlertDecisions` / `listActiveAlerts`, `services/graph/projection/drift-cron.ts::persistDriftReport`, `services/export-catalog-lookups.ts::*` (cross-workspace catalog operations).
- **Cat C global registries**: `services/publish-targets/executor.ts` (agsPublishTargets has no workspaceId), `services/region/region-service.ts` (agsRegions is the multi-region registry itself), all `agsCatalog*` mutations (catalog is workspace-agnostic by intent), all `agsMarketplace*` mutations.
- **Cat C polymorphic tables**: `services/retention/lifecycle-active-link.ts`, `services/retention/lifecycle-holds-query.ts::listActiveHolds` (agsLifecycleHolds is polymorphic by `(entityType, entityId)` — no workspaceId column by design).
- **Cat C boot-time wiring**: `boot.ts` (adapter instantiation with the bootstrap handle; the adapters internally route per-call).
- **Cat C health probes**: `services/rac/ingestion/knowledge-unit-adapter.ts::health`, `services/rac/ingestion/local-pgvector-adapter.ts::probeHealth`.
- **Cat C cross-workspace fan-out by intent**: `bindings.ts::listBindingsForAgent` (an agent's bindings may legitimately span workspaces under Phase-2 multi-region replication semantics — fan-out is a Phase-2 ADR decision, not a Phase-1 routing fix), `services/vault/repository-asdb.ts::listVaultsForUser` (user-scoped cross-vault).
- **Cat B reads with marginal benefit**: `repository.ts::getLatestCatalogSyncEvent` (Phase 41 reconciliation read), various deep-router endpoints in `api/router.ts` (e.g. polymorphic retention eligibility branches).
- **Discovering-helper bootstrap lookups**: ~30+ functions still call `getAsDb()` as the bootstrap handle for the pre-projection SELECT before routing to `getAsDbForWorkspace` — this is the intended Path-A pattern and is correct.

The Phase-2 multi-region cutover (Phase MR-1) can proceed without further MR-3 work; the shim's `getAsDbForWorkspace` is wired everywhere it needs to be, and the legacy `getAsDb()` callers that remain are the intended workspace-agnostic surfaces.

**Status:** This gap is documented but **not pre-decided** as a Phase-2 blocker. The Phase-1 caller-migration surface is already at >95% of the migration-capable call sites; the remaining ~5% requires the architectural decision above. The plan v1+ stays free to pick Path A, B, or C when Phase-2 implementation begins; until then, the deferred files in §3.2 stay Cat B.
