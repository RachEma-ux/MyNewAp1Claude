# Graph Workbench — Full Implementation Plan

> Transform the KGRA knowledge graph from a static canvas into an interactive analytical workbench with smooth motion, temporal playback, path analysis, live updates, and enterprise-grade performance.

---

## Current State Baseline

| Asset | Lines | Functions | Purpose |
|-------|-------|-----------|---------|
| `app.js` | 2933 | 102 | Tabs, graph viz, chat, ingest, force layout, filters, modes |
| `designer.js` | 1378 | ~40 | Designer sub-page, node/link/template/mode CRUD |
| `styles.css` | 482 | — | All KGRA UI styles |
| `index.html` | 121 | — | Shell layout |
| `designer-routes.ts` | 660 | ~33 | REST endpoints for designer |
| `seed.ts` | 459 | — | ragdb table creation + ontology seed |

**Current renderer:** HTML5 Canvas 2D (`ctx.arc`, `ctx.lineTo`, `ctx.fillText`)
**Current layout:** Force-directed (animated via `requestAnimationFrame`), Hierarchy, Circular
**Current state:** Global variables (`graphViz` object, `activeMode`, `hubCount`, `emphasisState`)
**Current interaction:** Pan, zoom, click-select, drag node, search, filter, path mode
**Current performance cap:** 300 nodes (hub+neighbor filtered from ragdb)
**Target performance:** 1000 nodes smooth, 3000 nodes in safe mode

---

## Architecture: 20 Components

### Frontend Components (client/public/kgra-ui/)

| # | Component | File | Responsibility |
|---|-----------|------|----------------|
| 1 | GraphStateStore | `graph-state.js` | Centralized state for all graph UI |
| 2 | GraphAnimationEngine | `graph-animation.js` | Transition registry, easing, per-item state, reduced-motion |
| 3 | GraphCameraController | `graph-camera.js` | Smooth zoom/pan, focus-to-node, fit-to-view, auto-fit |
| 4 | GraphLayoutEngine | `graph-layout.js` | Force, hierarchy, circular, presets, stabilization, off-thread |
| 5 | GraphFilterEngine | `graph-filters.js` | Animated filtering, depth slider, progressive reveal |
| 6 | GraphTimelineController | `graph-timeline.js` | Playback, scrubber, speed, compare-state, heat overlay |
| 7 | GraphPathOverlay | `graph-paths.js` | Shortest path, workflow chain, dependency ripple |
| 8 | GraphClusterOverlay | `graph-clusters.js` | Community grouping, merge/split, sweep |
| 9 | GraphLiveUpdateBridge | `graph-live.js` | WebSocket/SSE, batched updates, pause/resume |
| 10 | GraphPerformanceGuard | `graph-perf.js` | FPS monitor, auto-mode switching, lazy render |
| 11 | GraphAccessibilityManager | `graph-a11y.js` | Reduced motion, animation toggle, preferences |
| 12 | GraphRenderer | `graph-renderer.js` | Canvas rendering pipeline, visual state application |
| 13 | GraphInteractionController | `graph-interaction.js` | Hover, select, drag, expand/collapse, context menu |
| 14 | GraphInspector | `graph-inspector.js` | Right panel: node/edge/path/community/event details |
| 15 | GraphWorkbench | `graph-workbench.js` | Shell: top bar, left panel, right panel, status bar, canvas |

### Backend Components (server/rag/)

| # | Component | File | Responsibility |
|---|-----------|------|----------------|
| 16 | GraphSnapshotService | `graph-snapshot.ts` | Graph at time T, diff between snapshots |
| 17 | GraphPathService | `graph-paths.ts` | Shortest path, workflow chain computation |
| 18 | GraphClusterService | `graph-clusters.ts` | Community detection, cluster metadata |
| 19 | GraphLiveService | `graph-live.ts` | SSE endpoint for real-time graph updates |
| 20 | GraphAPIClient | (frontend) `graph-api.js` | Client-side API adapter for all graph endpoints |

---

## File Map (all new + modified files)

### New Files (18)

