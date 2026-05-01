# Dependency Graph

The AWI dependency graph is a typed bipartite graph of modules and
the platform contracts they touch. It is computed from each module's
declared dependencies (DB ownership, port consumption, event/handoff
participation, governance scope) — not from import-graph traversal.

## Node types

| Prefix | Type | Example |
|---|---|---|
| `module:` | `module` | `module:codeStudio` |
| `db:` | `database` | `db:codedb` |
| `event:` | `event` | `event:documents.uploaded` |
| `handoff:` | `handoff` | `handoff:codeStudio.run.requested` |
| `port:` | `port` | `port:codeStudio.run` |
| `gov:` | `governance` | `gov:codeStudio` |

A node id always has the form `<type>:<key>` and is unique. Module
nodes carry `readinessScore` and `status` fields so the dashboard
can colour them without a second lookup.

## Edge types

| `dependencyType` | Origin |
|---|---|
| `owned` | Module owns a database. |
| `shared` | Module reads/writes the platform DB. |
| `emits` / `consumes` | Event participation. |
| `produces` / `accepts` | Handoff participation. |
| `declares` | Module declares governance actions. |
| `provides` / `consumes` | Logical service ports. |
| `consumes-port` | Module-to-module dependency derived from a `<other>.<verb>` port string. |

Every edge carries `required: boolean`. Required edges are styled
prominently in the dashboard and counted toward the
`missingRequiredWires` summary.

## Cycle detection

Only `module:` → `module:` edges (induced by `consumes-port`) feed
the cycle detector — events, handoffs, and DBs are leaves and can't
participate in a module-level cycle.

The detector is a depth-first traversal that records each cycle once
(rotation-normalised so `a→b→a` and `b→a→b` don't both appear).
Self-loops are reported.

`pnpm run check:dependency-graph` lists cycles informationally. To
fail CI on cycles, run with `FAIL_ON_CYCLES=1`.

## Today's graph

As of this PR's first run:

- 63 nodes (13 module + DBs + events + handoffs + governance + ports)
- 56 edges
- 0 cycles

The numbers will drift as modules add ports and events; the matrix
report (auto-generated) has the current totals.

## Limits

- Static analysis only — runtime call patterns aren't observed.
- Module-to-module edges only fire when a port string follows the
  `<otherModule>.<verb>` convention. Modules that consume ports via
  other naming conventions appear as port-leaf edges only.
- Health state, runtime mode, and dependency edges aren't crossed —
  a module marked `degraded` in the registry doesn't propagate
  `blocked` to its dependents in this PR.
