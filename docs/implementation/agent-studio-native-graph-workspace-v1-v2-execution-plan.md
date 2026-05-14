# Agent Studio Native Graph Workspace — V1 / V1.5 / V2 Successor Execution Plan

**Status:** Draft (2026-05-13). Approved scope; implementation tracks ready to start.
**Predecessor:** `agent-studio-native-graph-workspace-execution-plan.md` (MVP 0–4, closed)
**Predecessor closure evidence:** `agent-studio-native-graph-workspace-status-check-2026-05-13.md`
**Owner agents (per AGENTS.md):** Planner (this doc) → Builder / Reviewer / Tester / Governance per phase
**Scope boundary:** This plan covers everything the MVP 0–4 plan explicitly deferred to V1+ — including Phase 13.5 Agentic GraphRAG, the standalone scopes of Phase 15–19, Track J production hardening, multi-region, CRDT, and offline-first.

---

## 0. Why this plan exists

The MVP 0–4 plan capped its scope at G10 closure (Graph Agent Lite live, golden questions passing). Everything beyond that — adaptive planning, full collaborative editing, multi-region deployment, plugin/extension framework, production hardening — was **explicitly deferred** to a successor plan. PR #723's closure addendum, this plan's predecessor, classified those items as *Deferred by plan, not failed* and named this doc as the return path.

Each phase below has:
- **Status today** (in repo)
- **Acceptance criteria** (what closes the phase)
- **First implementation PR** (concrete, actionable)
- **Dependencies / order**
- **Governance / hard-rule constraints**

The same Planner → Builder → Reviewer → Tester → Governance order from AGENTS.md applies.

---

## 1. Critical path

```
V1.0 — Production hardening + Agentic GraphRAG slice
    │
    ├─ Phase J-1   Production hardening minimum: ops runbooks + alerts
    ├─ Phase 13.5  Agentic GraphRAG — planner contract + bounded loop
    └─ Phase 19-α  Sync/publish strategy implementation slice 1
    ↓
V1.5 — Extension surface + standalone editor scopes
    │
    ├─ Phase 15-α  Templates / attachments standalone management
    ├─ Phase 16-α  Saved views extended scope
    ├─ Phase 17-α  Canvas data model + minimal UI
    └─ Phase 18-α  Extension framework registry + governance
    ↓
V2.0 — Multi-region + real-time collaboration
    │
    ├─ Phase MR-1  Multi-region graph deployment
    ├─ Phase CRDT  Real-time collaborative editing
    └─ Phase OL-1  Offline-first / local-first mode
    ↓
V2.x — Track J production hardening full surface (Aura / CRDT / multi-region together)
```

The path **does not** require linear execution — V1 phases can ship in parallel; V1.5 phases can begin once their V1 prerequisites land; V2.0 phases gate on V1.5 + production telemetry.

---

## 2. Phase-by-phase plan

### Phase 13.5 — Agentic GraphRAG (V1.0) — **FULLY IMPLEMENTED on main** (2026-05-13)

**MVP 0–4 deferral rationale:** plan §9 — "deferred to V1. Phase 13 is 'Graph Agent Lite' intentionally — overbuilding adaptive planning in MVP risks the G9 boundary verification."

**Status (post-merge):**
- Graph Agent Lite (`server/agent-studio/services/graph-agent/`) ships both a fixed plan→retrieve→reason→answer pipeline AND a bounded adaptive loop via `runAgentic()`.
- Phase 13.5 trio merged: PR #731 (contract) + PR #732 `ffb4eba9` (engine wiring + `RoundRobinPlanner`) + PR #737 `a8f5c634` (`createModelDrivenPlanner` for LLM-emitted plans).
- 62/62 tests green on main (boundary 27 + model-planner 20 + engine-agentic 9 + engine 6).
- MCP dispatcher boundary + OpenRouter Model Access boundary + no-mutation property all source-scan tested under the agentic surface.
- See ADR `docs/architecture/agent-studio-agentic-graphrag.md` (Status: ACTIVE) for the truth-claim table.

**Acceptance criteria:**
1. Planner contract — explicit ADR + TS interface for `AgenticPlanner`:
   `plan(query, prevSteps) → { action: "retrieve" | "answer" | "stop", arguments: ... }`
2. Bounded adaptive retrieval loop — `services/graph-agent/agentic-loop.ts`:
   max-N-iterations bound (configurable; default 4), short-circuits when answer-confidence ≥ threshold or budget exhausted.
3. No direct tool execution from the planner — all tool calls still route through `dispatchMcpToolCall()`. Source-scan tested.
4. No direct graph mutation — same Phase 11.5 proposal/approval surface as Graph Agent Lite.
5. Full trace emission — every iteration writes a `graphAgentDecisionTrace` step row (stepKind: `agentic_iteration_N`).
6. Governance guardrails — `agentic_eligibility` flag on skill packs; only packs explicitly marked agentic-eligible can be used by the loop.
7. Property-based tests — extend `graph-permission-visibility-property.test.ts` to cover multi-iteration paths (no leak across iterations).
8. First PR ships only the planner contract + tests + ADR — no engine wiring yet. Engine integration follows in PR #2.

