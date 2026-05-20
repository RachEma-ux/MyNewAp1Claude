# Agent Studio UI Modernization — Unified Implementation Plan

**Branch**: `claude/analyze-agent-studio-ui-Uv1mJ`
**Scope**: Sidebar consolidation + responsive shell primitive + Graph Workspace redesign
**Total effort**: ~15–20 dev days, **4–6 calendar weeks** across three tracks
**Approach**: Three independent tracks, sequenced for minimum blocking

---

## Executive Summary

This plan merges three previously-scoped initiatives into a single sequenced delivery:

| Track | What | Effort | Calendar | Risk |
|---|---|---|---|---|
| **A — Settings consolidation** | Re-bucket 32 home-sidebar groups into 6 (Studio · Knowledge · Graph · Runtime & Ops · Lifecycle · Settings) | 1 day dev | 2 days | Low |
| **B — Responsive shell primitive** | Make `AgentStudioSidebar` collapse to a mobile drawer under 768 px; add mobile header bar | 1 day dev | 2 days | Low |
| **C — Graph Workspace responsive redesign** | Rewrite `GraphWorkspacePage` as a responsive shell with 4-mode IA (Note / Graph / Analysis / Ops) | 12–17 days dev | 3–5 weeks | High |

**Ship order**: A → B → C (with C's ADR planning starting in parallel with B's implementation).

**Why this order**: Track A is shovel-ready, low-risk, immediate ROI. Track B is a small primitive that benefits both AS shell and Graph Workspace. Track C needs 3 ADR-level decisions before any code lands.

---

## Background & motivation

### Track A — Settings consolidation
The home sidebar (`HOME_GROUPS` in `AgentStudioSidebar.tsx`, 766 lines, 103 nav items) has **32 groups, 25 of which contain a single item** — a fan-out anti-pattern from sequential admin slices. The 5-group + Settings target was approved in prior planning.

### Track B — Responsive shell primitive
Agent Studio has **no mobile experience** under 768 px today. The repo's design app at `index.html` (root, `Agent.ai` consumer prototype served via `.github/workflows/design-deploy.yml`) demonstrates a clean off-canvas-drawer + mobile-header pattern that's directly applicable to `AgentStudioShell`. The same primitive is a prerequisite for Track C's mobile work.

### Track C — Graph Workspace responsive redesign
`GraphWorkspacePage.tsx` (349 lines) + 17 sub-components (~4243 lines total) is a desktop-first three-pane layout. On mobile the global nav steals viewport, six tabs collide with the inspector, and the graph/editor area becomes unusable. The proposed fix is a responsive shell + 4-mode IA (Note / Graph / Analysis / Ops) replacing the current 6-tab strip.

---

## Track A — Settings Consolidation (UI-only)

**Goal**: Replace 32-group home sidebar with 6 groups, one of which is a nested Settings group.

### Final sidebar shape (Option B — Canvas Drain folded into Infrastructure)

```
STUDIO          All Agents, New Agent, Marketplace, Skills Catalog, Tools Catalog
KNOWLEDGE       Vault Explorer, Vault Attachments, Vault Saved Views,
                Vault Templates, Vault Admin, Bases, Bases Admin, RAC Ingestion
GRAPH           Graph Workspace Admin, Lens Browser, Impact Analysis,
                Recommendation, Security Graph, Code Graph, Graph Quality,
                Graph Quality Findings, Graph Correction, Graph Agent,
                Graph Skills, Semantic Enrichment, Neo4j Studio (external)
RUNTIME & OPS   MCP Manager, Canvas Operator, Canvas Admin
LIFECYCLE       Inbox, Proposals, Promotion, Golden Questions,
                Workspace Observability
SETTINGS
  ├── Connections      (Provider Bindings, MCP Schema Sync)
  ├── Governance       (Approval Bus, CAG Pack Admin, Publish Targets)
  ├── Extensions       (Extensions)
  └── Infrastructure   (Region Admin, Graph Health, Canvas Projection Drain)
```

Rationale: Sync & Projection sub-section would have only 1 item without backend work — collapsed into Infrastructure now, splittable later when Vault FS Sync + Graph Projection Drain pages land.

