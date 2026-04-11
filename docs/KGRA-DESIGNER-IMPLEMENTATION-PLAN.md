# KGRA Graph Designer & Template System — Implementation Plan v4

## Mission

Turn the read-only auto-generated knowledge graph into a 3-layer editable system with a universal ontology, persona-based modes (Coder, User, Architect, Diagnosis), and a template system — all stored in ragdb. Users can design nodes and links following knowledge graph best practices, switch viewing modes per persona, and save/apply reusable templates.

## Architecture: 3 Layers + Modes

```
Layer 1: AUTO (existing)     — regex-extracted from code, rebuilt on ingest
Layer 2: MANUAL (new)        — user-designed for this RAG, survives rebuilds
Layer 3: TEMPLATE (new)      — reusable overlays with ontology + modes, apply to any RAG

Modes: CODER | USER | ARCHITECT | DIAGNOSIS (+ custom)
  — filtered views of the same graph, not separate data
  — each mode defines which node families, kinds, edge types, and overlays to show
  — emphasis rules control highlight, collapse, dim, badge styling
  — modes compose: coder+diagnosis = union of includes
```

All layers and modes stored in ragdb. Visualization merges all 3 layers and applies the active mode as a presentation filter.

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Large scope (8 tables, 33 endpoints, 43 steps) | 4 working milestones, each standalone and shippable |
| Heavy ontology seed | JSON file (default-ontology.json), not inline SQL |
| UI complexity (app.js already 2550 lines) | Split into designer.js separate file |
| Mode rendering complexity | Config-driven pipeline, not per-mode code |

## File Organization

```
drizzle/tables/ragdb.ts                    — add 8 table definitions
server/rag/connection.ts                   — no change (already exists)
server/rag/seed.ts                         — add 8 CREATE TABLE + ontology seed
server/rag/default-ontology.json           — NEW: full ontology as JSON
server/rag/default-modes.json              — NEW: 4 modes + 2 compositions as JSON
server/rag/designer-routes.ts              — NEW: all 33 designer endpoints
server/_core/index.ts                      — mount designer routes + update analytics
client/public/kgra-ui/designer.js          — NEW: Designer UI
client/public/kgra-ui/app.js               — minimal changes (Designer card, mode bar, drawGraph)
client/public/kgra-ui/index.html           — add <script src="designer.js">
client/public/kgra-ui/styles.css           — add designer styles
docs/KGRA-TECHNICAL-REFERENCE.md           — update
docs/KGRA-USER-GUIDE.md                    — update
```

3 new files, 9 modified files.

---

## Pre-Execution Checklist

```
□ Server running on localhost:3000
□ PostgreSQL running, ragdb exists with 3 existing tables populated
□ Git clean, main branch, synced to remote
□ Verify ragdb baseline:
    psql -d ragdb -c "SELECT COUNT(*) FROM kgra_entities;"  → 4821
    psql -d ragdb -c "SELECT COUNT(*) FROM kgra_relationships;"  → 14136
    psql -d ragdb -c "SELECT COUNT(*) FROM kgra_build_runs;"  → 1
□ Backup ragdb:
    pg_dump ragdb > /data/data/com.termux/files/usr/tmp/ragdb-backup-pre-designer.sql
□ Save current app.js line count:
    wc -l client/public/kgra-ui/app.js  → ~2550
```

---

## Milestone 1: Manual Nodes & Links (one session)

**Outcome:** User can create nodes and links in the Designer, see them on the Visualization canvas alongside auto-generated nodes.

### Step 1.1: Schema — 2 tables

Add to `drizzle/tables/ragdb.ts`:
- `kgra_manual_nodes` (15 columns: id, unique_id, name, short_name, family, kind, description, properties, valid_from, valid_until, status, applied_template_id, created_by, created_at, updated_at)
- `kgra_manual_edges` (21 columns: id, name, source_node_id, target_node_id, source_is_auto, target_is_auto, relationship_type, relationship_category, weight, confidence, provenance, link_strength, description, properties, rules, valid_from, valid_until, status, applied_template_id, created_by, created_at, updated_at)

