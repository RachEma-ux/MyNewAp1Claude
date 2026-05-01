# Application Wiring Inventory (AWI)

The Application Wiring Inventory is a read-model that observes how
each platform module is wired into the application. It does not own
any business logic, mutate any module state, or replace the existing
modular registry / runtime manager / governance engine.

## Charter

AWI **may**:

- read module manifests
- read the Module Registry / Runtime Manager runtime state
- read Module Gateway / Event Bus / Handoff Manager / Coordinator metadata
- read or compute architecture-check results
- build wiring matrices, dependency graphs, readiness scores
- expose Digital HQ surfaces and reports
- flag missing / broken / partial / declared-only wires

AWI **must not**:

- import a module's private repositories, connections, or services
- query a module's private DB tables
- mutate module data
- bypass governance
- behave as another coordinator
- replace module manifests as the source of truth

## What AWI tracks per module

Each module gets one entry per wiring **area**:

| Area | What it checks | Required? |
|---|---|---|
| `manifest` | server manifest file exists | yes |
| `server-router` | manifest declares a tRPC router | yes if module has APIs |
| `client-route` | client manifest mounts the declared SPA routes | yes if module has UI |
| `navigation` | manifest declares navigation entries | optional |
| `public-api` | governance actions registered with module-gateway | yes if module exposes APIs |
| `gateway` | runtime gateway handler matches declared action | yes if module exposes APIs |
| `database` | manifest's `database` block matches reality | yes for owned/shared DB modules |
| `permission` | `manifest.permissions.keys` declared | yes |
| `governance` | `manifest.governanceActions` declared | yes if module has gated actions |
| `event` | emits/consumes vs subscriptions | optional |
| `handoff` | produces/accepts vs registered acceptors | optional |
| `runtime` | runtime mode + lifecycle hooks; no import-time side effects | yes |
| `port-endpoint` | manifest's logical service ports | optional |
| `agent-provider` | aiTypes catalog binding for AI-using modules | optional |
| `observability` | `health()` declared and HQ snapshot includes module | yes |
| `test` | one or more `*.test.ts` under the module folder | optional |
| `documentation` | a doc / README exists for the module | optional |

The status for each area is one of:

- `wired` — declared and verified at runtime
- `declared-only` — declared in manifest but no runtime registration found
- `partial` — some sub-items wired, others missing
- `missing` — required by another contract but no declaration exists
- `broken` — declared and registered but a sanity check fails
- `blocked` — a hard dependency is `missing` / `broken` / `blocked`
- `not-applicable` — module legitimately does not participate

## How it's computed

AWI is a **computed read-model**. Every call to `buildApplicationWiringInventory()`
re-parses the manifest source files and produces a fresh snapshot.
There is no AWI database in this PR (Phase 2 — see below).

The builder layers on top of `server/platform/modules/wiring-inventory.ts`,
which already discovers the 13 known modules and parses each manifest
statically. AWI extends that data with eight additional areas
(`gateway`, `permission`, `port-endpoint`, `agent-provider`,
`observability`, `test`, `documentation`, plus a split between
`public-api` and `gateway`).

## Adding a module

1. Add the module to `KNOWN_MODULES` in
   `server/platform/modules/wiring-inventory.ts`.
2. Create the standard files under `server/<folder>/`:
   `manifest.ts`, `public-api.ts`, `events.ts`, `handoffs.ts`,
   `ports.ts`, `contracts.ts`, plus a `boot.ts` if you have boot-time
   side effects.
3. Run `pnpm run check:wiring-inventory`. The new module will appear
   in the matrix; areas you have not yet implemented will show as
   `missing` or `declared-only` with a soft severity.
4. Refer to `WIRING_MATRIX.md` for what each cell means and
   `READINESS_SCORING.md` for how the score is computed.

## Phase 2 — persistence

This PR ships the AWI as a **computed-only** read model. Phase 2
(separate PR) will persist:

- `app_module_wiring_inventory` — module-level rows
- `app_module_wiring_areas` — per-area status + score
- `app_module_dependencies` — graph edges
- `app_module_readiness_checks` — historical scoring snapshots
- `app_module_wiring_snapshots` — daily / per-PR snapshots for trend lines

The computed model in this PR is deliberately the same shape that
Phase 2 will persist — so the migration is "stop computing on every
call, read the latest snapshot row and fall back to compute if
absent."

## See also

- `MODULE_INTEGRATION_REGISTRY.md` — the public surface AWI exposes
- `WIRING_MATRIX.md` — matrix layout
- `DEPENDENCY_GRAPH.md` — graph schema and cycle handling
- `READINESS_SCORING.md` — score weights and thresholds
- `WIRING_DASHBOARD.md` — Digital HQ surface walkthrough
- `MODULE_WIRING_REPORT.md` — auto-generated per-PR report