**First implementation PR (Phase 13.5 / PR #1):**
- New file: `docs/architecture/agent-studio-agentic-graphrag.md` (ADR with boundary table)
- New file: `server/agent-studio/services/graph-agent/agentic-planner-contract.ts`
- New file: `server/agent-studio/services/graph-agent/agentic-loop.ts` (no-op stub returning `action: "stop"` to keep boundaries verifiable)
- New file: `tests/agent-studio/agentic-planner-boundary.test.ts` — source-scan: no `neo4j-driver` import, no direct `dispatchMcpToolCall` call (must route through engine), no direct graph mutation, max-iterations guard exists.

**Dependencies:** MVP 4 G9 closure (done). Production-hardening Phase J-1 ops runbook is parallel.

**Governance:** Touch with Reviewer + Governance both. Adaptive loops historically slip past dispatcher/governance boundaries; the ADR + source-scan tests are non-negotiable.

---

### Phase 15 — Templates / Attachments standalone scope (V1.5)

**MVP 0–4 deferral rationale:** plan §9 — Phase 15 standalone scope was bundled into MVP 1 Phase 4 + 5; standalone management surfaces deferred.

**Status today:**
- Templates: `services/vault/markdown-import-export.ts` handles import/export. No dedicated template-management UI surface.
- Attachments: `services/vault/attachments.ts` handles attachment binding. No dedicated attachment library / quota / scrubbing surface.

**Acceptance criteria:**
1. Template management UI page — operator can create / edit / delete / browse vault templates (route `/agent-studio/templates`).
2. Template-instantiation tracking — `agsVaultTemplateInstantiations` table records which note was created from which template (for refactor-safety + audit).
3. Attachment library UI — operator can browse attachments across vault, filter by mime, drop unused.
4. Attachment quota enforcement — per-workspace MB cap; configurable; surfaced in `RetrofitPage` operator dashboard alongside retention crons.
5. Source-scan + unit tests for the new surfaces.

**First implementation PR (Phase 15-α):**
- New file: `client/src/modules/agent-studio/pages/TemplatesPage.tsx`
- New file: `client/src/modules/agent-studio/pages/AttachmentLibraryPage.tsx`
- New file: `drizzle/tables/agent-studio-vault-template-instantiations.ts`
- New file: `tests/agent-studio/vault-template-instantiation.test.ts`

**Dependencies:** MVP 1 (done).
**Governance:** Touch the Vault module manifest; ensure publication boundaries preserved.

---

### Phase 16 — Saved views extended scope (V1.5)

**Status today:**
- MVP minimal saved views exist (`services/vault/saved-views.ts`). Per-user, per-workspace, JSON definition.

**Acceptance criteria:**
1. Sharing model — saved views can be marked `workspace_shared` (visible to all members) vs `personal`.
2. Versioning — saved-view definitions are immutably versioned (same shape as `agsNoteVersions`).
3. UI surface — saved-views browser, edit / share / version-history.
4. Permission-aware materialization — shared saved views must respect viewer's permissions (re-runs the visibility filter per viewer, not snapshot of author's results).

**First implementation PR (Phase 16-α):**
- Extend `services/vault/saved-views.ts` with sharing + versioning columns
- Migration: `agsSavedViews` adds `visibility`, `version`, `parentSavedViewId`
- New file: `client/src/modules/agent-studio/components/SavedViewsBrowser.tsx`
- Property-based test: visibility filter is re-applied per viewer

**Dependencies:** MVP 1 (done). Permission filter pushdown (G8, done).

---

### Phase 17 — Canvas data model + minimal UI (V1.5)

**MVP 0–4 deferral rationale:** plan §9 — Phase 17 lands as ADR-only in MVP 0; full implementation deferred.

**Status today:** ADR exists at `docs/architecture/agent-studio-canvas-strategy.md`.

**Acceptance criteria:**
1. Canvas data model — `agsCanvases` + `agsCanvasNodes` + `agsCanvasEdges` tables (additive; no overlap with `agsGraphNodes`/`agsGraphEdges`).
2. Canvas → Vault projection — when a Canvas references a note, the relationship projects into the graph backend as a typed edge (`CANVAS_REFERENCES_NOTE`).
3. Minimal UI — operator can create / open / arrange a Canvas; nodes are notes + free-text + embedded queries.
4. No plugin framework yet — Canvas is a first-class module, not a plugin host. (Phase 18 wires plugins in.)
5. CAG/RAC awareness — Canvas content can flow into CAG blocks via the existing source-note reference path (Phase 10).

**First implementation PR (Phase 17-α):**
- New tables in `drizzle/tables/agent-studio-canvas.ts`
- New file: `server/agent-studio/services/canvas/manifest.ts` + `public-api.ts` + `router.ts`
- Frontend: `client/src/modules/agent-studio/pages/CanvasPage.tsx`
- Source-scan boundary tests: Canvas data goes through GraphRepository for relationship queries; no direct neo4j-driver imports.

**Dependencies:** Phase 7 (typed graph), Phase 12 (retrieval).

---

### Phase 18 — Extension framework (V1.5)

**MVP 0–4 deferral rationale:** plan §9 — Phase 18 lands as ADR-only in MVP 0; full implementation deferred.

**Status today:** ADR exists at `docs/architecture/agent-studio-extension-framework-strategy.md`.

**Acceptance criteria:**
1. Extension registry — `agsExtensions` table tracks installed extensions per workspace.
2. Extension manifest contract — TS interface in `services/extensions/contracts.ts` defining: identity, capability declarations (which RACT lanes can the extension hook), required permissions, signing key.
3. Governance — extensions must pass the same approval scaffolding as new agents (`agsApprovalSteps` reused).
4. Capability-pinned dispatch — extensions cannot bypass the MCP dispatcher. Each extension declares which tools it intends to invoke; runtime asserts the declared set matches actual calls.
5. Source-scan blockers — no extension code can `import { dispatchMcpToolCall }` directly; must use the wrapper `services/extensions/runtime.ts:invokeFromExtension()`.
6. UI — extension management page (browse, install, approve, disable).

**First implementation PR (Phase 18-α):**
- New file: `drizzle/tables/agent-studio-extensions.ts`
- New file: `server/agent-studio/services/extensions/manifest.ts` + `contracts.ts` + `runtime.ts`
- New file: `tests/agent-studio/extension-dispatcher-boundary.test.ts` — source-scan + unit
- Frontend: `client/src/modules/agent-studio/pages/ExtensionsPage.tsx`

