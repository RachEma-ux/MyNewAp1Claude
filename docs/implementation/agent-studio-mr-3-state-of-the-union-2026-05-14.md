# MR-3 (Phase MR-1 Phase-1 Shim) — State of the Union

**Date:** 2026-05-14
**Status:** ~29 batches landed; major asymmetries closed; remaining gaps named and deferred to V2 Phase-2 routing work.
**Predecessor:** `docs/implementation/agent-studio-mr-3-getasdb-inventory.md` (the *plan*; this doc is the *progress snapshot* keyed to that plan).

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