```
client/public/kgra-ui/
  graph-state.js          — state store
  graph-animation.js      — animation engine
  graph-camera.js         — camera controller
  graph-layout.js         — layout engine
  graph-filters.js        — filter engine
  graph-timeline.js       — timeline controller
  graph-paths.js          — path overlay
  graph-clusters.js       — cluster overlay
  graph-live.js           — live update bridge
  graph-perf.js           — performance guard
  graph-a11y.js           — accessibility manager
  graph-renderer.js       — rendering pipeline
  graph-interaction.js    — interaction controller
  graph-inspector.js      — inspector panel
  graph-workbench.js      — shell orchestrator
  graph-api.js            — API client

server/rag/
  graph-snapshot.ts       — snapshot + diff endpoints
  graph-paths.ts          — path computation endpoints
  graph-clusters.ts       — cluster/community endpoints
  graph-live.ts           — SSE live stream endpoint
```

### Modified Files (5)

```
client/public/kgra-ui/
  app.js                  — replace renderGraphTab() to mount workbench
  index.html              — add script tags for all new JS files
  styles.css              — add workbench styles

server/
  _core/index.ts          — mount new graph service routes
  rag/designer-routes.ts  — add snapshot/path/cluster/live endpoints
```

---

## Backend API Contracts

### Existing (keep as-is)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/kgra-proxy/v1/analytics/entities` | GET | Nodes with hub filtering + mode |
| `/api/kgra-proxy/v1/analytics/relationships` | GET | Edges with mode filtering |
| `/api/kgra-proxy/graphrag/stats` | GET | Graph statistics |
| `/api/kgra-proxy/manual/nodes` | CRUD | Manual node management |
| `/api/kgra-proxy/manual/edges` | CRUD | Manual edge management |
| `/api/kgra-proxy/templates` | CRUD | Template management |
| `/api/kgra-proxy/modes` | CRUD | Mode management |

### New Endpoints (12)

| Endpoint | Method | Purpose | Phase |
|----------|--------|---------|-------|
| `/api/kgra-proxy/graph/snapshot` | GET | Graph state at time T (`?at=ISO`) | 5 |
| `/api/kgra-proxy/graph/snapshot/range` | GET | Graph between T1 and T2 (`?from=&to=`) | 5 |
| `/api/kgra-proxy/graph/diff` | GET | Diff between two snapshots (`?a=&b=`) | 5 |
| `/api/kgra-proxy/graph/history` | GET | Event history for a node (`?node_id=`) | 5 |
| `/api/kgra-proxy/graph/path` | GET | Shortest path (`?from=&to=`) | 6 |
| `/api/kgra-proxy/graph/path/chain` | GET | Workflow/event chain (`?chain_id=`) | 6 |
| `/api/kgra-proxy/graph/impact` | GET | Dependency ripple (`?node_id=&depth=`) | 6 |
| `/api/kgra-proxy/graph/clusters` | GET | Community detection results | 6 |
| `/api/kgra-proxy/graph/clusters/:id` | GET | Single cluster detail | 6 |
| `/api/kgra-proxy/graph/stream` | GET (SSE) | Live graph event stream | 7 |
| `/api/kgra-proxy/graph/activity` | GET | Activity metrics over time | 5 |
| `/api/kgra-proxy/graph/performance` | GET | Current graph size + health | 8 |

---

## Phase 0 — Audit and Architecture Baseline

### G-001: Current UI Audit

**What:** Document every existing function, state variable, and interaction in the current graph.

**Tasks:**
1. Map all 102 functions in `app.js` by category (rendering, layout, interaction, data, filters)
2. Document the `graphViz` object — every field, its purpose, how it's mutated
3. Document all canvas event handlers (mousedown, mousemove, mouseup, wheel, touch, dblclick, contextmenu)
4. Measure FPS at 100, 300, 500, 1000 nodes
5. Measure layout convergence time at each size
6. Document all existing CSS variables and style patterns
7. List every API call the graph makes

**Deliverable:** `docs/GRAPH-WORKBENCH-AUDIT.md`

### G-002: Architecture Document

**What:** Define the target architecture, component boundaries, and event flow.

**Tasks:**
1. Draw component dependency graph (which component talks to which)
2. Define the state store schema
3. Define the animation engine interface
4. Define the renderer contract
5. Define the API client interface
6. Define the performance budget (target FPS, max nodes per mode, animation limits)

