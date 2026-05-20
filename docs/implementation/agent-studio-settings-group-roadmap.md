# Agent Studio Settings Group — Implementation Roadmap

**Branch**: `claude/analyze-agent-studio-ui-Uv1mJ`
**Owning module**: `client/src/modules/agent-studio/`
**Governance model**: per AGENTS.md (Planner → Builder → Reviewer → Tester → Governance)
**Total phases**: 6 — 1 spec, 2 sidebar refactors, 2 new pages, 1 future-reserved
**Estimated total effort**: 4–6 working days across 6 PRs

---

## Background

The Agent Studio home sidebar (`client/src/modules/agent-studio/components/AgentStudioSidebar.tsx` `HOME_GROUPS`) currently has 32 groups, ~25 of which contain a single item — a fan-out anti-pattern from sequential "no-deferral continuation" admin slices. This roadmap consolidates the home sidebar into 6 groups (Studio · Knowledge · Graph · Runtime & Ops · Lifecycle · Settings) and introduces a module-local Settings group with 5 sub-sections.

The Settings group is **Agent-Studio-module-scoped only** — no cross-links to global app settings (Secrets, Providers, Policy, Workspace Members). Those remain reachable via the existing platform navigation.

The design also accommodates:
- The `externalUrl` primitive on `SidebarItem` introduced by PR #1675 (Neo4j Studio is the first consumer; reserved Settings → External Tools slot for future module-wide external integrations)
- The Obsidian-style vault system's operator-configurable surfaces (`fs_sync_path` per vault, `VAULT_FS_SYNC_ALLOWED_ROOTS`, `AGS_PROJECTION_DRAIN_CRON_DISABLED`)

---

## Target sidebar structure (post-rollout)

```
STUDIO            All Agents, New Agent, Marketplace, Skills Catalog, Tools Catalog
KNOWLEDGE         Vault Explorer, Vault Attachments, Vault Saved Views,
                  Vault Templates, Vault Admin, Bases, Bases Admin, RAC Ingestion
GRAPH             Graph Workspace Admin, Lens Browser, Impact Analysis,
                  Recommendation, Security Graph, Code Graph, Graph Quality,
                  Graph Quality Findings, Graph Correction, Graph Agent,
                  Graph Skills, Semantic Enrichment, Neo4j Studio (external)
RUNTIME & OPS     MCP Manager, Canvas Operator, Canvas Admin
LIFECYCLE         Inbox, Proposals, Promotion, Golden Questions,
                  Workspace Observability
SETTINGS
  ├── Connections
  │   ├── Provider Bindings
  │   └── MCP Schema Sync
  ├── Governance
  │   ├── Approval Bus
  │   ├── CAG Pack Admin
  │   └── Publish Targets
  ├── Sync & Projection
  │   ├── Canvas Projection Drain
  │   ├── Vault FS Sync           (NEW — Phase 3)
  │   └── Graph Projection Drain  (NEW — Phase 4)
  ├── Extensions
  │   └── Extensions
  ├── Infrastructure
  │   ├── Region Admin
  │   └── Graph Health
  └── External Tools              (DEFERRED — Phase 5)
```

---

## Phase 0 — Spec & ADR (no code)

**Goal**: Lock decisions before code touches `AgentStudioSidebar.tsx`, since the file is shared with PR #1675's `externalUrl` work and any active sidebar PRs.

### Deliverables

| File | Purpose |
|---|---|
| `docs/architecture/agent-studio-settings-group.md` (new) | ADR — design rationale, contents, alternatives rejected (e.g. why not cross-link global app settings) |
| `docs/implementation/agent-studio-settings-group-roadmap.md` (this file) | Phase-by-phase tracker |

### Decisions to lock

1. **Sub-group rendering primitive** — extend `SectionGroup` with optional `subgroups: SectionGroup[]` (one level of nesting only — no recursion deeper)
2. **Expand/collapse persistence** — `localStorage` key `agent-studio:sidebar:settings:expanded` storing array of expanded sub-group labels; default = `["Connections"]`
3. **Collapsed-rail behavior** — `Settings` shows as a single `Settings` lucide icon; click expands the sidebar AND opens the Settings group
4. **External Tools deferral** — empty sub-section not shipped; landed only when the second `externalUrl` entry is added (Phase 5)
5. **Page-level new builds** — `Vault FS Sync` and `Graph Projection Drain` are separate PRs after the rebucketing lands

### Pre-flight checks (Planner role)