### Phase A0 — ADR + Roadmap (DONE)
- `docs/implementation/agent-studio-settings-group-roadmap.md` shipped at commit `b91bc29`
- This unified plan supersedes it for the merged scope

### Phase A1 — Subgroup primitive
**Goal**: Teach `AgentStudioSidebar.tsx` to render nested `SectionGroup` without changing existing entries. Zero visual change.

| File | Change | Lines |
|---|---|---|
| `client/src/modules/agent-studio/components/AgentStudioSidebar.tsx` | Add `subgroups?: SectionGroup[]` field; recursive renderer; `useSubgroupExpansion` `localStorage` helper | +80 |
| `tests/agent-studio/sidebar-subgroup-render.test.ts` | Render nested labels, click expand/collapse | +60 |
| `tests/agent-studio/sidebar-subgroup-persistence.test.ts` | `localStorage` round-trip | +40 |

```ts
interface SectionGroup {
  label: string;
  items?: { key: AgentStudioView; label: string; icon: React.ElementType; externalUrl?: string }[];
  subgroups?: SectionGroup[];  // NEW — one level only
}
```

- `localStorage` key: `agent-studio:sidebar:settings:expanded`
- Collapsed-rail behavior: Settings shows as one `Settings` icon; click expands rail AND opens group
- Active-item highlight propagates to parent (subtle dot when descendant active)

### Phase A2 — Re-bucket `HOME_GROUPS`
**Goal**: Pure data shuffle in `HOME_GROUPS`.

| File | Change | Lines |
|---|---|---|
| `client/src/modules/agent-studio/components/AgentStudioSidebar.tsx` | Replace 32-group array with 6 groups | net -220 |
| `client/src/modules/agent-studio/nav.ts` | Sync top-level structure | +5 |
| `tests/agent-studio/sidebar-home-groups.test.ts` | Snapshot of 6 top-level groups + Settings sub-section labels | +50 |
| `tests/agent-studio/sidebar-no-orphaned-view-keys.test.ts` | Every `AgentStudioView` literal reachable via sidebar or explicitly allowlisted | +40 |

**Deletions (8 single-item groups)**: `Extensions`, `Multi-region`, `Approval bus`, `MCP Schema`, `Provider Bindings`, `CAG`, `Publish`, `Graph Health`

**Item move (1)**: `canvas-projection-events-drain` out of `Canvas` group, into Settings → Infrastructure

### Ship strategy for Track A
**Combine Phases A1 + A2 into a single PR.** The primitive has zero behavioral footprint until A2 uses it, so bisecting would not help. ~260 added / ~400 removed in one file, four new test files, one review pass.

### Acceptance for Track A
- [ ] `pnpm check` green
- [ ] `pnpm exec vitest run tests/agent-studio/sidebar` green
- [ ] Every old view-key reachable in new sidebar exactly once
- [ ] Collapsed rail shows Settings icon; click expands rail + opens group
- [ ] `localStorage` expand state persists across reload
- [ ] Neo4j Studio external link from PR #1675 still works inside Graph group

**PR title**: `feat(agent-studio): consolidate HOME_GROUPS into 6 groups with Settings`
**Effort**: 1 dev day, 2 calendar days
**Risk**: Low

---

## Track B — Responsive Shell Primitive

**Goal**: Make `AgentStudioShell` usable under 768 px. Standalone win, prerequisite for Track C mobile work.

### Borrowed from `index.html` design app
The `Agent.ai` design prototype at the repo root has a clean responsive cascade:

```css
@media (max-width:768px) {
  .sidebar { position:fixed; transform:translateX(-100%); transition:transform .25s ease; }
  .sidebar.is-open { transform:translateX(0); box-shadow:8px 0 30px rgba(0,0,0,.4); }
  .sidebar-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.55); }
  .mobile-header { display:flex; }
}
```

Plus a mobile-header bar with hamburger button + brand wordmark. Direct port to React/Tailwind.

### Phase B1 — Mobile drawer for `AgentStudioSidebar`