**Deliverable:** `docs/GRAPH-WORKBENCH-ARCHITECTURE.md`

---

## Phase 1 — Core Platform (Release 1a)

### G-003: Graph State Store (`graph-state.js`)

**State schema:**
```
{
  // Data
  nodes: [],               // normalized node array
  edges: [],               // normalized edge array
  nodeMap: Map,             // id → node (O(1) lookup)
  
  // Selection
  selectedNodeId: null,
  hoveredNodeId: null,
  selectedPath: [],
  
  // Filters
  filters: {
    types: Set,
    families: Set,
    status: Set,
    owner: Set,
    search: '',
    depth: Infinity
  },
  
  // Layout
  layout: 'force',
  layoutParams: { repel: 800, linkDist: 80, centerForce: 0.01 },
  layoutStabilized: false,
  layoutFrozen: false,
  
  // Camera
  camera: { x: 0, y: 0, zoom: 1 },
  
  // Timeline
  timeline: {
    enabled: false,
    playing: false,
    position: null,       // ISO timestamp or null
    speed: 1,
    range: { from: null, to: null }
  },
  
  // Mode
  activeMode: 'all',
  activeModeData: null,
  
  // Clustering
  clusterMode: false,
  activeClusterId: null,
  
  // Live
  liveMode: false,
  liveConnected: false,
  livePaused: false,
  
  // Accessibility
  reducedMotion: false,
  animationEnabled: true,
  
  // Performance
  performanceMode: 'full', // 'full' | 'balanced' | 'safe'
  fps: 60,
  nodeCount: 0,
  edgeCount: 0
}
```

**Interface:**
```
getState()              → full state
subscribe(fn)           → register listener
dispatch(action, data)  → update state, notify listeners
```

**Acceptance:** All UI reads from this store. No direct graphViz mutation outside the store.

### G-004: Normalized Graph Schema

**Node schema:**
```
{
  id, label, type, family, kind,
  group, status, source,
  createdAt, updatedAt, eventTime,
  activityScore, clusterId, communityId,
  x, y, radius,
  visibilityState,  // 'visible' | 'filtered' | 'hidden' | 'entering' | 'exiting'
  highlightState,   // 'default' | 'hovered' | 'selected' | 'related' | 'path-active' | 'cluster-active'
  animProgress      // 0-1 for transitions
}
```

**Edge schema:**
```
{
  id, source, target, type, category,
  weight, direction, linkStrength, confidence, provenance,
  createdAt, updatedAt, eventTime,
  visibilityState, highlightState, animProgress,
  sourceLayer  // 'auto' | 'manual' | 'template'
}
```

### G-005: Renderer Hardening (`graph-renderer.js`)

**Decision:** Keep Canvas 2D. It handles 1000 nodes fine. WebGL only if Phase 8 testing shows problems at 3000+.

**Renderer interface:**
```
render(state)           → draw frame from state
setCanvas(canvas)       → bind to canvas element
resize()                → handle window resize
getNodeAt(x, y)         → hit test for interaction
getEdgeAt(x, y)         → hit test for edges
```

**Key change:** Renderer reads from state store, does NOT mutate state. Current `drawGraph()` both reads and writes — that coupling must break.

### G-006: Animation Engine (`graph-animation.js`)

**Interface:**
```
animate(targetId, property, from, to, duration, easing)  → start transition
cancel(targetId, property)                                → cancel transition
cancelAll()                                               → cancel everything
tick(timestamp)                                           → advance all transitions
isAnimating()                                             → any active?
setReducedMotion(bool)                                    → override all durations to 0
setSpeed(multiplier)                                      → global speed control
```

**Easing presets:** `linear`, `easeOut`, `easeInOut`, `spring`
**Duration presets:** `instant: 0`, `fast: 150`, `normal: 300`, `slow: 600`, `playback: 1000`

**Reduced motion:** When enabled, all `duration` becomes 0 (instant state change, no motion).

### G-007: Camera Controller (`graph-camera.js`)

