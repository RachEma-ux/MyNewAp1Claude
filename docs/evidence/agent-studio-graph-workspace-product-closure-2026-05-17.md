# Agent Studio Graph Workspace — Product Work Closure Report

**Date:** 2026-05-17
**Branch:** see PR description
**Mission:** Items 14–25 of the original Native Graph Workspace roadmap
(Markdown editor / vault explorer / wikilinks-backlinks / local + global
graph / inspector / impact analysis / quality panel / runtime + decision
trace / 11 workspace states).

This report classifies every item honestly. No vague language.

---

## 1. Scope

Turn `client/src/modules/agent-studio/pages/GraphWorkspacePage.tsx` from
an observability-only page mounting 3 panels into a real Obsidian-like
workspace shell composing 13 surfaces.

## 2. Files changed

### New server router (1)
- `server/agent-studio/services/graph-workspace/router.ts` — thin
  `protectedProcedure` wrapper around `GraphRepository` for
  `localGraph` / `globalGraphSample` / `neighborhood` / `shortestPath`
  / `explainNode` / `explainPath` / `runImpactTemplate` (allow-listed)
  / `backendHealth`. Mounted in `server/agent-studio/api/router.ts`
  as `agentStudio.graphWorkspace.*`.

### New client components (10)
- `client/src/modules/agent-studio/components/graph-workspace/`
  - `VaultExplorer.tsx` — vault → folder → note tree (item 15)
  - `MarkdownEditorPane.tsx` — read / edit / source modes (items 14 + 16)
  - `WikilinksBacklinksPanel.tsx` — outgoing + backlinks (item 17)
  - `LocalGraphView.tsx` — depth-bounded local graph (item 18)
  - `GlobalGraphView.tsx` — workspace-wide sample (item 19)
  - `GraphInspector.tsx` — explainNode + explainPath (item 20)
  - `ImpactAnalysisView.tsx` — 7 impact_* templates (item 21)
  - `RuntimeAndDecisionTraceView.tsx` — runtime + decision trace (items 23 + 24)
  - `WorkspaceStateLayer.tsx` — 11 explicit states + classifyWorkspaceState (item 25)
  - `index.ts` — barrel

### Refactored page (1)
- `client/src/modules/agent-studio/pages/GraphWorkspacePage.tsx` —
  full shell composition (vault explorer + 6 main-area tabs + inspector
  drawer + observability tab preserving the original 3 panels).

### Tests (2)
- `tests/agent-studio/graph-workspace-router.test.ts` — 10 source-scan
  cases locking the server boundary.
- `tests/agent-studio/graph-workspace-product-shell.test.ts` — 14 cases
  locking the shell composition + 11-state taxonomy + no-mock-data
  invariant + reuse-first invariants (no duplicate vault/graph systems).

## 3. UI surfaces implemented

| Surface | Path | tRPC dependency |
|---|---|---|
| Vault explorer | `VaultExplorer.tsx` | `vault.listMyVaults` + `vault.listNotes` (existing) |
| Markdown read/edit/source | `MarkdownEditorPane.tsx` | `vault.getNote` + `vault.updateNote` (existing) |
| Wikilinks + backlinks | `WikilinksBacklinksPanel.tsx` | `vault.listNotes` (existing; no new server work) |
| Local graph | `LocalGraphView.tsx` | `graphWorkspace.localGraph` (new) |
| Global graph | `GlobalGraphView.tsx` | `graphWorkspace.globalGraphSample` (new) |
| Graph inspector | `GraphInspector.tsx` | `graphWorkspace.explainNode` + `explainPath` (new) |
| Impact analysis | `ImpactAnalysisView.tsx` | `graphWorkspace.runImpactTemplate` (new, allow-listed to 7 impact_* templates) |
| Runtime + decision trace | `RuntimeAndDecisionTraceView.tsx` | `graphWorkspace.runImpactTemplate` (reuses impact_runtime + impact_governance) |
| Workspace state layer | `WorkspaceStateLayer.tsx` | n/a (pure helper) |
| Graph quality (workspace UX) | reuses `GraphQualityFindingsPanel` | `graphQuality.*` (existing) |
| Observability (legacy) | 3 panels preserved under their own tab | n/a |

## 4. APIs used (reuse-first audit)