Add to `server/rag/seed.ts`:
- 2 CREATE TABLE IF NOT EXISTS statements

**Verify:** Restart server → psql -d ragdb -c "\dt kgra_manual*" → 2 tables

### Step 1.2: Backend — 11 endpoints

Create `server/rag/designer-routes.ts`:
- Manual nodes: GET, POST, PUT/:id, DELETE/:id, POST/:id/archive, POST/:id/restore (6)
- Manual edges: GET, POST, PUT/:id, DELETE/:id, POST/:id/archive (5)

Mount in `server/_core/index.ts`.

**Verify:** curl POST/GET/DELETE manual nodes and edges

### Step 1.3: Backend — Update analytics UNION

Update GET /v1/analytics/entities: UNION auto + manual (source field: "auto"/"manual")
Update GET /v1/analytics/relationships: UNION auto + manual edges

**Verify:** Create manual node + edge → appears in analytics responses

### Step 1.4: Frontend — designer.js + Designer sub-page

Create `client/public/kgra-ui/designer.js`:
- Hardcoded reference data (14 families with kinds, 60+ relationship types by category)
- showDesigner(), renderNodeList(), renderEdgeList()
- showAddNodeForm() (name, unique_id, family→kind dropdown, properties key-value editor)
- showAddEdgeForm() (name, from/to searchable dropdown, category, strength, properties)
- showEditNodeForm(), showEditEdgeForm()
- renderDesignGuide() (collapsible reference panel)

Add `<script src="/kgra-ui/designer.js"></script>` to index.html.
Add Designer card to OmniGraph Services panel in app.js.

**Verify:** OmniGraph → Designer → create node → create link → visible in lists

### Step 1.5: Frontend — Visual distinction in drawGraph()

Update drawGraph() in app.js:
- Manual nodes: dashed white border + green M badge
- Template nodes: dotted indigo border + indigo T badge
- Manual edges: dashed green line
- Template edges: dotted indigo line

**Verify:** Manual node on canvas → dashed border + M badge

### Step 1.6: Commit

```
git commit -m "feat(kgra): milestone 1 — manual nodes/links designer with canvas distinction"
git push origin main
```

---

## Milestone 2: Templates (one session)

**Outcome:** User can create, apply, unapply, duplicate templates. Default Universal App Graph Ontology ships pre-loaded.

### Step 2.1: Schema — 4 tables

Add kgra_templates, kgra_template_nodes, kgra_template_edges, kgra_applied_templates.

**Verify:** Restart → 4 new tables in ragdb

### Step 2.2: Default ontology seed

Create `server/rag/default-ontology.json` with full ontology (14 families, 95+ kinds, 60+ relationships, design principles, overlays, visualization rules, quality guards, portability profiles, maturity levels, example queries).

Update seed.ts to read JSON and insert default template with is_default=true.

**Verify:** psql → kgra_templates has 1 row, is_default=true

### Step 2.3: Backend — 16 template endpoints

Add to designer-routes.ts: templates CRUD, template nodes/edges CRUD, apply/unapply, from-manual, duplicate.

**Verify:** curl operations on templates

### Step 2.4: Backend — 3 reference endpoints

GET /reference/families, /reference/relationships, /reference/overlays (reads from default-ontology.json).

### Step 2.5: Frontend — Template Manager in designer.js

renderTemplateManager(), showTemplateDetail(), applyTemplate(), unapplyTemplate(), saveManualAsTemplate(), duplicateTemplate().

Update dropdowns to use reference endpoints.

**Verify:** Templates section in Designer works end-to-end

### Step 2.6: Backend — Analytics UNION template nodes

Ensure applied template nodes (via applied_template_id) get source:"template" in responses.

### Step 2.7: Commit

```
git commit -m "feat(kgra): milestone 2 — templates + default ontology + reference endpoints"
git push origin main
```

---

## Milestone 3: Modes (one session)