**Dependencies:** MCP dispatcher chokepoint (G7, done). Approval scaffolding (Cycle-4, done).

---

### Phase 19 — Sync / publish strategy (V1.0)

**MVP 0–4 deferral rationale:** plan §9 — Phase 19 lands as ADR-only in MVP 0; full implementation deferred.

**Status today:** Existing publish surface in `services/promotion/` covers note-version-pinned bindings. No multi-target sync (publish to staging-env, publish to remote vault, publish to external KB).

**Acceptance criteria:**
1. Publish target registry — `agsPublishTargets` table: target id + type (`staging_env` | `remote_vault` | `external_kb`) + endpoint + credentials reference (via `withProviderCredential` — Plan v3 D1, no env reads).
2. Publish-request workflow — operator creates a publish request, governance signs off (existing scaffolding), worker pushes to target with retry/idempotency.
3. Telemetry — publish results land in `agsPublishResults` and the workspace-observability bundle.
4. Rollback — every published artifact carries the source `notePromotionId` so rollback walks the existing promotion-rollback path.

**First implementation PR (Phase 19-α):**
- New table: `agsPublishTargets`
- Extend `services/promotion/` (do not greenfield) with target binding
- Source-scan: no direct `process.env.*_API_KEY` reads (D1)
- Integration test: publish request → target push → ledger row

**Dependencies:** Promotion governance (G7, done). Provider connections (Plan v3 D1, done).

---

### Track J / Phase 27 — Production hardening (V1.0 partial; V2.x full)

**MVP 0–4 deferral rationale:** CLAUDE.md Non-Build List + plan §13 Q4 — out-of-scope until Neo4j CE limits actually bite in production.

**Status today:**
- Upgrade path documented at `docs/architecture/agent-studio-neo4j-aura-upgrade-path.md`.
- Reference architecture at `docs/architecture/agent-studio-neo4j-aura-agent-reference-architecture.md`.
- No operator-actionable runbook for the upgrade itself.

**V1.0 acceptance criteria (Phase J-1 — operator runbook):**
1. Operator-actionable runbook at `docs/runbooks/agent-studio-neo4j-ce-to-aura-migration-runbook.md` with:
   - Trigger conditions (when CE limits bite — query throughput, write contention, fan-out depth)
   - Pre-flight inventory (active graph backend, projection queue state, fixture freshness)
   - Migration steps (Aura provision, projection-queue drain, dual-write window, cutover)
   - Verification — Aura + ASDB row-count parity, projection-queue idle
   - Rollback — restore CE bolt URI, replay queue
   - Evidence path
2. Alerting hooks — Phase 14 trace-graph cron checks Neo4j health latency + writes a `runtime_alert` on threshold breach.

**V2.x acceptance criteria (Track J full):**
1. Aura adoption (operator pull-trigger).
2. Multi-region (see Phase MR-1).
3. Production SLO budget for the graph stack (extends `agent-studio-runtime-slo.md`).

**First implementation PR (Phase J-1):**
- New file: `docs/runbooks/agent-studio-neo4j-ce-to-aura-migration-runbook.md`
- New file: `server/agent-studio/services/graph/health-alert.ts` (writes runtime_alert on threshold breach)
- New file: `tests/agent-studio/graph-health-alert.test.ts`

**Dependencies:** Phase 14 runtime trace graph (done). Phase 27 ADR (done).

---

### Phase MR-1 — Multi-region graph deployment (V2.0)

**Status today:** ADR exists at `docs/architecture/agent-studio-multi-region.md` (forward-looking, single-region operational baseline).

**Acceptance criteria:**
1. Region registry — `agsRegions` table: region id + canonical Postgres URI + canonical Neo4j URI + active flag.
2. Routing model — workspace → region pinning; queries route to the workspace's home region; cross-region reads are denied unless workspace is replicated.
3. Replication model — Postgres logical replication (Aurora-style or pg_basebackup-based); Neo4j projection re-built per region from the local Postgres source-of-truth.
4. Failover runbook — `docs/runbooks/agent-studio-multi-region-failover-runbook.md`.
5. Governance — cross-region promotion / publish requires explicit governance step.

**First implementation PR (Phase MR-1):**
- New file: `docs/runbooks/agent-studio-multi-region-failover-runbook.md`
- New table: `agsRegions`
- Source-scan: any `import { db }` resolves via the region-routed connection helper, never the global pool.

**Dependencies:** Track J operator runbook (Phase J-1).
**Risk:** Highest in V2.0 — touches the most boundaries. Single phase, multiple PRs.

---

### Phase CRDT — Real-time collaborative editing (V2.0)

**Status today:** No CRDT support; vault notes use last-writer-wins. No existing ADR.

**Acceptance criteria:**
1. ADR at `docs/architecture/agent-studio-realtime-collab-crdt.md` (this PR creates it) — pinned CRDT choice (Yjs leading candidate; comparison vs Automerge), source-of-truth model (Postgres remains canonical; CRDT layer is presence + cursor + transient edits), governance boundaries.
2. Presence + cursor surface — `services/vault/presence.ts` tracks who is in which note in near-real-time (no persistence beyond session).
3. CRDT document layer — `services/vault/realtime-doc.ts` wraps Yjs document; sync with backend uses the existing Vault repository at save boundaries.
4. Conflict policy — concurrent edits merge via Yjs; on save, the Vault repository writes the new canonical version; `agsNoteVersions` row is created.
5. Audit — every save resulting from a multi-author session is tagged in `agsRuntimeRuns` so audit can reconstruct collaborator list.

**First implementation PR (Phase CRDT-α):**
- New file: `docs/architecture/agent-studio-realtime-collab-crdt.md` (lands with THIS V1+ plan PR as a stub ADR; full content in dedicated PR)
- New file: `server/agent-studio/services/vault/presence.ts`
- Source-scan: no concurrent-write bypass of `agsNoteVersions`.