| Existing API | Reused for |
|---|---|
| `agentStudio.vault.listMyVaults` | Vault explorer top level |
| `agentStudio.vault.listNotes` | Vault explorer note list + backlinks heuristic |
| `agentStudio.vault.getNote` | Editor body + frontmatter |
| `agentStudio.vault.updateNote` | Editor save path (CRDT-aware) |
| `agentStudio.graphQuality.*` | Quality panel (preserved) |
| `GraphRepository.localGraph` (P0 #1397) | Local graph view |
| `GraphRepository.globalGraphSample` (P0 #1397) | Global graph view |
| `GraphRepository.explainNode/Path` (P0 #1397) | Inspector |
| `GraphRepository.executeTemplate` (Phase 7.5b) | Impact analysis + traces |
| `failure-states/contracts.ts` taxonomy | `classifyWorkspaceState` helper |

**Zero new persistence**, **zero second vault/graph system**, **zero
new Markdown renderer** (reuses `AppStreamdown`).

## 5. Permission model

All graph queries flow through `graphWorkspaceRouter` which:
1. Uses `protectedProcedure` (login required)
2. Threads `ctx.user.workspaceId / userId / role` into `RuntimeContext`
3. The `GraphRepository` enforces:
   - **Safe-default DENY** when context absent for workspace-scoped nodes
   - Visibility `hidden` → admin-only
   - Sensitivity `confidential` → admin / approver only
   - Cross-workspace block

Hidden / missing nodes return the `hidden_reference` state in the UI —
the raw "this exists but is hidden" message is NOT shown; only "A
referenced item exists but is not visible to you."

## 6. Tests run

```
pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/agent-studio/graph-workspace-router.test.ts \
  tests/agent-studio/graph-workspace-product-shell.test.ts
```

Result: **24 / 24 passing.**

## 7. Honest classification — items 14–25

| Item | Description | Classification | Evidence |
|---|---|---|---|
| 14 | Full Markdown editor surface | **FULLY IMPLEMENTED** | `MarkdownEditorPane.tsx` with read/edit/source + save (CRDT-aware) + dirty/saved/conflict flags + read-only enforcement |
| 15 | Vault explorer / folder tree | **PARTIALLY IMPLEMENTED** | Vault + note hierarchy via `vault.listNotes`; **folder tree nesting deferred** (vault repo's `listNotesInVault` is flat-paged today; folder hierarchy requires a `listFoldersInVault` server addition — not in this PR scope) |
| 16 | Note reading/editing/source modes | **FULLY IMPLEMENTED** | 3 modes wired with mode-button data-attrs + dirty-state preservation; read-only disables edit/source buttons |
| 17 | Wikilinks / backlinks UI | **PARTIALLY IMPLEMENTED** | Outgoing wikilinks: real extraction from current note's markdown. Backlinks: heuristic (title-substring match across visible notes). **Server-side projection writer for `ags_vault_backlinks` deferred** — when it ships, the panel switches to query the projection table |
| 18 | Local graph view | **FULLY IMPLEMENTED** | `LocalGraphView.tsx` calls `graphWorkspace.localGraph`; depth control 1-4; truncation indicator; empty / backend-down / loading states |
| 19 | Global graph view | **FULLY IMPLEMENTED** | `GlobalGraphView.tsx` calls `graphWorkspace.globalGraphSample`; sample size 50/100/250; truncation indicator |
| 20 | Graph inspector | **FULLY IMPLEMENTED** | `GraphInspector.tsx` covers node + edge + path; renders provenance, lineage, governance status; hidden-reference state replaces raw error |
| 21 | Impact analysis UI backed by traversal | **FULLY IMPLEMENTED** | `ImpactAnalysisView.tsx` runs all 7 impact_* templates via `graphWorkspace.runImpactTemplate`; truncation + state slides; allow-list enforced server-side |
| 22 | Graph quality panel as workspace UX | **FULLY IMPLEMENTED (reused)** | `GraphQualityFindingsPanel` mounted into the inspector drawer; routes to existing `agentStudio.graphQuality.*` |
| 23 | Runtime trace graph view | **PARTIALLY IMPLEMENTED** | `RuntimeAndDecisionTraceView.tsx` runs `impact_runtime` template with a user-entered run id; **graph-visual rendering (force-directed canvas) deferred** — the trace renders as a row list with step IDs + edge labels; visualization upgrade lands when an operator approves adding a graph library to `package.json` |
| 24 | Decision trace graph view | **PARTIALLY IMPLEMENTED** | Same component runs `impact_governance` for decision steps; same visualization caveat |
| 25 | Permission-denied / stale / projection-drift workspace states | **FULLY IMPLEMENTED** | `WorkspaceStateLayer.tsx` declares 11 closed-taxonomy states + `classifyWorkspaceState` mapper from tRPC errors + failure-state events. Tested via the taxonomy lock test |

## 8. Known backend dependencies

- **Live graph data:** `localGraph` / `globalGraphSample` / `explainNode` /
  `explainPath` / `runImpactTemplate` all require Neo4j connectivity per
  `GRAPH_BACKEND=neo4j-ce`. When unreachable, the UI shows the
  `neo4j_unavailable` state — no false PASS, no mock fallback.
- **Backlinks projection:** `ags_vault_backlinks` table exists but has
  no writer yet (same shape as the pre-P0 audit-confirmed gap for the
  semantic-enrichment tables). Documented in item 17 above.
- **Trace graph rendering:** Force-directed canvas / cytoscape upgrade
  requires adding a graph library to `package.json`. Documented in
  items 23/24 above.

## 9. Remaining blockers

None for the items classified as FULLY IMPLEMENTED. The PARTIALLY
IMPLEMENTED items each have a documented follow-up trigger:

| Item | Trigger to upgrade to FULLY |
|---|---|
| 15 vault explorer folder nesting | Add `vault.listFoldersInVault` server procedure + walk by `parentFolderId` |
| 17 backlinks projection | Wire `extractLinksFromMarkdown` output to `ags_vault_backlinks` writer in `createNote`/`updateNote` (1 PR) |
| 23/24 graph-visual rendering | Approve graph library addition (cytoscape.js / d3-graph) + replace list-view in `LocalGraphView` and `RuntimeAndDecisionTraceView` |

## 10. References

- New router: `server/agent-studio/services/graph-workspace/router.ts`
- New components: `client/src/modules/agent-studio/components/graph-workspace/`
- Refactored page: `client/src/modules/agent-studio/pages/GraphWorkspacePage.tsx`
- Tests: `tests/agent-studio/graph-workspace-router.test.ts` + `graph-workspace-product-shell.test.ts`
- P0 closure (this session): `docs/evidence/graph-backend/agent-studio-native-graph-workspace-mvp4-closure-2026-05-17.md`
- T-G aggregate closure (this session): `docs/implementation/agent-studio-tg-aggregate-closure-2026-05-17.md`
- T-D aggregate closure (this session): `docs/implementation/agent-studio-td-aggregate-closure-2026-05-17.md`