- [ ] No competing open PR touches `AgentStudioSidebar.tsx` (`git log --oneline origin/main -- client/src/modules/agent-studio/components/AgentStudioSidebar.tsx | head -20`)
- [ ] `externalUrl` primitive contract documented from PR #1675 (read its diff to confirm shape)
- [ ] `AgentStudioView` union scanned for any obsolete keys to clean up alongside

### Acceptance

- ADR merged
- Roadmap tracker merged
- No code in `client/` touched

**PR title**: `docs: ADR + roadmap for Agent Studio Settings group consolidation`

---

## Phase 1 — Sidebar primitive: sub-group support

**Goal**: Teach `AgentStudioSidebar.tsx` to render nested `SectionGroup` without changing any existing entries. Zero visual change after this PR.

### Files changed

| File | Change | Lines |
|---|---|---|
| `client/src/modules/agent-studio/components/AgentStudioSidebar.tsx` | Add `subgroups?: SectionGroup[]` to `SectionGroup` interface; add recursive renderer with collapse state | +80 |
| `tests/agent-studio/sidebar-subgroup-render.test.ts` (new) | Render a sample group with subgroups, assert nested labels visible, click expand/collapse | +60 |
| `tests/agent-studio/sidebar-subgroup-persistence.test.ts` (new) | Mock `localStorage`, assert expanded state survives unmount | +40 |

### Implementation details

```ts
interface SectionGroup {
  label: string;
  items?: { key: AgentStudioView; label: string; icon: React.ElementType; externalUrl?: string }[];
  subgroups?: SectionGroup[];  // NEW — one level only
}
```

- New helper `useSubgroupExpansion(groupLabel: string)` reads/writes `localStorage`
- Recursive render: `if (group.subgroups) { render subgroup header + items }` else render flat items
- Collapsed rail: subgroups render as flat icon list under parent (no nested affordance fits in `w-12`)
- Active-item highlight propagates up: parent Settings row gets a subtle dot when any descendant is active

### Constraints

- **No `HOME_GROUPS` entries change in this PR** — pure primitive work
- **`AGENT_GROUPS` untouched** — sub-groups stay opt-in
- All existing tests must pass without modification

### Acceptance

- [ ] `pnpm check` green
- [ ] `pnpm exec vitest run tests/agent-studio/sidebar` green
- [ ] Visual diff: zero (sidebar identical to pre-PR)
- [ ] New tests cover: render, expand, collapse, persistence, active-item propagation

**PR title**: `feat(agent-studio): sidebar SectionGroup supports one level of subgroups`

---

## Phase 2 — Re-bucket HOME_GROUPS into the 6-group design

**Goal**: Land the user-approved 5-group + Settings layout. Pure data shuffle in `HOME_GROUPS`.

### Files changed

| File | Change | Lines |
|---|---|---|
| `client/src/modules/agent-studio/components/AgentStudioSidebar.tsx` | Replace 32-group `HOME_GROUPS` with 6 groups | net -220 |
| `client/src/modules/agent-studio/nav.ts` | Sync nav array with new top-level structure | +5 |
| `tests/agent-studio/sidebar-home-groups.test.ts` (new) | Snapshot test of 6 top-level group labels + Settings sub-group labels | +50 |
| `tests/agent-studio/sidebar-no-orphaned-view-keys.test.ts` (new) | Assert every `AgentStudioView` literal in the union is reachable via the sidebar OR explicitly allowlisted (chat, runs, versions, etc. are agent-context-only) | +40 |

### Concrete data changes

**Delete** (8 entire groups):

| Approx. line ranges | Group label deleted |
|---|---|
| ~314–319 | `Extensions` |
| ~321–326 | `Multi-region` |
| ~328–333 | `Approval bus` |
| ~370–375 | `MCP Schema` |
| ~453–462 | `Provider Bindings` |
| ~505–514 | `CAG` |
| ~529–534 | `Publish` |
| ~536–541 | `Graph Health` |

**Remove from existing group** (1 item):

- `canvas-projection-events-drain` out of `Canvas` group (~306–311)

**Rebuild** (the 6 final groups):