**Dependencies:** Vault editor (MVP 1, done).
**Risk:** UI complexity, fork-merge edge cases. Plan many small PRs.

---

### Phase OL-1 — Offline / local-first mode (V2.0)

**Status today:** No offline support. No existing ADR.

**Acceptance criteria:**
1. ADR at `docs/architecture/agent-studio-offline-local-first.md` (this PR creates it) — source-of-truth rules (server remains canonical; offline cache is a derived view), sync conflict policy (CRDT-aware when CRDT phase lands; otherwise field-level merge), graph projection behavior (stale until reconnect), security model (no graph mutation in offline mode; offline writes queue for governance review on reconnect).
2. Service-worker scaffold — client-side cache of recent notes + linked-graph subset.
3. Sync queue — offline writes accumulate in IndexedDB; on reconnect, queue replays through normal `services/vault/*` write paths (and approval/governance as needed).

**First implementation PR (Phase OL-1):**
- New file: `docs/architecture/agent-studio-offline-local-first.md` (this PR creates ADR stub)
- New file: `client/src/modules/agent-studio/services/offline-cache.ts`

**Dependencies:** CRDT phase (in particular, the merge semantics if CRDT is in scope).
**Risk:** Security model — offline graph mutations are a leak surface. Governance enforcement on reconnect is the load-bearing piece.

---

## 3. Cross-cutting hard rules (V1+)

These extend the CLAUDE.md Non-Build List. They MUST be source-scan tested in every PR that touches the relevant surface:

| Rule | Applies to |
|---|---|
| Provider credentials flow through `withProviderCredential` (Plan v3 D1) — never `process.env.*_API_KEY` reads in script bodies | Phase 19-α (sync/publish), Phase 13.5 (agentic engine eventually) |
| Postgres = source of truth; CRDT layer + offline cache are derived | Phase CRDT, Phase OL-1 |
| Region-router boundary — no direct `db` import in region-scoped code | Phase MR-1 |
| Extension dispatcher boundary — no direct `dispatchMcpToolCall` import outside `services/extensions/runtime.ts` | Phase 18 |
| Agentic loop boundary — bounded max-iterations + governance flag | Phase 13.5 |
| Graph mutations only through Phase 11.5 proposal/approval | All V1+ phases that touch the graph |

---

## 4. Testing layers added in V1+

The V1+ plan adds two new test layers on top of the existing 1–9:

| Layer | What it tests | Lands in |
|---|---|---|
| **Layer 10 — adaptive loop boundary** | Agentic GraphRAG max-iterations, no-mutation, governance-flag respected | Phase 13.5 |
| **Layer 11 — cross-region routing** | Workspace → region pinning, cross-region denial, failover replay | Phase MR-1 |

Layer 4 — e2e browser tests — also lands in V1.0 (covered separately in PR-C of the closure bundle: Playwright smoke + ADR + first executable test).

---

## 5. Risk register (V1+)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Agentic loop slips past dispatcher | Medium | Critical | Source-scan + property-based tests + Reviewer + Governance both review |
| CRDT introduces silent data loss on merge | Medium | High | Property-based tests on merge semantics; every save creates an `agsNoteVersions` row |
| Offline writes leak ungoverned mutations | High | Critical | On-reconnect approval gate (no offline write skips governance) |
| Multi-region split-brain | Low | Critical | Cross-region read-deny default; explicit replication-aware promotion |
| Extension framework grows into a parallel runtime | High | Critical | Capability-pinned dispatch + Phase 18 source-scan tests |
| V1+ scope creep delaying V2 | Medium | Medium | Each phase has a "first implementation PR" identified — ship slim |

---

## 6. First-slice PR ledger (2026-05-13)

| PR | Phase | Scope | Merge SHA |
|---|---|---|---|
| #748 (PR-V1-1) | Phase J-1 | Graph health-alert evaluator + scanner + `ags_runtime_alerts` table; threshold-breach taxonomy for the Neo4j CE → Aura migration trigger conditions | `23e47643` |
| #749 (PR-V1-2) | Phase 19-α | `ags_publish_targets` + `ags_publish_target_executions` ledger + `services/publish-targets/` (Plan v3 D2-clean — pusher owns credential acquisition) | `892519b0` |
| #750 (PR-V1-3) | Phase 15-α | `ags_vault_template_instantiations` ledger + `services/vault/template-instantiations.ts` (sha256 digest + record/list helpers) + router wiring | `71c6889d` |
| #751 (PR-V1-4) | Phase 16-α | Saved views: `visibility` + `version` + `parentSavedViewId` columns + `saved-views-visibility.ts` (per-viewer materialization filter; load-bearing #4 acceptance) | `a6959a6d` |
| #752 (PR-V1-5) | Phase 17-α | Canvas data model (3 tables) + `services/canvas/` (CRUD + snapshot loader + note-reference projection helper) | `9fc503de` |
| #753 (PR-V1-6) | Phase 18-α | Extension framework: `ags_extensions` + `ags_extension_invocations` + `evaluateCapability` (pure) + `invokeFromExtension()` (only path to MCP dispatcher) | `9f019393` |
| #754 (PR-V2-1) | Phase MR-1 | `ags_regions` + `services/region/` (pure router with cross-region deny) + multi-region failover runbook | `1bf8e509` |
| #755 (PR-V2-2) | Phase CRDT-α | `ags_vault_note_presence` (5-min idle TTL) + `services/vault/presence.ts` (enter / heartbeat / leave / list with eager eviction) | `0b36c820` |
| #756 (PR-V2-3) | Phase OL-1 | `client/src/modules/agent-studio/services/offline-cache.ts` — `OfflineQueue` + load-bearing deny-list for graph + agent + provider operations | `3e6bae92` |