| File | Change | Lines |
|---|---|---|
| `client/src/modules/agent-studio/components/AgentStudioSidebar.tsx` | Add `mobileOpen` prop + drawer + backdrop classes; use `useMediaQuery('(max-width: 768px)')` | +50 |
| `client/src/modules/agent-studio/components/AgentStudioShell.tsx` | Add `mobileSidebarOpen` state + close-on-route-change effect | +20 |
| `client/src/modules/agent-studio/components/AgentStudioMobileHeader.tsx` (new) | Hamburger + breadcrumb for < 768 px | +60 |
| `tests/agent-studio/sidebar-mobile-drawer.test.tsx` (new) | Open/close drawer, backdrop click closes, route change closes | +80 |

### Sizing tweaks (low cost, high impact)
Bundle these into the same PR — both observed in the `Agent.ai` design app:
- Rail width `w-12` (48 px) → `w-14` (56 px) for breathing room on icons
- Sidebar expanded width `w-56` (224 px) → `w-64` (256 px) for label legibility

### Acceptance for Track B
- [ ] At < 768 px: sidebar is hidden, hamburger button opens it as full-height drawer with backdrop
- [ ] At ≥ 768 px: sidebar behaves as today (collapsible rail/expanded)
- [ ] Route change closes mobile drawer automatically
- [ ] Backdrop click closes drawer
- [ ] No visual regression at desktop widths

**PR title**: `feat(agent-studio): responsive sidebar with mobile drawer + header`
**Effort**: 1 dev day, 2 calendar days
**Risk**: Low
**Ships**: Independent of Track A, can run in parallel

---

## Track C — Graph Workspace Responsive Redesign

**Goal**: Rewrite `GraphWorkspacePage` as a responsive shell with 4-mode IA. Preserve every existing feature.

### Pre-flight: 3 ADR-level decisions (BLOCKING)

These must be resolved **before any Track C code lands**.

#### ADR-1 — Shell collision resolution
Agent Studio already has a shell (`AgentStudioShell` = sidebar + topbar + content + statusbar + oversight drawer). Adding `GraphWorkspaceShell` inside the content area creates double-headers and double-rails. Pick one:

| Option | Mechanism | Pros | Cons |
|---|---|---|---|
| **A. Chromeless mode** | `AgentStudioShell` gains `chromeless: boolean` prop; suppresses sidebar + topbar + statusbar + drawer for `/agent-studio/graph-workspace` | Minimal capsule changes; preserves capsule mount surface | New shell prop affects all consumers; need toggle for sidebar access |
| **B. Embed Carbon shell as page content** | Keep `AgentStudioShell` chrome; render `GraphWorkspaceShell` inside its content area | No shell changes | Two headers stacked; two rails on desktop; visual debt |
| **C. Promote out of `AgentStudioShell`** | `/agent-studio/graph-workspace` becomes a capsule-level route, not a Shell view | True full-bleed; cleanest result | Requires module manifest + routing changes; loses sidebar access |

**Recommended**: Option A. Lowest blast radius, preserves URL/capsule semantics, gives operators a "back to studio" affordance.