```ts
const HOME_GROUPS: SectionGroup[] = [
  { label: "Studio", items: [home, new, marketplace, catalog-skills, catalog-tools] },
  { label: "Knowledge", items: [vault-explorer, vault-attachments, vault-saved-views,
                                vault-templates, vault-admin, bases, bases-admin, rac-ingestion] },
  { label: "Graph", items: [graph-workspace-admin, graph-lens-browser, impact-analysis,
                            recommendation, security-graph, code-graph, graph-quality,
                            graph-quality-findings, graph-correction, graph-agent-admin,
                            graph-skill-admin, semantic-enrichment, neo4j-studio-external] },
  { label: "Runtime & Ops", items: [mcp-manager, canvas-operator, canvas-admin] },
  { label: "Lifecycle", items: [inbox, graph-change-proposals, promotion-lifecycle,
                                golden-questions, workspace-observability] },
  { label: "Settings", subgroups: [
    { label: "Connections", items: [provider-bindings-admin, mcp-schema-sync] },
    { label: "Governance", items: [approval-bus-admin, cag-admin, publish-targets-admin] },
    { label: "Sync & Projection", items: [canvas-projection-events-drain] },
    { label: "Extensions", items: [extensions-admin] },
    { label: "Infrastructure", items: [region-admin, graph-health-admin] },
  ]},
];
```

### Risks & mitigations

| Risk | Mitigation |
|---|---|
| Neo4j Studio external link from PR #1675 — its `externalUrl` shape must round-trip | Read PR #1675's `SidebarItem` change before this PR; include Neo4j Studio in the Graph group exactly as PR #1675 left it |
| Operator muscle memory — Provider Bindings was always under its own group | Brief release-note callout; settings group is collapsible so it can be pinned-open |
| Active-route highlight when navigating to a Settings-nested view | Phase 1 must already propagate to parent — verify in Phase 2 acceptance |
| `manifest.ts` `routeInventory` drift | No new routes in this phase, but assert no entries deleted |

### Acceptance

- [ ] `pnpm check` green
- [ ] `pnpm exec vitest run tests/agent-studio/sidebar` green
- [ ] Manual: every item in the old 32-group sidebar appears in the new 6-group sidebar exactly once
- [ ] Manual: collapsed rail still shows all icons; clicking Settings icon expands & opens the group
- [ ] Manual: `localStorage` expand state persists across reload
- [ ] Snapshot test diff reviewed by Reviewer role

**PR title**: `feat(agent-studio): consolidate HOME_GROUPS into 6 groups with Settings`

---

## Phase 3 — Vault FS Sync settings page (new)

**Goal**: Surface the per-vault `fs_sync_path` config that currently lives only in DB writes. Module-local config par excellence.

### Backend (server-side)

| File | Change | Lines |
|---|---|---|
| `server/agent-studio/routers/vault-fs-sync.ts` (new) | New router with 3 procedures: `getVaultFsSyncStatus(vaultId)`, `setVaultFsSyncPath(vaultId, path)`, `getAllowedRoots()` | +120 |
| `server/agent-studio/routers/index.ts` | Mount `vaultFsSync` sub-router | +2 |
| `tests/agent-studio/routers/vault-fs-sync.test.ts` (new) | All 3 procedures: happy path + path-not-under-allowed-roots rejection + auth | +180 |

### Frontend

| File | Change | Lines |
|---|---|---|
| `client/src/modules/agent-studio/pages/VaultFsSyncPage.tsx` (new) | Page: list all vaults, show current `fs_sync_path`, edit form, allowed-roots banner | +180 |
| `client/src/modules/agent-studio/components/VaultFsSyncPanel.tsx` (new) | Reusable panel (per-vault row) | +120 |
| `client/src/modules/agent-studio/components/AgentStudioShell.tsx` | Add lazy import + route case for `/agent-studio/vault-fs-sync` + `parseRoute` branch | +20 |
| `client/src/modules/agent-studio/components/AgentStudioSidebar.tsx` | Add `vault-fs-sync` view key to union + entry under Settings → Sync & Projection | +6 |
| `client/src/modules/agent-studio/routes.tsx` | Add route entry | +1 |
| `client/src/modules/agent-studio/manifest.ts` | Add `/agent-studio/vault-fs-sync` to `routeInventory` | +1 |
| `tests/agent-studio/pages/vault-fs-sync-page.test.tsx` (new) | Render, edit form submission, validation error display | +120 |

### Security model (per CLAUDE.md vault FS-sync rules)

- Path must be under `VAULT_FS_SYNC_ALLOWED_ROOTS` — enforced server-side, surfaced client-side as a non-editable banner
- Mutation requires `adminProcedure` (workspace admin only)
- All writes audit-logged via existing governance scaffolding
- Atomic `.tmp → rename` writer + SHA-256 cycle prevention is **not** touched by this page — it stays in `server/agent-studio/services/vault/fs-sync/`

### Acceptance

