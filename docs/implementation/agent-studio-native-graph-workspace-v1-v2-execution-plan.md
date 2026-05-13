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