**Outcome:** User can switch between Coder/User/Architect/Diagnosis modes. Graph filters and layout change per mode.

### Step 3.1: Schema — 2 tables

Add kgra_modes, kgra_mode_compositions.

### Step 3.2: Seed 4 default modes + 2 compositions

Create `server/rag/default-modes.json` with Coder, User, Architect, Diagnosis modes + coder+diagnosis, architect+diagnosis compositions.

Update seed.ts to insert modes linked to default template.

**Verify:** psql → 4 modes, 2 compositions

### Step 3.3: Backend — 6 mode endpoints

GET /modes, POST /modes, PUT /modes/:id, DELETE /modes/:id, POST /modes/compose, GET /modes/active.

### Step 3.4: Backend — Mode filtering in analytics

Update analytics/entities and analytics/relationships to accept ?mode= param. Filter by mode's includes.node_families, node_kinds, relationship_types.

**Verify:** GET entities?mode=coder_mode → only code-relevant nodes

### Step 3.5: Frontend — Mode selector in Visualization toolbar

Button bar in app.js: [All] [Coder] [User] [Architect] [Diagnosis]. setMode() function updates activeMode, reloads graph.

### Step 3.6: Frontend — Mode editor in designer.js

renderModeList(), showModeEditor(), showCreateMode(), renderCompositions(), showCreateComposition().

### Step 3.7: Frontend — Layout switching per mode

setMode() fetches mode's default_view_layout, calls switchLayout().

### Step 3.8: Commit

```
git commit -m "feat(kgra): milestone 3 — persona modes (Coder/User/Architect/Diagnosis) + mode filtering"
git push origin main
```

---

## Milestone 4: Emphasis Rules + Polish (one session)

**Outcome:** Modes apply visual emphasis. Mode legend. Full polish.

### Step 4.1: Emphasis engine

Config-driven: emphasisState = { highlight, collapse, dim, badges }. computeEmphasis(mode, nodes) populates sets from mode's emphasis_rules.

### Step 4.2: drawGraph() emphasis checkpoints

4 checkpoints per node: collapsed → tiny stub; dimmed → 0.3 opacity; highlighted → glow; badge → icon.
Same for edges.

### Step 4.3: Mode legend panel

Bottom-left overlay showing: Mode name, what's shown, what's hidden, emphasis active, layout.

### Step 4.4: Edge emphasis (hard vs soft)

Soft links at 50% opacity with confidence percentage badge.

### Step 4.5: Diagnosis-specific emphasis

Auto-expand 3 hops from failing nodes. Highlight blast radius. Show change events.

### Step 4.6: Composition mode frontend support

Composed mode passes comma-separated mode_ids to API.

### Step 4.7: CSS polish

Designer forms, mode buttons, badges, legend, responsive layout.

### Step 4.8: Commit

```
git commit -m "feat(kgra): milestone 4 — mode emphasis rules, visual polish, mode legend"
git push origin main
```

---

## Milestone 5: Docs (quick)

Update KGRA-TECHNICAL-REFERENCE.md and KGRA-USER-GUIDE.md with Designer, Templates, Modes documentation.

```
git commit -m "docs(kgra): update reference and user guide for designer + modes"
git push origin main
```

---

## Rollback Strategy

| Situation | Action |
|-----------|--------|
| DB corrupt | psql -d ragdb < ragdb-backup-pre-{milestone}.sql |
| Code broken | git revert HEAD (each milestone = one commit) |
| Server won't start | Check seed.ts SQL syntax |
| Frontend broken | Clear browser cache, check designer.js syntax |
| Auto graph lost | Won't happen — auto tables never touched |

## Session Boundaries

| Milestone | Effort | Dependencies |
|-----------|--------|--------------|
| M1: Manual nodes/links | Full session | None |
| M2: Templates | Full session | M1 complete |
| M3: Modes | Full session | M2 complete |
| M4: Emphasis + polish | Full session | M3 complete |
| M5: Docs | 30 min | M4 complete |

Each milestone is independently shippable. Stop after any milestone and the app works.