- [ ] `pnpm check` green
- [ ] `pnpm exec vitest run tests/agent-studio/routers/vault-fs-sync tests/agent-studio/pages/vault-fs-sync-page` green
- [ ] Manual: navigate from Settings → Sync & Projection → Vault FS Sync; set a path inside allowed roots; verify FS-sync watcher picks up the next note write
- [ ] Manual: attempt to set a path outside allowed roots → error toast, no DB write

**PR title**: `feat(agent-studio): vault FS sync configuration page`

---

## Phase 4 — Graph Projection Drain page (new)

**Goal**: Sibling of Canvas Projection Drain, but for `ags_graph_projection_sync_jobs`. Closes a symmetry gap.

### Backend

| File | Change | Lines |
|---|---|---|
| `server/agent-studio/routers/graph-projection-drain.ts` (new) | 3 procedures: `getDrainStatus()` (pending count, retry stats, last drain time), `listPendingJobs(limit)`, `retryFailedJob(jobId)` | +140 |
| `server/agent-studio/routers/index.ts` | Mount `graphProjectionDrain` sub-router | +2 |
| `tests/agent-studio/routers/graph-projection-drain.test.ts` (new) | Read status with empty queue, with backlog, retry exceeds `MAX_DRAIN_RETRY_ATTEMPTS` | +160 |

### Frontend

| File | Change | Lines |
|---|---|---|
| `client/src/modules/agent-studio/pages/GraphProjectionDrainPage.tsx` (new) | Page: status card (pending / failed / drained-last-hour), pending jobs table, retry button per job, cron-disabled banner | +200 |
| `client/src/modules/agent-studio/components/GraphProjectionDrainPanel.tsx` (new) | Reuses pattern from `CanvasProjectionEventsDrainStatusPanel.tsx` | +140 |
| `client/src/modules/agent-studio/components/AgentStudioShell.tsx` | Lazy import + route branch | +20 |
| `client/src/modules/agent-studio/components/AgentStudioSidebar.tsx` | View key + entry under Settings → Sync & Projection | +6 |
| `client/src/modules/agent-studio/routes.tsx` | Route entry | +1 |
| `client/src/modules/agent-studio/manifest.ts` | `routeInventory` entry | +1 |
| `tests/agent-studio/pages/graph-projection-drain-page.test.tsx` (new) | Render status panel, retry button click, banner shown when cron disabled | +120 |

### Reuse strategy

- Mirror `CanvasProjectionEventsDrainPage.tsx` structure 1:1 — pattern is already proven
- The two pages should share a `<ProjectionDrainCard>` primitive — extract from Canvas page in this PR (small refactor)
- `AGS_PROJECTION_DRAIN_CRON_DISABLED` env state surfaced read-only via a new `getCronStatus()` helper

### Acceptance

- [ ] `pnpm check` green
- [ ] `pnpm exec vitest run tests/agent-studio/routers/graph-projection-drain tests/agent-studio/pages/graph-projection-drain-page` green
- [ ] Manual: trigger a vault note mutation, observe pending count tick on Graph Projection Drain page within 5s
- [ ] Manual: when `AGS_PROJECTION_DRAIN_CRON_DISABLED=true`, banner renders correctly

**PR title**: `feat(agent-studio): graph projection drain status page`

---

## Phase 5 — External Tools sub-section (deferred / opportunistic)

**Goal**: Reserved slot — ships **only** when a second `externalUrl` entry justifies a sub-section beyond Graph Utilities' Neo4j Studio.

### Trigger conditions (any one suffices)

- Operator request for a second external admin link (pgAdmin, Grafana, etc.)
- Vault FS Sync page lands (Phase 3) AND a useful "Open vault folder in OS" external link can be wired contextually
- A third `externalUrl` consumer exists in the codebase

### Files (when triggered)

| File | Change | Lines |
|---|---|---|
| `client/src/modules/agent-studio/components/AgentStudioSidebar.tsx` | Add "External Tools" subgroup under Settings | +10 |
| `tests/agent-studio/sidebar-external-tools-subgroup.test.ts` (new) | Each external link renders with `target="_blank"` + `rel="noopener noreferrer"` | +60 |

### Acceptance (when shipped)

- [ ] External link entries open in new tab
- [ ] No external links in Settings if they are domain-specific (Neo4j Studio stays in Graph)
- [ ] Env-var override pattern from PR #1675 used consistently for any URLs that vary by environment

**PR title (deferred)**: `feat(agent-studio): settings external tools subgroup`

---

## Cross-phase concerns