**Interface:**
```
panTo(x, y, duration)         → smooth pan
zoomTo(level, duration)       → smooth zoom
focusNode(nodeId, duration)   → center + zoom on node
fitAll(duration)              → fit all visible nodes
fitNodes(nodeIds, duration)   → fit specific nodes
getWorldPos(screenX, screenY) → screen → world coords
getScreenPos(worldX, worldY)  → world → screen coords
```

**Replaces:** Current `toScreen()`, `toWorld()`, manual `offsetX/offsetY/scale` manipulation.

---

## Phase 2 — Essential Interaction (Release 1b)

### G-008: Hover Highlight

**Behavior:**
1. Mouse enters node → node gets `highlightState: 'hovered'`
2. Connected nodes get `highlightState: 'related'`
3. Unrelated nodes get `visibilityState: 'dimmed'` (animated to 30% opacity)
4. Mouse exits → all states revert (animated)

**Animation:** 150ms fade for dim/restore.

### G-009: Selection + Inspector

**Behavior:**
1. Click node → `selectedNodeId` updates in state
2. Camera smoothly focuses on node (300ms)
3. Inspector panel populates (node details, connections, properties)
4. Selected node gets `highlightState: 'selected'` (persistent glow)
5. Click empty space → deselect

### G-010: Search Focus

**Behavior:**
1. Type in search → filter matches
2. Press Enter or click result → camera flies to node (400ms)
3. Node gets `highlightState: 'selected'`
4. Neighborhood reveals (connected nodes fade in)
5. Multiple results → arrow keys step through, camera moves each time

### G-011: Expand/Collapse Neighborhood

**Behavior:**
1. Double-click or button → request neighbors from API
2. New nodes enter with `visibilityState: 'entering'` (scale from 0 + fade in, 300ms)
3. New edges enter with fade (200ms)
4. Layout adjusts smoothly (force simulation runs)
5. Collapse → reverse animation (scale to 0 + fade out)

### G-012: Animated Filtering

**Behavior:**
1. Toggle a filter → matching nodes get `visibilityState: 'filtered'`
2. Filtered nodes animate: opacity → 30%, then → 0% (300ms total)
3. Edges to/from filtered nodes also fade
4. Remove filter → reverse: opacity 0% → 30% → 100%
5. Layout optionally re-settles after filter change

### G-013: Depth Slider

**Behavior:**
1. Slider controls how many hops from selected/searched node are visible
2. Depth change → nodes beyond depth animate to filtered state
3. Nodes within depth animate to visible state
4. Continuous: dragging the slider produces smooth transitions, not discrete jumps

---

## Phase 3 — Layout Dynamics (Release 2a)

### G-014: Layout Engine (`graph-layout.js`)

**Interface:**
```
setLayout(type)                 → 'force' | 'hierarchy' | 'circular' | preset name
setParams(params)               → { repel, linkDist, centerForce, ... }
start()                         → begin simulation
stop()                          → freeze positions
restart()                       → re-randomize + start
isStable()                      → check if converged
onTick(callback)                → register per-frame callback
```

**Key change:** Layout runs computation, calls `onTick` which updates state store, which triggers renderer. No direct canvas manipulation from layout.

### G-015: Force Controls Panel

**Controls (in left panel):**
- Repel force: slider 100-2000 (default 800)
- Link distance: slider 20-200 (default 80)
- Center force: slider 0-0.1 (default 0.01)
- Stabilization: toggle (auto-freeze when stable)
- Rerun: button

### G-016: Layout Stabilization

**Behavior:**
1. After N frames with < threshold movement → `layoutStabilized: true`
2. If stabilization toggle is on → `layoutFrozen: true` (positions locked)
3. User drags a node → temporarily unfreeze that node
4. "Rerun" button → unfreeze all, re-simulate

### G-017: Layout Presets

| Preset | Repel | LinkDist | Center | Description |
|--------|-------|----------|--------|-------------|
| Balanced | 800 | 80 | 0.01 | Default |
| Compact | 400 | 40 | 0.05 | Dense, tight |
| Spread | 1500 | 150 | 0.005 | Sparse, readable |
| Investigation | 1000 | 100 | 0.01 | Balanced + auto-stabilize |
| Dense-safe | 300 | 30 | 0.08 | For 500+ nodes |

---