All 9 first-slice PRs landed on main on 2026-05-13. Each carries:
- Closed-taxonomy type unions where applicable
- Source-scan boundary tests preserving CLAUDE.md / Plan v3 D2 invariants
- ASDB-unavailable test fall-through patterns
- No raw `process.env.*_API_KEY` reads, no `credential-resolver` imports outside model-access, no `dispatchMcpToolCall` imports outside the MCP chokepoint / `services/extensions/runtime.ts` wrapper

**Status:** V1.0 + V1.5 + V2.0 first slices are now **FULLY IMPLEMENTED** at the data-model + service + boundary-test layer. UI surfaces and lane-specific runtime hooks land in subsequent β/γ slices per each phase's "out of scope for the α slice" section.

### 6.1 Second-slice (β/γ) PR ledger — opened 2026-05-13

| PR | Phase | Scope | Merge SHA |
|---|---|---|---|
| #758 (PR-V1-7) | Phase J-1-β | Health-alert cron (`services/graph/health-alert-cron.ts`) wrapping PR-V1-1 evaluator via `makeRetentionCron` factory at `*/5 * * * *`; boot Step 3.25; admin tRPC `agentStudio.graphHealth.getAlertCronStatus` + `listOpen` | `660303f6` |
| #759 (PR-V1-8) | Phase 19-β | Shared `makeHttpPusher` factory + `registerDefaultPublishPushers()` wiring the 3 target types (`staging_env` POST /promote / `remote_vault` PUT /vault/notes / `external_kb` POST /ingest); boot Step 3.26 | `525c5f8b` |
| #760 (PR-V1-9) | Phase 15-β | Attachment library service (`services/vault/attachment-library.ts`): browseAttachmentLibrary (vault-wide + mime-class filter + sort) + findUnusedAttachments (LEFT JOIN to vault_notes for trash detection) + computeAttachmentQuota + closed 6-value mime-class taxonomy | `ad7f9829` |
| #761 (PR-V1-10) | Phase 17-β | Canvas → Note projection edge (`services/canvas/projection.ts`): buildCanvasReferenceProjection emits the 4-write bundle (Canvas + CanvasNode + CONTAINS_CANVAS_NODE + CANVAS_REFERENCES_NOTE); ProjectionSyncWorker handles `canvas.note_reference_changed` / `_removed` event kinds | `e608cffe` |
| #762 (PR-V1-11) | Phase OL-2 | OfflineQueue durability (`client/.../offline-cache-store.ts`): closed `OfflineQueueStore` contract + `InMemoryOfflineQueueStore` (test default + non-browser fall-through) + `IndexedDbOfflineQueueStore` (production; lazy-open db `agent-studio-offline` / store `offline_queue`) + `createOfflineQueueStore()` factory; OfflineQueue gains optional `persistence` adapter + `hydrate()` to restore on reload; no breaking change to OL-1 API | `c67fab23` |
| #763 (PR-V1-12) | Phase MR-2 | Region-routed connection helper (`services/region/connection-helper.ts`): `getDbForRegion(region, opts)` with per-regionKey Drizzle pool cache + `getDbForWorkspace(input, opts)` composing the MR-1 pure router + `getNeo4jUriForRegion(region)` + `listWarmRegionPoolKeys()` operator inspection. Caller migration deferred to a follow-up sub-arc | `af8b1667` |
| #764 (PR-V1-13) | Phase CRDT-β | Realtime document layer (`services/vault/realtime-doc.ts`): pinned `RealtimeDocBackend` interface (encodeSnapshot/applyUpdate/getText/setText/pendingUpdateCount) + `InMemoryRealtimeDocBackend` reference impl (zero deps; JSON-encoded snapshots; last-writer-wins) + `RealtimeDocSession` wrapper + process-local session registry + `getCanonicalContentForSave` save-boundary helper. Yjs adapter + WebSocket transport + browser IDB persistence land in CRDT-γ | `183f0909` |
| #765 (PR-V1-14) | Phase CRDT-γ | Yjs adapter (`services/vault/realtime-doc-backend-yjs.ts`) implementing the CRDT-β `RealtimeDocBackend` contract via a typed-only `YjsNamespace` DI seam — production passes `Y` from `import * as Y from "yjs"` (declared in package.json under `dependencies`); unit tests use a typed fake and run locally without the yjs install. WebSocket transport + browser IDB persistence land in CRDT-γ-2 | `2a534c51` |
| #766 (PR-V1-15) | Phase 15-γ | Attachment quota write-gate (`services/vault/attachment-quota-guard.ts`): `assertWithinQuota({ vaultId, sizeBytesAdded, bytesLimit })` pure function (calls `computeAttachmentQuota` + projects usage + throws `AttachmentQuotaExceededError`) + `resolveDefaultAttachmentBytesLimit()` env-based config resolver (`AGS_VAULT_ATTACHMENT_BYTES_LIMIT`). Caller integration into `createAttachment` deferred to a follow-up sub-arc | `61e0c600` |
| #767 (PR-V1-16) | Phase 16-β | `listVisibleSavedViewsForUser` (`services/vault/saved-views.ts`): composes `listSavedViews` + the pure `filterVisibleSavedViews` predicate from `saved-views-visibility.ts` so per-viewer filtering happens in one call. `options.listImpl` DI seam keeps the composition testable without a live ASDB. Existing `listSavedViews` (operator/admin path) unchanged | `0c04a3a5` |
| #768 (PR-V1-17) | Phase 18-β | Extension lane hook registry (`services/extensions/lane-hooks.ts`): process-local `Map<ExtensionCapabilityLane, LaneHookFn>` + `registerLaneHook` (rejects `lane="tool"` — dispatcher-only invariant) + `getLaneHook` + `listRegisteredLaneHookLanes` + `__resetExtensionLaneHooksForTests`. `invokeFromExtension` calls the registered hook for non-tool lanes (capability check + hook + ledger), captures throws as `{ succeeded: false, errorMessage }`, falls back to α "assert + ledger" when no hook is registered. `options.getDb` test seam added to runtime for ASDB-unavailable test path | `09c67999` |
| #769 (PR-V1-18) | Phase 16-γ | Immutable saved-view version history: new `ags_vault_saved_view_versions` table (savedViewId + version unique; name/viewKind/filters/sort/columns/visibility/capturedByUserId/capturedAt) + `updateSavedView` captures prior row snapshot BEFORE applying the patch (not-found check moves earlier to the snapshot read) + `listSavedViewVersions(savedViewId)` + `getSavedViewVersionById(versionId)` + `UpdateSavedViewOptions.capturedByUserId` for audit trail | `200d4665` |
| #770 (PR-V1-19) | Phase 16 wire-up | Vault router gains 3 protected tRPC procedures wiring the 16-β + 16-γ service surfaces: `listVisibleSavedViews` threads `ctx.user.id` as `viewerUserId` into the service; `listSavedViewVersions(savedViewId)` + `getSavedViewVersion(versionId)` expose the immutable history. 11-test source-scan procedure-mount integrity suite at `tests/agent-studio/vault-saved-views-router-procedures.test.ts` | `3db12f93` |
| #771 (PR-V1-20) | Phase 15-γ wire-up | `createAttachment` router mutation enforces the quota: calls `assertWithinQuota({ vaultId, sizeBytesAdded, bytesLimit: resolveDefaultAttachmentBytesLimit() })` BEFORE the insert; maps `AttachmentQuotaExceededError` to `TRPCError code="FORBIDDEN"` (not the default INTERNAL_SERVER_ERROR); 8-test source-scan order-of-operations + error-code-mapping suite at `tests/agent-studio/vault-attachment-quota-router-wireup.test.ts` | `fdf7ba36` |
| #772 (PR-V1-21) | Phase 19-γ | Publish executor governance gate (`services/publish-targets/`): closed `GOVERNANCE_DECISIONS` 3-value taxonomy (`approved`/`pending`/`rejected`) + `GovernanceGateFn` + `isGovernanceDecision` narrowing in `types.ts`; `executePublish` branches: rejected → ledger row `status=failed` + `errorMessage="governance_rejected"` + `details.governanceDecision="rejected"`, pending → `status=pending` + `details.governanceDecision="pending"`, both short-circuit before the pusher runs; new `targetLoader` test seam in `ExecutePublishInput` for ASDB-unavailable unit-test path. 11-test suite at `tests/agent-studio/publish-targets-governance-gate.test.ts`. The gate is operator-supplied (DI); real `agsApprovalSteps` wiring lands in a follow-up adapter | `123de148` |
| #773 (PR-V1-22) | Phase OL-3 | OfflineQueue client bootstrap (`client/.../offline-cache-bootstrap.ts`): `getOfflineQueueInstance(opts)` module-singleton lazy-init with `createOfflineQueueStore()` (picks IDB in browser, InMemory elsewhere) + `__resetOfflineQueueInstanceForTests`; `hydrateOfflineQueueOnLoad(opts)` rehydrates persisted entries with `beforeHydrate/afterHydrate` telemetry hooks; `installOfflineDrainListener({ onDrain, eventTarget?, afterDrain? })` registers a `window.addEventListener("online", drainNow)` handler and returns an `OfflineDrainListenerHandle { drainNow, uninstall }`. SSR/CLI no-op-installer fall-through path. 17-test suite at `tests/agent-studio/offline-cache-bootstrap.test.ts` | `d5806bf8` |
| #774 (PR-V1-23) | Phase CRDT-γ-2 | Realtime-doc WebSocket transport scaffold (`services/vault/realtime-doc-transport.ts`): `RealtimeDocConnection` narrow interface (send/on(message)/on(close)/close) + `RealtimeDocTransport.attachConnection(conn, opts)` lifecycle: sends initial snapshot, wires `on("message")` → `session.handleUpdate` + broadcast to peers (originator-skip + per-peer error tolerance), `on("close")` → `detachConnection` + drop session when last client leaves AND `backend.pendingUpdateCount() === 0`. `shouldBroadcast` gate. Module-singleton accessor + test reset seam. 14-test suite at `tests/agent-studio/vault-realtime-doc-transport.test.ts`. Out of scope: y-protocols message framing + auth/authz upgrade + reconnect (CRDT-γ-3) | `5c69ae7b` |
| #775 (PR-V1-24) | MR×19 integration | Cross-region publish governance composition (`services/publish-targets/cross-region-governance.ts`): `requiresCrossRegionGovernance({ sourceRegionKey, targetRegionKey })` pure predicate (true iff both known + differ; null on either side treated as same-region) + `wrapWithCrossRegionGovernance(baseGate, opts)` adapter that composes any `GovernanceGateFn` with the cross-region check (same-region passes through to the base gate; cross-region downgrades to `pending` by default or `rejected` mode). Closes V1+ plan §MR-1 acceptance criterion #5 ("Governance — cross-region promotion / publish requires explicit governance step"). 16-test suite at `tests/agent-studio/publish-targets-cross-region-governance.test.ts` | `d02e3ae6` |
| #776 (PR-V1-25) | AS-1 ApprovalSteps gate adapter | Concrete `agsApprovalSteps` adapter for the 19-γ governance gate (`services/publish-targets/governance-gate-approval-steps.ts`): `decideGovernanceFromApprovalSteps(steps)` pure rule (any rejected → "rejected"; non-empty all-approved → "approved"; else "pending") + `createApprovalStepsGovernanceGate(opts)` factory returning a `GovernanceGateFn`. DI seams: `resolvePublishRequestId(input) → number \| null`, `getDb` (defaults to `getAsDb`), and `listApprovalSteps(id)` (test seam bypasses ASDB entirely). Read-only against `agsApprovalSteps`; defensive `"pending"` when the resolver returns null or ASDB is unavailable (never silent approve). 22-test suite at `tests/agent-studio/publish-targets-governance-gate-approval-steps.test.ts` | `1798c1bc` |
| #777 (PR-V1-26) | OL-4 offline drain dispatcher registry | Module-scoped registry + dispatcher composer that bridges OL-3's `installOfflineDrainListener({ onDrain })` and the per-kind tRPC drain implementations (`client/src/modules/agent-studio/services/offline-drain-dispatcher.ts`). Mirrors the server-side `publish-targets/registry.ts` pattern: `registerOfflineDrainImpl({ kind, impl })` / `getOfflineDrainImpl(kind)` / `listRegisteredOfflineDrainKinds()` / `__resetOfflineDrainRegistryForTests()` + `OfflineDrainImplNotRegisteredError` raised on unknown kind (no silent drop — Phase OL-3 keeps the entry queued and bumps `attempts`). `createOfflineDrainDispatcher({ lookup? })` returns an `OfflineDrainOne`-compatible function. The dispatcher does NOT re-validate `OFFLINE_DENIED_OPERATION_KINDS` — `OfflineQueue.enqueue()` is the gate. 18-test suite at `tests/agent-studio/offline-drain-dispatcher.test.ts` | `a16cf4f8` |
| #778 (PR-V1-27) | OL-5 default offline drain impls factory | Mirror of `publish-targets/defaults.ts` for the OL-4 registry (`client/src/modules/agent-studio/services/offline-drain-defaults.ts`). `registerDefaultOfflineDrainImpls({ updateNote, createNote, deleteNote })` wires the three `OFFLINE_OPERATION_KINDS` into the dispatcher registry: each closure receives the raw entry payload and resolves to void (return values discarded). Idempotent — re-registration overwrites prior closures per kind. The factory is tRPC-type-free (no `AppRouter` import) so the offline-cache module stays buildable without a tRPC namespace dependency; callers (App.tsx bootstrap) supply the trpc closures at call time. Returns the kinds in deterministic alphabetical order. 13-test suite at `tests/agent-studio/offline-drain-defaults.test.ts` | `8fc11b49` |
| #779 (PR-V1-28) | OL-6 offline cache full bootstrap composer | Single-call composer (`client/src/modules/agent-studio/services/offline-cache-full-bootstrap.ts`) that wraps the locked OL-5→OL-4→OL-3 chain: `bootstrapOfflineCache({ updateNote, createNote, deleteNote, beforeHydrate?, afterHydrate?, afterDrain?, eventTarget? })` runs `registerDefaultOfflineDrainImpls` → `createOfflineDrainDispatcher()` → `await hydrateOfflineQueueOnLoad(...)` → `installOfflineDrainListener({ onDrain: dispatcher })` in order, returning `{ hydratedCount, handle }`. App.tsx / main.tsx call sites become one-liners. tRPC-type-free (no `AppRouter`/`@/lib/trpc` imports — closures injected). With this, the OL-1→OL-6 chain is end-to-end composed at the service layer; remaining work is the real App.tsx call site with live trpc mutations. 13-test suite covering composition, online-event drain through plain `EventTarget`, hydratedCount, telemetry beacons, uninstall semantics, and source-scan boundaries | `4d9abb01` |
| #780 (PR-V1-29) | NV-1 server-side `vault.note.delete` procedure | Closes the contract gap surfaced during OL-5: `OFFLINE_OPERATION_KINDS` declares `vault.note.delete` but the vault router had no `deleteNote` procedure. Adds `NoteDeleteInput` Zod (noteId + optional `expectedVersion` for online optimistic-lock; optional for offline-drain replays that may not know current state) + `VaultRepository.deleteNote(input, userId)` interface method + `VaultRepositoryStub` semantics (idempotent on already-deleted, conflict on version-mismatch, notFound on missing id) + `AsdbVaultRepository` soft-delete impl (`UPDATE ags_vault_notes SET deletedAt = NOW()` with `deletedAt IS NULL` precondition + `getNoteById` left unfiltered for audit-recovery; `listNotesInVault` already filters `deletedAt IS NULL` so deleted notes drop out of listings) + `agentStudio.vault.deleteNote` tRPC mutation (NOT_FOUND TRPCError on missing, alreadyDeleted:true on idempotent second call, conflict+latestVersion on optimistic-lock mismatch). 21-test suite at `tests/agent-studio/vault-delete-note.test.ts` (contract parsing, stub semantics, router source-scan, ASDB source-scan) | `f26c3829` |
| #781 (PR-V1-30) | OL-7 main.tsx wire-up to vanilla tRPC client | New `client/src/modules/agent-studio/services/offline-cache-app-wireup.ts` builds a vanilla `createTRPCClient<AppRouter>` (sibling to the React-hooks client) and wires its three `agentStudio.vault.*Note` mutations into `bootstrapOfflineCache` (OL-6). `main.tsx` imports and `void`-invokes `wireOfflineCacheToTrpc()` once at boot — fire-and-forget so a failed bootstrap never blocks render. Hard-rule clean (no `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY` / `neo4j-driver`). 11-test source-scan suite (`tests/agent-studio/offline-cache-app-wireup.test.ts`) covering tRPC client shape, mutation bindings, `.catch` failure path, hard-rule absences, + `main.tsx` single-call invariant. Closes the OL-1→OL-7 end-to-end offline-cache compose chain at the live App.tsx boundary | `75313ad2` |
| #782 (PR-V1-31) | AS-2 default governance-gate registry | Module-singleton registry (`server/agent-studio/services/publish-targets/default-governance-gate.ts`) consulted by `executePublish` when callers do not supply an explicit `governanceGate`. Exposes `installDefaultGovernanceGate` / `getDefaultGovernanceGate` / `hasDefaultGovernanceGate` / `__resetDefaultGovernanceGateForTests` (parallels the existing `registry.ts` pattern). Executor falls through via `input.governanceGate ?? getDefaultGovernanceGate()` — per-call gates still win. With this, AS-1's `createApprovalStepsGovernanceGate` can be installed once at boot rather than threaded through every `executePublish` caller. 16-test suite at `tests/agent-studio/publish-targets-default-governance-gate.test.ts` (registry lifecycle + executor fall-through + per-call precedence + barrel re-export + source-scan boundary). Real `installDefaultGovernanceGate(createApprovalStepsGovernanceGate(...))` boot call defers to a follow-up PR that owns the `resolvePublishRequestId` mapping | `b0e906e3` |
| #783 (PR-V1-32) | OL-8 offline-cache enqueue helper | Consumer-side surface for the OL-1..OL-7 compose chain (`client/src/modules/agent-studio/services/offline-cache-enqueue.ts`). Single helper `enqueueOfflineVaultMutation({ kind, payload, id?, generateId?, queue? })` that (1) routes through the OL-3 module-singleton queue, (2) generates a UUIDv4 id when none supplied (default via `crypto.randomUUID`; `generateId` test seam), and (3) delegates `assertOfflineQueueable(kind)` to `OfflineQueue.enqueue()` so the OL-1 deny-list is still the only gate. Re-exports `OfflineMutationDeniedError` for callers wanting to catch + degrade. tRPC-type-free (no `AppRouter` import) so the offline-cache module stays buildable without a tRPC namespace dependency — payloads stay `Record<string, unknown>` and the server re-runs Zod on drain. 15-test suite at `tests/agent-studio/offline-cache-enqueue.test.ts` (happy path, caller-supplied id, generateId seam, default crypto.randomUUID shape, deny-list rejection, unknown-kind rejection, allowlist coverage, source-scan boundary) | `192dc42b` |
| #784 (PR-V1-33) | AS-3 composeGovernanceGates helper | Pure generic composer (`server/agent-studio/services/publish-targets/compose-governance-gates.ts`): runs N `GovernanceGateFn`s in order; returns the strictest decision (rejected > pending > approved); short-circuits on rejected so an expensive gate (DB lookup, remote call) is skipped when a cheap pre-check has already rejected; defensive snapshot so caller mutation of the input array after composition does not change behavior; empty list returns "approved" (no constraint, preserves executor's "no gate ⇒ approved" semantics). With AS-1 (`createApprovalStepsGovernanceGate`) + AS-2 default-gate registry + this composer, operators can install `installDefaultGovernanceGate(composeGovernanceGates([approvalStepsGate, wrapWithCrossRegionGovernance(...)]))` at boot to enforce BOTH approval-steps AND cross-region governance without hand-rolling a wrapper. 17-test suite at `tests/agent-studio/publish-targets-compose-governance-gates.test.ts` (decision matrix + short-circuit + order preservation + defensive snapshot + public-api re-export + source-scan boundary including no `drizzle-orm` import — pure composer) | `a15583c5` |
| #785 (PR-V1-34) | OL-9 offline-or-live mutation router | One-liner for UI call sites that need to decide between calling the live tRPC mutation (online) and enqueueing offline (`client/src/modules/agent-studio/services/offline-cache-router.ts`). `routeVaultMutation({ kind, payload, callLive, isOnline?, id?, generateId?, queue? })` defaults `isOnline` to `navigator.onLine` (true when navigator is unavailable — non-browser env); online path returns `{ mode: "live", result }` with `callLive` invoked exactly once; offline path returns `{ mode: "queued", entry }` via OL-8 with `callLive` NOT invoked. Live-mode errors propagate unchanged (caller decides retry semantics — no implicit fall-through to enqueue, which would mask transient server errors). Pure function (no React/JSDOM coupling); future React-hook layer is a separate PR if needed. 13-test suite at `tests/agent-studio/offline-cache-router.test.ts` (online happy path, live-error propagation, offline enqueue, deny-list rejection on offline path, generateId seam, navigator.onLine default both directions, source-scan boundary — no react/react-dom/AppRouter imports) | pending |

