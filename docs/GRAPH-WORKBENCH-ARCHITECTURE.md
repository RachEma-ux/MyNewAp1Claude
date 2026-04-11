# Graph Workbench — Architecture (G-002)

> Target architecture for the KGRA Graph Workbench.

## Component Map (20 components)

```
┌─────────────────────────────────────────────────────────────┐
│                    GraphWorkbench (shell)                     │
│  ┌──────────┐ ┌───────────────────────────┐ ┌────────────┐  │
│  │ Left     │ │       GraphRenderer       │ │  Right     │  │
│  │ Panel    │ │    (Canvas 2D pipeline)    │ │ Inspector  │  │
│  │          │ │                            │ │            │  │
│  │ Search   │ │  reads from GraphState    │ │ Node       │  │
│  │ Filters  │ │  lazy viewport culling    │ │ Edge       │  │
│  │ Depth    │ │  perf-gated features      │ │ Path       │  │
│  │ Layout   │ │                            │ │ Community  │  │
│  │ Clusters │ │  ┌──────────────────────┐  │ │ History    │  │
│  │ Timeline │ │  │   GraphCamera        │  │ │            │  │
│  │ Live     │ │  │  (zoom/pan/focus)    │  │ └────────────┘  │
│  │ A11y     │ │  └──────────────────────┘  │                 │
│  └──────────┘ └───────────────────────────┘                  │
│  ┌────────────── Top Bar ──────────────────────────────────┐  │
│  │ Search | Hubs | Modes | Layout | Presets | Freeze | Fit │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────── Status Bar ───────────────────────────────┐  │
│  │ FPS [mode] | nodes · edges | Mode | Layout | Live       │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## State Flow

```
User Action → GraphInteraction → GraphState.dispatch() → notify listeners
                                                              ↓
                                          GraphRenderer.render() (each frame)
                                          GraphCamera (smooth transitions)
                                          GraphAnimation (per-item transitions)
                                          GraphInspector (panel updates)
                                          Status bar (metrics)
```

## Subsystem Boundaries

| Subsystem | Reads From | Writes To | Side Effects |
|-----------|------------|-----------|--------------|
| GraphState | — | — | Notifies listeners |
| GraphAnimation | GraphState | GraphState nodes/edges | requestAnimationFrame |
| GraphCamera | GraphState.camera | GraphState.camera | — |
| GraphRenderer | GraphState (all) | Canvas 2D | — |
| GraphLayout | GraphState.nodes/edges | GraphState node positions | requestAnimationFrame |
| GraphFilters | GraphState.filters | GraphState visibility states | GraphAnimation |
| GraphTimeline | GraphState.timeline | GraphState visibility states | GraphAnimation, setInterval |
| GraphPaths | GraphState.nodes/edges | GraphState highlight states | GraphAnimation, fetch |
| GraphClusters | GraphState.nodes | GraphState node positions | GraphAnimation, fetch |
| GraphLive | GraphState.live | GraphState.nodes/edges | EventSource |
| GraphPerf | GraphState.fps/nodeCount | GraphState.performanceMode | setInterval |
| GraphA11y | GraphState.accessibility | GraphState, GraphAnimation | localStorage |
| GraphInteraction | GraphState, Canvas events | GraphState | — |
| GraphInspector | GraphState.selectedNodeId | DOM | — |
| GraphWorkbench | — | All subsystems | Mount, render loop |

## Backend Contracts

| Service | File | Endpoints |
|---------|------|-----------|
| GraphSnapshotService | graph-snapshot.ts | snapshot, range, diff, history, activity |
| GraphPathService | graph-paths.ts | path (BFS), chain, impact |
| GraphClusterService | graph-clusters.ts | clusters, cluster/:id |
| GraphLiveService | graph-live.ts | stream (SSE), performance |

## Performance Budget

| Mode | Max Nodes | Min FPS | Features |
|------|-----------|---------|----------|
| Full | 500 | 30 | All effects |
| Balanced | 1000 | 15 | No edge labels, no pulse |
| Safe | 3000+ | 15 | No labels, no hover dim, no animation |

## Motion Ownership

All motion goes through `GraphAnimation`. No direct `ctx` animation.
Reduced motion: all durations → 0 via `GraphAnimation.setReducedMotion(true)`.
Performance guard: disables animation engine in safe mode.