## Phase 4 — Visual Transition System (Release 2b)

### G-018: Semantic Visual States

| State | Opacity | Scale | Border | Glow | Use |
|-------|---------|-------|--------|------|-----|
| default | 1.0 | 1.0 | none | none | Normal |
| hovered | 1.0 | 1.1 | white 2px | soft white | Mouse over |
| selected | 1.0 | 1.0 | white 3px | pulse | Clicked |
| related | 0.9 | 1.0 | dim white 1px | none | Connected to hovered/selected |
| filtered | 0.0 | 0.8 | none | none | Removed by filter |
| hidden | 0.0 | 0.0 | none | none | Completely hidden |
| entering | 0→1 | 0→1 | none | brief flash | Appearing (timeline, expand) |
| exiting | 1→0 | 1→0 | none | none | Disappearing |
| live-updated | 1.0 | 1.0→1.2→1.0 | green 2px | green pulse | Just received update |
| path-active | 1.0 | 1.0 | indigo 3px | indigo glow | Part of traced path |
| cluster-active | 1.0 | 1.0 | community color | community glow | Part of highlighted cluster |

### G-019: Node Transition Library

```
enterNode(node, duration)    → scale 0→1 + fade 0→1
exitNode(node, duration)     → scale 1→0 + fade 1→0
selectNode(node)             → add pulse animation
deselectNode(node)           → remove pulse
hoverNode(node)              → scale to 1.1 + border
unhoverNode(node)            → scale to 1.0, remove border
filterNode(node)             → fade to 0
unfilterNode(node)           → fade to 1
liveUpdateNode(node)         → green pulse, scale 1→1.2→1
```

### G-020: Edge Transition Library

```
enterEdge(edge, duration)    → fade 0→1
exitEdge(edge, duration)     → fade 1→0
highlightEdge(edge)          → color transition + width increase
unhighlightEdge(edge)        → revert color + width
traceEdge(edge, duration)    → directional draw animation (dash offset)
filterEdge(edge)             → fade to 0
unfilterEdge(edge)           → fade to 1
```

---

## Phase 5 — Timeline & Temporal (Release 3a)

### G-021: Temporal Data Support

**Backend: `server/rag/graph-snapshot.ts`**

```
GET /api/kgra-proxy/graph/snapshot?at=2026-04-11T10:00:00Z
  → returns { nodes: [...], edges: [...] } as they existed at that time

GET /api/kgra-proxy/graph/snapshot/range?from=...&to=...
  → returns all nodes/edges created or active within range

GET /api/kgra-proxy/graph/diff?a=2026-04-10&b=2026-04-11
  → returns { added: { nodes: [...], edges: [...] }, removed: {...}, changed: {...} }

GET /api/kgra-proxy/graph/history?node_id=manual_5
  → returns [{ event: 'created', at: ..., data: {...} }, { event: 'updated', at: ..., changes: {...} }]

GET /api/kgra-proxy/graph/activity?from=...&to=...&bucket=day
  → returns [{ time: '2026-04-10', count: 47 }, { time: '2026-04-11', count: 123 }]
```

**Implementation:** Queries `kgra_entities.created_at`, `kgra_manual_nodes.created_at/updated_at/valid_from/valid_until`, `kgra_build_runs.built_at`.

### G-022: Timeline Controller (`graph-timeline.js`)

**Interface:**
```
play()                    → start playback from current position
pause()                   → freeze at current position
restart()                 → go to start, begin playing
seek(timestamp)           → jump to position
setSpeed(multiplier)      → 0.5x, 1x, 2x, 5x, 10x
setRange(from, to)        → set playback bounds
getPosition()             → current timestamp
onTick(callback)          → called each frame during playback
```

**State updates during playback:**
- Each tick advances `timeline.position` by `speed * frameDelta`
- Nodes with `createdAt > position` get `visibilityState: 'hidden'`
- Nodes with `createdAt <= position` get `visibilityState: 'entering'` (if new) or `'visible'`
- Same for edges

### G-023: Playback UI

**Top bar controls:**
```
[|◀] [▶/❚❚] [▶|]  [1x ▾]  ─────●───── [2026-04-11 14:30]  [Auto-fit ☐]
 ↑      ↑      ↑     ↑        ↑ scrubber        ↑               ↑
restart play  skip  speed                    position        auto-fit toggle
```

