# Graph Workbench — Current State Audit (G-001)

> Baseline audit of the graph UI before the workbench upgrade.

## Renderer
- **Type:** HTML5 Canvas 2D (`CanvasRenderingContext2D`)
- **File:** `client/public/kgra-ui/app.js` (legacy), `graph-renderer.js` (new)
- **Draw calls:** `ctx.arc()`, `ctx.lineTo()`, `ctx.fillText()`, `ctx.stroke()`
- **Resolution:** `devicePixelRatio`-aware

## State Management
- **Legacy:** `graphViz` global object in `app.js` (125 references, unreachable when workbench active)
- **New:** `GraphState` centralized store in `graph-state.js` (146+ calls across 15 subsystems)

## Graph Data
- **Source:** ragdb (PostgreSQL) via `/api/kgra-proxy/v1/analytics/entities` + `/relationships`
- **Node schema:** id, label, type, family, kind, community, source, connections, x, y, radius, animOpacity, animScale, highlightState, visibilityState
- **Edge schema:** id, source, target, type, category, weight, sourceLayer, linkStrength, confidence, animOpacity, highlightState, visibilityState
- **Size:** 4,830 auto entities, 14,141 relationships, hub+neighbor filtered to ~300 on client

## Interactions (before upgrade)
- Pan (mouse drag)
- Zoom (scroll wheel)
- Click-select node
- Drag node
- Search + focus
- Type/family filter checkboxes
- Path mode (click source → target)
- Right-click context menu

## Performance Baseline
- **300 nodes:** 45-60 FPS on Termux/Android
- **1000 nodes:** Untested pre-upgrade
- **Force layout:** Animated via `requestAnimationFrame`, converges in ~40-120 frames
- **Lazy rendering:** Viewport culling with 200px margin

## Reusable Components
- Canvas 2D renderer: kept, wrapped in `GraphRenderer`
- Force layout algorithm: kept, wrapped in `GraphLayout`
- Hub+neighbor filtering: kept in server endpoint
- Mode system: kept, integrated into workbench

## Replaced Components
- `graphViz` global state → `GraphState` centralized store
- Inline animation → `GraphAnimation` engine
- Manual camera math → `GraphCamera` controller
- Hardcoded interactions → `GraphInteraction` controller