#### ADR-2 — Design system attribution
Original proposal cited **Carbon Design System** as authority. The codebase uses **Radix UI + shadcn/ui + Tailwind 4** (`package.json` has no `@carbon/*`; `CLAUDE.md` doesn't reference Carbon).

**Decision needed**: justify the redesign on shadcn/Radix patterns OR adopt Carbon (would require new dependency + migration effort + ADR governance).

**Recommended**: Drop the Carbon framing. Reuse shadcn primitives (`Sheet`, `Tabs`, `Resizable`, `Command`). Keep the shell mechanics — they're standard CSS grid, not Carbon-exclusive.

#### ADR-3 — Component reuse audit
Several "new" components in the original proposal already exist. Explicit reuse-vs-replace decision per component:

| Proposed in redesign | Already exists | Action |
|---|---|---|
| Quick switcher (Cmd+P) | `QuickSwitcherModal.tsx` (320 lines) | **Reuse** — wire to header search |
| FS sync card | `VaultFsSyncPanel.tsx` (266 lines) | **Reuse** — embed in explorer footer |
| Workspace state layer | `WorkspaceStateLayer.tsx` (207 lines) | **Reuse** — wraps shell |
| Wikilinks/backlinks panel | `WikilinksBacklinksPanel.tsx` (132 lines) | **Reuse** — inspector → Links |
| Vault explorer | `VaultExplorer.tsx` (375 lines) | **Refactor in place** — add search, virtualize list |
| Graph inspector | `GraphInspector.tsx` (244 lines) | **Refactor in place** — add Details/Links/Quality/Trace tabs |
| Markdown editor | `MarkdownEditorPane.tsx` + `NoteFrontmatterPanel.tsx` + `CodeMirrorMdEditor.tsx` (~855 lines) | **Reuse** — Note mode wraps existing trio |
| Empty state | — | **New** |
| Mode tabs | — | **New** (shadcn `Tabs`) |
| Mobile dock | — | **New** |
| Workspace shell | — | **New** (CSS grid + drawer primitives from Track B) |

This cuts greenfield from "~20 new files" to **4–5 truly new components + 4 refactored**.

#### ADR-4 — Per-mode lazy loading
The 4-mode IA risks loading 3× the data on mode switch (Graph mode = Local + Global, Analysis = Impact + Backlinks + Findings, Ops = Trace + Decision + Skills + Explain + Schema + Observability).

**Decision**: each *sub-tab inside a mode* must be its own `lazy()` boundary. Mode tabs use `<Tabs>` with `forceMount={false}`. Documented in shell-level comments.

#### ADR-5 — Editor system integration
Per `CLAUDE.md`, the editor is not a plain markdown surface. It integrates:
- CRDT/Yjs collab on concurrent edits
- FS-sync atomic `.tmp → rename` writer + SHA-256 cycle prevention
- Projection events (`note.created` / `note.updated` / `note.deleted`)
- IndexedDB offline cache

**Decision**: Note mode wraps existing `MarkdownEditorPane`. Do not bypass these systems.

### Track C — Phases (after ADRs resolved)

#### Phase C1 — Layout rescue (3–4 days)
| File | Change |
|---|---|
| `client/src/modules/agent-studio/pages/GraphWorkspacePage.tsx` | Rewrite as thin entry point composing shell components |
| `client/src/modules/agent-studio/components/graph-workspace/GraphWorkspaceShell.tsx` (new) | CSS grid: `280px minmax(0,1fr) 360px` + breakpoint cascade |
| `client/src/modules/agent-studio/components/graph-workspace/graphWorkspace.css` (new) | Shared styles |
| `client/src/modules/agent-studio/components/AgentStudioShell.tsx` | Add `chromeless` prop (per ADR-1) |
| Tests for shell render at desktop/tablet/mobile | New |

Breakpoint cascade:
- **≥ 1280 px**: 3 columns (explorer + main + inspector)
- **768–1279 px**: 2 columns (explorer + main); inspector becomes overlay drawer
- **< 768 px**: 1 column (main only); explorer + inspector become full-screen drawers; mode tabs scroll horizontally

Key CSS pitfalls (locked in shell file):
- `minmax(0, 1fr)` on grid children → prevents overflow
- `min-height: 0` on grid children → prevents flex-based blowout
- `100dvh` for height → handles mobile viewport units

#### Phase C2 — 4-mode IA (2–3 days)
Replace 6-tab strip with 4 modes (Note / Graph / Analysis / Ops). Each mode is a shadcn `<Tabs>` value; sub-tabs inside modes are also `<Tabs>` with `lazy()` content.

| Mode | Sub-tabs (lazy boundaries) | Reuses |
|---|---|---|
| Note | (no sub-tabs) — single editor surface | `MarkdownEditorPane`, `NoteFrontmatterPanel`, `CodeMirrorMdEditor` |
| Graph | Local · Global | `LocalGraphView`, `GlobalGraphView` |
| Analysis | Impact · Backlinks · Quality | `ImpactAnalysisView`, `WikilinksBacklinksPanel`, `GraphQualityFindingsPanel` |
| Ops | Trace · Decision · Observability · Schema · Explain | `RuntimeAndDecisionTraceView`, observability panels |

#### Phase C3 — Explorer usability (3–4 days)
| File | Change |
|---|---|
| `client/src/modules/agent-studio/components/graph-workspace/VaultExplorer.tsx` | Add search input; add tree view for note groups; integrate virtualization (`@tanstack/react-virtual`) |
| `client/src/modules/agent-studio/components/graph-workspace/VaultFsSyncPanel.tsx` | Compact card variant for explorer footer |

Virtualization threshold: > 50 notes activates `react-virtual` row renderer.

#### Phase C4 — Inspector responsive (2–3 days)
| File | Change |
|---|---|
| `client/src/modules/agent-studio/components/graph-workspace/GraphInspector.tsx` | Internal tab strip (Details / Links / Quality / Trace) |
| `client/src/modules/agent-studio/components/graph-workspace/WorkspaceInspector.tsx` (new) | Wrapper that toggles between docked (desktop) and overlay drawer (< 1280 px) and bottom sheet (< 768 px) |

Uses shadcn `Sheet` primitive (Radix-based) for drawer behavior — same primitive used by Track B's mobile sidebar.

#### Phase C5 — Polish (2–3 days)
- Keyboard shortcuts (Cmd+1/2/3/4 for modes, Cmd+P for switcher, Cmd+B for explorer toggle, Cmd+I for inspector toggle)
- Empty states for each mode (actionable, not decorative)
- Loading + error skeletons
- ARIA labels, focus management on drawer open/close
- `prefers-reduced-motion` handling for drawer transitions

### Track C effort summary

| Phase | Dev | Notes |
|---|---|---|
| ADRs (1–5) | 1–2 days | Block all subsequent work |
| C1 — Layout rescue | 3–4 days | ADR-1 outcome lives here |
| C2 — 4-mode IA | 2–3 days | Re-wires existing components |
| C3 — Explorer | 3–4 days | Virtualization is the slow part |
| C4 — Inspector | 2–3 days | Reuses Track B drawer primitive |
| C5 — Polish | 2–3 days | Often slips |
| **Total** | **13–19 days dev**, **3–5 calendar weeks** | |

**Risk**: High. Touches CRDT/FS-sync/projection integration paths.

---

## Sequencing & dependencies

```
Week 1                Week 2-3                  Week 4-6
┌──────────┐         ┌──────────────────────┐   ┌──────────────────────────────────┐
│ Track A  │ ──►     │ Track B               │   │                                  │
│ Settings │         │ Responsive primitive  │   │                                  │
│ (2 days) │         │ (2 days)              │   │                                  │
└──────────┘         └──────────────────────┘   │                                  │
                          │                      │                                  │
                          ▼                      │ Track C — Graph Workspace        │
                     ┌──────────────────────┐   │ (12–17 days, 3–5 weeks)          │
                     │ Track C ADRs (1-2d)  │──►│  C1 Layout → C2 IA → C3 Explorer │
                     └──────────────────────┘   │  → C4 Inspector → C5 Polish      │
                                                 └──────────────────────────────────┘
```

**Critical path**:
1. Track A ships independently → land in first 2 days
2. Track B ships next → land by end of Week 1
3. Track C ADRs run in parallel with Track B → resolve by end of Week 1
4. Track C phases C1–C5 sequential, start Week 2

**Parallelization opportunities**:
- A and B can ship concurrently if two reviewers available
- C3 (explorer) and C4 (inspector) can ship in parallel after C2 lands
- C5 polish can start in parallel with C4

**Hard dependencies**:
- Track B's drawer primitive → Track C4's inspector
- Track C ADR-1 → all Track C phases
- Track A independent of B and C

---

## Risk matrix

| Risk | Track | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Visual regression in sidebar from data shuffle | A | Low | Medium | Snapshot tests; manual smoke before merge |
| Operator muscle memory — Provider Bindings was its own group | A | Medium | Low | Release note callout; Settings is collapsible |
| Mobile drawer interferes with existing collapsed-rail mode | B | Low | Medium | Explicit breakpoint cascade; existing behavior preserved ≥ 768 px |
| Shell collision unresolved before C1 ships | C | Medium | High | ADR-1 is gating; no C1 PR without resolved ADR |
| CRDT/FS-sync integration broken in Note mode | C | Medium | High | ADR-5 locks "reuse existing editor"; integration tests |
| Per-mode lazy loading missed → 3× data load | C | High if forgotten | Medium | ADR-4 locks pattern; code review checklist |
| Carbon framing committed to code/ADR | C | Low (now flagged) | Low | ADR-2 replaces with shadcn/Radix justification |
| Track C slips past 5 weeks | C | Medium | Medium | Phase C5 (polish) cuttable if needed; C1–C4 are the must-haves |

---

## Deliverables checklist

### Track A — Settings (PR #1)
- [ ] `AgentStudioSidebar.tsx` supports `subgroups` field
- [ ] `HOME_GROUPS` collapsed from 32 → 6 groups
- [ ] Settings group with 4 sub-sections renders correctly
- [ ] `localStorage` expand state persists
- [ ] 4 new test files green
- [ ] Manual smoke at all viewport widths

### Track B — Responsive primitive (PR #2)
- [ ] Mobile drawer for `AgentStudioSidebar` at < 768 px
- [ ] `AgentStudioMobileHeader.tsx` ships with hamburger + breadcrumb
- [ ] Rail bumped 48 → 56 px, sidebar 224 → 256 px
- [ ] Backdrop click + route change close drawer
- [ ] No desktop regression at ≥ 768 px

### Track C — Graph Workspace (PRs #3–#7, one per phase)
- [ ] ADRs 1–5 merged before C1 starts
- [ ] `chromeless` mode on `AgentStudioShell`
- [ ] `GraphWorkspaceShell` with responsive grid
- [ ] 4-mode IA replacing 6 tabs
- [ ] Explorer search + virtualization
- [ ] Inspector responsive drawer
- [ ] Keyboard shortcuts + a11y + polish
- [ ] Feature parity audit: every old feature reachable

---

## What this plan explicitly does NOT include

| Excluded | Why |
|---|---|
| Vault FS Sync standalone page (new tRPC routes) | Backend scope; tracked separately if needed |
| Graph Projection Drain page (new tRPC routes) | Backend scope; tracked separately if needed |
| External Tools subgroup under Settings | Deferred until second `externalUrl` consumer exists |
| Cross-links to global app settings (Secrets, Providers, Policy) | Out of scope per "module-local only" constraint |
| Visual brand refresh (lime/purple from `Agent.ai`) | Operator UI; consumer aesthetic doesn't fit |
| Carbon Design System adoption | Not in `package.json`; ADR-2 documents the rejection |
| `parseRoute` cascade refactor | Existing pattern preserved; only new branches added |
| `AGENT_GROUPS` (per-agent sidebar) changes | Already clean — 5 groups, ~22 items |
| KGRA / GraphRAG / Neo4j internal changes | Out of scope per CLAUDE.md non-build list |

---

## Total effort

| Phase | Dev days | Calendar |
|---|---|---|
| A0 — ADR + Roadmap | DONE | — |
| A1 + A2 — Settings (combined PR) | 1 | 2 days |
| B1 — Responsive primitive + mobile header | 1 | 2 days |
| C ADRs (1–5) | 1–2 | 1 week (parallel with B) |
| C1 — Layout rescue | 3–4 | 1 week |
| C2 — 4-mode IA | 2–3 | 0.5–1 week |
| C3 — Explorer | 3–4 | 1 week |
| C4 — Inspector | 2–3 | 0.5–1 week |
| C5 — Polish | 2–3 | 0.5–1 week |
| **Grand total** | **15–20 dev days** | **4–6 calendar weeks** |

---

## Recommended kickoff

1. **Today**: ship Track A as a single combined PR (Phases A1 + A2)
2. **Day 3**: start Track B (responsive primitive) and Track C ADRs in parallel
3. **Day 5**: Track B merged; Track C ADRs reviewed
4. **Week 2**: Track C Phase C1 (layout rescue) begins
5. **Weeks 3–6**: Track C phases C2–C5 sequential

---

## Status tracker

| Track / Phase | PR | State | Merged |
|---|---|---|---|
| A0 — ADR + Roadmap | — | DONE (commit `b91bc29`) | ✓ |
| A1 + A2 — Settings combined | — | not started | — |
| B1 — Responsive primitive | — | not started | — |
| C ADRs 1–5 | — | not started | — |
| C1 — Layout rescue | — | blocked on ADRs | — |
| C2 — 4-mode IA | — | blocked on C1 | — |
| C3 — Explorer | — | blocked on C2 | — |
| C4 — Inspector | — | blocked on C2, B1 | — |
| C5 — Polish | — | blocked on C3, C4 | — |