### G-024: Compare Two States

**Behavior:**
1. User selects "Compare" mode
2. Picks state A (date/snapshot) and state B
3. API returns diff
4. Added nodes/edges: green glow + `entering` animation
5. Removed nodes/edges: red glow + `exiting` animation
6. Changed nodes/edges: yellow pulse
7. Unchanged: dimmed to 50%

### G-025: Step-by-Step History

**Behavior:**
1. Load event history for selected node or full graph
2. Display as ordered list in inspector
3. Forward/backward buttons step through events
4. Each step: graph updates to reflect that moment
5. Inspector shows event details

### G-026: Temporal Heat

**Behavior:**
1. Activity data bucketed by time period
2. Overlay: nodes pulse intensity based on activity score at current timeline position
3. High activity = large pulse + warm color
4. Low activity = no pulse + cool color
5. Synchronized with scrubber

---

## Phase 6 — Advanced Analysis (Release 4a)

### G-027: Shortest Path (`graph-paths.js` + `server/rag/graph-paths.ts`)

**Backend:**
```
GET /api/kgra-proxy/graph/path?from=entity_name_A&to=entity_name_B
  → returns { path: [nodeId1, nodeId2, ...], edges: [edgeId1, ...], length: N }
```

**Implementation:** BFS on `kgra_relationships` + `kgra_manual_edges` in ragdb.

**Frontend animation:**
1. Path nodes/edges get `highlightState: 'path-active'`
2. Edges animate directionally (dash-offset animation from source to target)
3. Camera fits the path
4. Inspector shows path summary

### G-028: Workflow Chain Playback

**Backend:**
```
GET /api/kgra-proxy/graph/path/chain?start=node_id&type=CALLS
  → returns ordered chain following edges of given type
```

**Frontend:**
1. Chain highlights step-by-step (500ms per step)
2. Active step pulses, previous steps stay highlighted
3. Inspector shows current step details
4. Play/pause controls in path overlay

### G-029: Dependency Ripple

**Backend:**
```
GET /api/kgra-proxy/graph/impact?node_id=X&depth=3
  → returns { layers: [[direct deps], [2nd hop], [3rd hop]] }
```

**Frontend:**
1. Source node highlighted
2. Layer 1 ripples out (300ms delay)
3. Layer 2 ripples out (600ms delay)
4. Layer 3 ripples out (900ms delay)
5. Ripple is visual pulse expanding outward
6. User controls max depth with slider

### G-030: Cluster View (`graph-clusters.js` + `server/rag/graph-clusters.ts`)

**Backend:**
```
GET /api/kgra-proxy/graph/clusters
  → returns [{ id, name, nodeCount, members: [nodeIds] }]

GET /api/kgra-proxy/graph/clusters/:id
  → returns { id, name, members: [...full nodes...], internalEdges: [...], externalEdges: [...] }
```

**Implementation:** Group by `entity_type` or `family` initially. Future: Louvain community detection.

**Frontend:**
1. Toggle cluster mode → nodes animate into cluster groups
2. Each cluster becomes a super-node
3. Edges between clusters become super-edges
4. Click cluster → expand to show members (animated)
5. Click again → collapse back

### G-031: Community Sweep

**Frontend:**
1. Button: "Sweep communities"
2. Communities highlight one by one (1s per community)
3. Active community: full opacity + glow
4. Others: dimmed
5. Inspector shows community summary
6. User can pause/resume sweep

---

## Phase 7 — Live Updates (Release 4b)

### G-032: Live Update Bridge (`graph-live.js` + `server/rag/graph-live.ts`)

**Backend:**
```
GET /api/kgra-proxy/graph/stream (SSE)
  → event: graph-update
  → data: { type: 'node-added' | 'node-updated' | 'edge-added' | 'edge-removed', payload: {...} }
```

**Implementation:** When `buildKnowledgeGraph()` or manual CRUD runs, emit events to connected SSE clients.

**Frontend:**
```
connect()     → open SSE connection
disconnect()  → close
pause()       → buffer events but don't apply
resume()      → apply buffered events
onEvent(fn)   → register handler
```