### Test coverage targets

| Test surface | Phase | Target |
|---|---|---|
| Sidebar render (groups + subgroups) | 1, 2 | 100% of new render paths |
| Sidebar persistence | 1 | `localStorage` read/write round-trip |
| `HOME_GROUPS` membership | 2 | Snapshot — every old view-key reachable |
| New tRPC routers | 3, 4 | All procedures + auth boundary + error paths |
| New pages | 3, 4 | Render + form submit + error display |
| External link safety | 5 | `target` + `rel` attributes |

### Migration strategy

- **No DB migrations** — `vault-fs-sync` reads/writes existing `ags_vaults.fs_sync_path` column; `graph-projection-drain` reads existing `ags_graph_projection_sync_jobs` table. Per CLAUDE.md, ASDB uses table-by-table seed reconciler, not Drizzle SQL migrations.

### Rollback plan

| Phase | Rollback |
|---|---|
| 0 | Revert ADR/roadmap PRs — no code impact |
| 1 | Revert sidebar PR — zero visual regression risk (primitive was unused) |
| 2 | Revert `HOME_GROUPS` PR — sidebar returns to 32-group state |
| 3, 4 | Revert page PR — route returns 404; no orphan data in DB |
| 5 | Revert subgroup PR — Settings group loses External Tools section only |

### Documentation updates

- `CLAUDE.md` — add a one-line entry under "Native Graph Workspace" track noting the Settings group landed
- `docs/architecture/agent-studio-vault-fs-sync.md` — link to new operator UI from Phase 3
- `~/.claude/projects/-root/memory/project_rac_progress.md` — slice entry per PR

### Dependency graph

```
Phase 0 (ADR/Roadmap)
        │
        ▼
Phase 1 (Sidebar primitive — subgroups)
        │
        ▼
Phase 2 (HOME_GROUPS rebucket + Settings group)
   │         │
   ▼         ▼
Phase 3   Phase 4    ◄── parallel-safe (different files, no overlap)
(Vault FS) (Graph Drain)
   │         │
   ▼         ▼
        Phase 5 (External Tools — opportunistic, no dependency)
```

Phases 3 and 4 can ship in parallel after Phase 2 merges.

### CI gating per PR

Each PR must pass before merge:

1. `pnpm check` (TypeScript + cag-boundary script)
2. `pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork tests/agent-studio/`
3. Source-scan tests (no `neo4j-driver` imports outside allowed paths — already enforced)
4. Manual smoke: open `/agent-studio`, expand Settings, click each new entry

### Effort summary

| Phase | Files touched | Lines added | Lines removed | Effort |
|---|---|---|---|---|
| 0 | 2 docs | ~600 | 0 | 0.5 day |
| 1 | 1 + 2 tests | +180 | 0 | 0.5 day |
| 2 | 3 + 2 tests | +280 | ~400 | 0.5 day |
| 3 | 7 + 2 tests | +750 | 0 | 1.5 days |
| 4 | 7 + 2 tests | +780 | 0 | 1.5 days |
| 5 | 1 + 1 test | +70 | 0 | 0.5 day (deferred) |
| **Total** | ~28 files | **~2660** | **~400** | **4–6 days** |

### Order of operations recommended

1. Ship Phase 0 first — gets the ADR in for governance review
2. Phases 1 + 2 should ship within 24h of each other so the sidebar doesn't have an unused primitive sitting in the codebase
3. Phases 3 + 4 can ship in either order (parallel-safe)
4. Phase 5 stays deferred until trigger condition fires

### What this roadmap explicitly does **not** do

- No cross-links to global app settings (Secrets, Providers, Policy) — out of scope per earlier constraint
- No new "Agent Studio Preferences" page (sidebar pinning, default filters) — separate roadmap if desired
- No Audit Log surface — separate roadmap
- No changes to `AGENT_GROUPS` (per-agent sidebar) — agent context already has 5 clean groups
- No `parseRoute` rewrite — the existing cascade gets two new branches but no architectural cleanup
- No `externalUrl` primitive changes — built on PR #1675's contract as-is

---

## Status tracker

| Phase | PR | State | Merged |
|---|---|---|---|
| 0 — ADR + Roadmap | — | not started | — |
| 1 — Subgroup primitive | — | not started | — |
| 2 — Re-bucket `HOME_GROUPS` | — | not started | — |
| 3 — Vault FS Sync page | — | not started | — |
| 4 — Graph Projection Drain page | — | not started | — |
| 5 — External Tools subgroup | — | deferred | — |
