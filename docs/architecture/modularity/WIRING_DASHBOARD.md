# Application Wiring Dashboard (Digital HQ)

The Application Wiring Inventory is exposed in Digital HQ at:

```
/hq/application-wiring
```

Routed through `client/src/pages/DigitalHQPage.tsx` →
`ApplicationWiringInventoryPanel`.

## Layout

1. **Summary cards** — module count, fully wired, mostly/partial,
   blocked, average readiness score, missing required wires.
2. **Wiring matrix** — `WiringMatrixTable` with one row per module
   and one cell per wiring area. Module rows are clickable.
3. **Module detail** — opens when you click a module row. Shows the
   readiness score, blockers, warnings, per-area evidence, and the
   dependency edges originating from this module.
4. **Modules with blockers** — list of modules with one or more
   blockers, each with its score and blocker reasons.
5. **Missing / partial wires** — four buckets (missing, broken,
   declared-only, partial), capped at 8 entries each with overflow
   indicator.
6. **Dependency graph** — list view of every module node and its
   outgoing edges. Cycles, when present, are highlighted at the top.

## Data flow

```
ApplicationWiringInventoryPanel
  ├── trpc.hq.applicationWiring.matrix.useQuery()
  ├── trpc.hq.applicationWiring.blockers.useQuery()
  ├── trpc.hq.applicationWiring.missing.useQuery()
  └── trpc.hq.applicationWiring.graph.useQuery()
        │
        └── server/hq/application-wiring-router.ts
              │
              └── server/platform/wiring/index.ts
                    └── reads server/<module>/manifest.ts (static)
                    └── lazy-imports gateway/registry/events/handoff stats
```

The whole pipeline is read-only; there are no mutations.

## Performance

The matrix call re-parses every manifest on each request (roughly
13 files, sub-100ms in practice). Caching is intentionally absent
in this PR so dashboard data is always fresh and aligns with the
check-script output. Phase 2 will add a snapshot table and a
periodic refresher.

## Why not a full graph visualisation?

This PR ships the dependency graph as a list view inside the panel
rather than wiring a graph library. Reasons:

- The numbers are small (63 nodes, 56 edges) and the list is
  readable.
- Graph libraries add bundle weight and need careful CSS to fit the
  IBM control-shell look.
- The data is already in the response — a future PR can swap the
  list for a `reactflow` view without touching the backend.

## Operating notes

- The panel is read-only — no actions, no governance receipts
  needed.
- All queries go through `protectedProcedure`; an unauthenticated
  user gets the standard auth screen.
- If the server hasn't called `registerAllManifests()` yet (some
  scripts), the panel shows "fall-back to static parse" data
  instead of the runtime-merged view.