### G-033: Batched Live Animations

**Behavior:**
1. Events arrive from SSE
2. Buffer for 500ms (collect burst)
3. Apply batch:
   - New nodes: `entering` animation
   - Updated nodes: `live-updated` pulse
   - Removed nodes: `exiting` animation
4. Layout adjusts incrementally (no full re-layout)

### G-034: Live Mode Controls

**UI (top bar):**
```
[● Live] [❚❚ Pause] [Jump to Latest]
```

**Status bar:** "Live: connected (3 events/min)" or "Live: paused (12 buffered)"

---

## Phase 8 — Accessibility & Performance (Release 5a)

### G-035: Reduced Motion (`graph-a11y.js`)

When enabled:
- All animation durations → 0
- No pulse/glow effects
- State changes are instant
- Camera still pans (but instantly, no smooth)
- Respects `prefers-reduced-motion` media query

### G-036: Animation Toggle

**UI:** Settings gear icon → "Animations: On/Off"
**Persisted:** `localStorage.setItem('graph-animation', 'off')`

### G-037: Performance Guard (`graph-perf.js`)

**Three modes:**

| Mode | Trigger | Behavior |
|------|---------|----------|
| Full | < 500 nodes, FPS > 30 | All animations, all effects |
| Balanced | 500-1000 nodes or FPS 15-30 | Disable edge labels, reduce hover effects, simplify pulse |
| Safe | > 1000 nodes or FPS < 15 | Disable all decorative animation, static rendering only, no hover dim |

**Auto-switching:** Measured every 2 seconds. Mode changes apply immediately. Status bar shows current mode.

### G-038: Lazy Rendering

- Only render nodes within viewport + 200px margin
- Off-screen nodes: skip `arc()`, `fillText()`, `stroke()` calls
- Edge culling: skip if both endpoints off-screen
- Reduces draw calls by 50-80% on large graphs

### G-039: Mobile-Safe

- Detect touch device → start in Balanced mode
- Disable hover effects (no hover on touch)
- Larger hit targets for tap
- Simplified overlays
- No live auto-play

---

## Phase 9 — Shell Integration (Release 5b)

### G-040: Top Bar

```
[|◀] [▶] [▶|] [1x▾] ─────●───── [Apr 11 14:30]  |  [Fit] [Rerun] [Compare] [● Live]  |  [All] [Coder] [User] [Arch] [Diag] [Sec] [Ops] [PM] [DE] [Compose▾]
```

### G-041: Left Control Panel

```
┌─ Search ──────────────┐
│ [🔍 Search nodes...  ]│
├─ Filters ─────────────┤
│ ☑ Page  ☑ Component   │
│ ☑ Hook  ☑ Route       │
│ ☑ Table ☑ Module      │
│ □ File  □ Schema      │
├─ Depth ───────────────┤
│ ──────●────── [3]     │
├─ Layout ──────────────┤
│ [Force▾] [Presets▾]   │
│ Repel:    ────●───    │
│ Distance: ──●─────    │
│ Center:   ─●──────    │
│ [☐ Stabilize] [Rerun] │
├─ Clusters ────────────┤
│ [☐ Cluster mode]      │
│ [Sweep communities]   │
├─ Timeline ────────────┤
│ [☐ Timeline mode]     │
│ From: [date]          │
│ To:   [date]          │
└───────────────────────┘
```

### G-042: Right Inspector

```
┌─ Node: Button ────────┐
│ Type: COMPONENT        │
│ Family: Element        │
│ Source: auto           │
│ Connections: 466       │
│                        │
│ Properties:            │
│   (none)               │
│                        │
│ Connected to:          │
│   → Card (RENDERS)     │
│   → Badge (RENDERS)    │
│   ← App.tsx (IMPORTS)  │
│                        │
│ History:               │
│   Created: 2026-04-11  │
│   Last build: 2026-... │
│                        │
│ Path from here:        │
│   [Trace to...]        │
│                        │
│ Impact analysis:       │
│   [Show ripple]        │
└────────────────────────┘
```

### G-043: Bottom Status Bar

