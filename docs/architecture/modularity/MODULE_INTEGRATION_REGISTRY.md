# Module Integration Registry

The Module Integration Registry is the public surface that backs the
Application Wiring Inventory. Consumers (Digital HQ, scripts, tests)
import from `server/platform/wiring`; the implementation files inside
that folder are not load-bearing.

## Public surface

```ts
import {
  // Inventory
  buildApplicationWiringInventory,
  // Matrix
  buildWiringMatrix,
  getModuleWiring,
  getMissingWires,
  getBrokenWires,
  getDeclaredOnlyWires,
  getPartialWires,
  // Graph
  buildDependencyGraph,
  buildGraphFromInventory,
  getModuleDependencies,
  getReverseDependencies,
  detectDependencyCycles,
  // Readiness
  computeReadiness,
  AREA_WEIGHTS,
  // Report
  renderApplicationWiringReport,
  // Types
  type ModuleWiringInventory,
  type ModuleWiringAreaStatus,
  type WiringMatrix,
  type WiringGraph,
  type WiringInventorySummary,
  type ModuleReadinessStatus,
} from "server/platform/wiring";
```

## tRPC procedures

Mounted at `hq.applicationWiring.*` (see
`server/hq/application-wiring-router.ts`).

| Procedure | Returns | Notes |
|---|---|---|
| `summary` | `WiringInventorySummary` | Card values for the dashboard. |
| `matrix` | `WiringMatrix` | Full per-module × per-area grid + summary. |
| `module(moduleKey)` | `ModuleWiringInventory \| null` | Drill-down view. |
| `graph` | `WiringGraph` | Nodes + edges + cycles. |
| `missing` | `{ missing, broken, declaredOnly, partial }` | Buckets for fix-it lists. |
| `blockers` | `Array<{ moduleKey, blockers }>` | Modules that need attention. |
| `readiness` | `Array<{ moduleKey, readinessScore, ... }>` | Compact scoreboard. |

All seven are `protectedProcedure.query` — read-only, no mutations.

## Optional runtime facts

The router collects these on each call (lazy-imported, all
non-fatal):

- gateway-registered actions (from `listRegisteredActions()`)
- module registry state (from `getModuleRegistry().states_()`)
- event-bus stats (from `getEventStats()`)
- handoff stats (from `listHandoffs()`)

If a sub-system is not initialised yet (e.g. event bus before
`registerAllManifests()` runs), the corresponding facts block is
omitted and AWI falls back to the static parse.

## Boundary rules

The AWI router and builder are bound by the same rules as every
other platform read-model:

- ✅ may read `server/platform/*` modules and types
- ✅ may dynamically import `server/platform/{events,handoff,coordinator,modules}` for stats
- ❌ may NOT import `server/<module>/repository`, `connection`, `services/*`, `db/*`
- ❌ may NOT execute SQL against module-owned DBs
- ❌ may NOT call governance, OPA, or any policy engine to gate AWI access

`scripts/check-wiring-inventory.ts` enforces (1) the inventory builds
without error, (2) every module appears, (3) every column is
populated, and (4) the markdown report renders. The architecture-
boundary check (`scripts/check-module-boundaries.ts`) enforces the
import boundaries.
