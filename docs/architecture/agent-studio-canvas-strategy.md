# Agent Studio — Canvas Strategy

**Status:** Adopted 2026-05-11
**Phase:** Native Graph Workspace Phase 17
**Owner:** Native Graph Workspace working group

---

## Summary

Canvas (a free-form, spatial editor with nodes, edges, and rich
embedding) is a frequently-requested feature in the Native Graph
Workspace. This ADR establishes that Canvas is **not MVP-blocking**
and defines the boundary conditions for when it lands.

Until Canvas ships, the following MVP-grade alternatives cover the
same operator needs:

| Need | MVP alternative | Surface |
|---|---|---|
| See a node's neighborhood at a glance | Graph view (force-directed) | `agentStudio.graph.*` + UI panel (Phase 12) |
| Drill into a query's path | Decision-trace ledger + markdown export | `agentStudio.graphAgent.explain` + `exportTraceMarkdown` (Phase 13 §3 / Phase 14 §1) |
| Sort/filter/group note collections | Saved views (table) | `agentStudio.vault.listSavedViews` (Phase 16 §1) |
| Visualize a tool-call trace | Runtime trace DAG | `agentStudio.graphAgent.explain` (Phase 13 §3) |
| Map a multi-step investigation | Markdown vault with wikilinks | Vault + backlinks pipeline (Phase 2-5) |

These alternatives close every Phase 0-16 acceptance criterion that
operators have today. Canvas adds expressive power on top of, not
in place of, those surfaces.

---

## Why Canvas is deferred

1. **Core workspace is the load-bearing surface.** Markdown editing,
   wikilinks, backlinks, graph projection, decision-trace export,
   and saved views are the operator hot path. Canvas does not
   subsume them — it visualizes them. The hot path must be stable
   before adding a second editing surface that competes for the
   same content.

2. **Spatial state introduces persistence cost.** A Canvas has
   per-element position, size, and layout — orthogonal to the
   content. Without a separate "canvas state" schema, Canvas
   content drifts from the underlying note row, leading to merge
   conflicts and projection drift.

3. **Real-time collaboration multiplier.** Canvas is the surface
   where multi-user editing pressure hits hardest — operators want
   to point at the same shape concurrently. Without CRDT/OT
   infrastructure (Phase 19 "much later"), Canvas devolves to
   single-editor + lock — worse than today's markdown surface,
   which at least has soft locks (Phase 5).

4. **Library churn.** Canvas implementations cluster around
   tldraw, excalidraw, react-flow, mermaid, custom-svg. Locking
   in one before the data model is settled creates a migration
   cost we cannot pay during MVP.

---

## When Canvas lands

The trigger conditions for un-deferring Canvas:

- ✅ Core workspace stability gate met (Phase 20 benchmarks pass
  on a production-shaped vault for ≥ 30 days).
- ✅ Neo4j projection layer is live (Phase 7.5) — Canvas needs the
  same graph backend as the existing graph view, not a parallel
  spatial state.
- ✅ Real-time collaboration strategy is settled (Phase 19) — the
  CRDT/OT decision is upstream of the Canvas editing model.
- ✅ Saved Views (Phase 16) usage data shows operators want
  spatial reasoning, not just table reasoning. (Concrete signal:
  the "graph view → screenshot → annotate externally" anti-pattern
  appears in trace exports.)

When 3 of 4 trigger conditions hold, the working group opens a
Canvas RFC. Until then, Canvas is queued.

---

## Future Canvas data model

The data model is defined here so a future implementation does
not greenfield-rebuild. Three additive tables on ASDB:

### `ags_canvases`

```
id                serial primary key
vault_id          int not null references ags_vaults(id)
owner_user_id     int
name              varchar(255) not null
description       text
created_at        timestamp default now() not null
updated_at        timestamp default now() not null
deleted_at        timestamp
```

### `ags_canvas_elements`

```
id                serial primary key
canvas_id         int not null references ags_canvases(id)
element_kind      varchar(50) not null   -- 'note_ref' | 'entity_ref' | 'shape' | 'text' | 'edge' | 'attachment_ref'
ref_kind          varchar(50)             -- 'note' | 'entity' | 'attachment' | null
ref_id            int                     -- FK into the relevant table when ref_kind is set
position_x        numeric not null
position_y        numeric not null
width             numeric
height            numeric
z_index           int not null default 0
payload           jsonb                   -- element-kind-specific fields (style, label, body for 'text', etc.)
created_at        timestamp default now() not null
updated_at        timestamp default now() not null
```

### `ags_canvas_edges`

```
id                serial primary key
canvas_id         int not null references ags_canvases(id)
source_element_id int not null references ags_canvas_elements(id)
target_element_id int not null references ags_canvas_elements(id)
edge_kind         varchar(50) not null   -- 'arrow' | 'line' | 'reference' | 'follows'
label             varchar(255)
payload           jsonb
created_at        timestamp default now() not null
```

**Invariants:**
- A canvas is owned by exactly one vault.
- Canvas elements reference *existing* notes / entities / attachments
  rather than embedding their content — same projection-from-source
  principle as the rest of the workspace.
- Edges connect two elements within the same canvas. Cross-canvas
  edges are explicitly out of scope.
- Position is a continuous numeric, not a grid index — preserves
  free-form layout.
- Soft delete via `deleted_at` on `ags_canvases`; elements + edges
  cascade via FK.

**Projection:**
- Canvases project into Neo4j as `(:Canvas)-[:CONTAINS]->(:CanvasElement)`
  with `(:CanvasElement)-[:REFERENCES]->(:Note|:Entity|:Attachment)`
  edges following the in-canvas reference graph.
- Spatial position is stored in Postgres only — Neo4j carries the
  reference graph, not the layout.

**Editing model:**
- v1 single-editor + soft lock (extend Phase 5's lock layer with a
  `canvas_id` discriminator).
- v2 unblocks once Phase 19 settles the collaboration strategy.

---

## Out of scope (explicit non-goals)

- Real-time multi-user editing.
- Full whiteboard primitives (freehand draw, ink, brush).
- Plugin-extensible element kinds (covered by Phase 18 boundaries).
- Embedded video / audio playback (covered by Phase 15 attachment
  semantics, not a Canvas concern).
- Cross-canvas navigation links (intentionally avoid the
  "everything is a graph" trap that turns Canvas into a third
  graph layer alongside the vault graph and Neo4j projection).

---

## Acceptance criteria mapping

This ADR closes the Phase 17 acceptance list:

- ✅ Canvas strategy documented (this file)
- ✅ Canvas is not MVP-blocking (stated above, with rationale)
- ✅ Canvas is explicitly scheduled after core workspace stability
  (trigger conditions section)
- ✅ Graph/table/tree alternatives exist for MVP (alternatives table
  above)
- ✅ Future Canvas data model is defined (three-table schema above)

---

## See also

- `docs/architecture/agent-studio-native-graph-workspace.md` — top-level
- `docs/architecture/agent-studio-graph-repository-and-backend-strategy.md`
  — graph backend abstraction
- `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`
  Phase 17 — original requirements