```
[● 42fps] [Full mode] [342 nodes · 2,891 edges] [Layout: stable] [Live: connected] [Timeline: Apr 11 14:30]
```

---

## Phase 10 — QA & Release Gating

### G-044: Motion QA

Test every transition:
- Hover enter/exit
- Select/deselect
- Filter on/off
- Layout switch
- Timeline play/pause/scrub
- Path trace
- Cluster toggle
- Live update arrive
- Reduced motion mode

**Pass criteria:** No flicker, no jump, no orphaned state.

### G-045: Performance Test

| Size | Target FPS (Full) | Target FPS (Safe) |
|------|-------------------|-------------------|
| 100 nodes | 60 | 60 |
| 300 nodes | 45+ | 60 |
| 500 nodes | 30+ | 45+ |
| 1000 nodes | 15+ | 30+ |
| 3000 nodes | — | 15+ |

### G-046: Accessibility QA

- Reduced motion: all motion stops
- Keyboard: Tab to search, Enter to select, Escape to deselect
- Color: states distinguishable without color alone (border + size + opacity)
- Status: all mode changes announced in status bar

### G-047: Release Gating

Feature flags per release:
```
GRAPH_WORKBENCH_V2=true          → Release 1 (core + interaction)
GRAPH_WORKBENCH_LAYOUT=true      → Release 2 (layout + visual)
GRAPH_WORKBENCH_TIMELINE=true    → Release 3 (temporal)
GRAPH_WORKBENCH_ANALYSIS=true    → Release 4 (analysis + live)
GRAPH_WORKBENCH_PERF=true        → Release 5 (hardening)
```

---

## Release Slices

### Release 1: Core + Interaction

**Phases:** 0, 1, 2
**Work items:** G-001 through G-013
**New files:** 8 (state, animation, camera, renderer, interaction, inspector, workbench, api)
**New endpoints:** 0
**Outcome:** Smooth, professional graph interaction

### Release 2: Layout + Visual

**Phases:** 3, 4
**Work items:** G-014 through G-020
**New files:** 2 (layout, filters)
**New endpoints:** 0
**Outcome:** User-controlled layout with semantic visual states

### Release 3: Timeline + Temporal

**Phases:** 5
**Work items:** G-021 through G-026
**New files:** 2 (timeline.js, graph-snapshot.ts)
**New endpoints:** 5 (snapshot, range, diff, history, activity)
**Outcome:** Time-based graph analysis

### Release 4: Analysis + Live

**Phases:** 6, 7
**Work items:** G-027 through G-034
**New files:** 4 (paths.js, clusters.js, live.js, graph-paths.ts, graph-clusters.ts, graph-live.ts)
**New endpoints:** 7 (path, chain, impact, clusters, cluster detail, stream, performance)
**Outcome:** Path tracing, clustering, live updates

### Release 5: Hardening + Polish

**Phases:** 8, 9, 10
**Work items:** G-035 through G-047
**New files:** 2 (perf.js, a11y.js)
**New endpoints:** 0
**Outcome:** Enterprise-ready performance and accessibility

---

## Execution Rules

1. **Phase 0 before any code.** Audit first, architecture doc second, then build.
2. **Each release must be fully tested before starting the next.**
3. **Backend endpoints ship in the same release as the UI that needs them.**
4. **Performance measured after every release.** If FPS drops below target, fix before proceeding.
5. **Reduced motion tested in every release**, not just Release 5.
6. **No global variable mutation outside the state store** after Release 1 ships.
7. **Every new JS file is loaded via `KGRAAgentPage.tsx`** — keep the script loading list maintained.
8. **Backup ragdb before each release.** `pg_dump ragdb > ragdb-backup-pre-R{N}.sql`
9. **One commit per work item.** Clean history for rollback.
10. **Mobile tested in every release** — the app runs on Termux/Android.

---

## Total Scope

| Metric | Count |
|--------|-------|
| Phases | 10 (0-9 + QA) |
| Work items | 47 |
| New frontend files | 16 |
| New backend files | 4 |
| Modified files | 5 |
| New API endpoints | 12 |
| Release slices | 5 |
| Target: new JS lines | ~8,000-12,000 |
| Target: new TS lines | ~800-1,200 |