---

## 7. Connection back to MVP 0–4 closure

This plan is the explicit "successor execution plan" named in:
- `docs/implementation/agent-studio-native-graph-workspace-execution-plan.md` §0 scope boundary
- `docs/implementation/agent-studio-native-graph-workspace-status-check-2026-05-13.md` "Known gaps" item 4 ("V1+ scope is Deferred by plan, not failed")
- `~/.claude/projects/-root/memory/feedback_native_graph_workspace_continuing_rule.md` (the standing rule)

When this plan ships its first PR, the predecessor closure-doc's "deferred by plan" line becomes "tracked in successor plan" — no longer a deferral, an active workstream.

---

## 8. Reference docs

- `docs/architecture/agent-studio-native-graph-workspace.md` — top-level overview
- `docs/architecture/agent-studio-canvas-strategy.md` — Phase 17 ADR (exists)
- `docs/architecture/agent-studio-extension-framework-strategy.md` — Phase 18 ADR (exists)
- `docs/architecture/agent-studio-multi-region.md` — Phase MR-1 ADR (exists)
- `docs/architecture/agent-studio-neo4j-aura-upgrade-path.md` — Track J upgrade path ADR (exists)
- `docs/architecture/agent-studio-realtime-collab-crdt.md` — Phase CRDT ADR (created with this plan)
- `docs/architecture/agent-studio-offline-local-first.md` — Phase OL-1 ADR (created with this plan)
- `docs/implementation/agent-studio-native-graph-workspace-execution-plan.md` — predecessor
- `AGENTS.md` — operating order
- `CLAUDE.md` — Non-Build List
