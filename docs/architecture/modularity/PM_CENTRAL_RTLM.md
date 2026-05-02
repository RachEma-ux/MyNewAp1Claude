# PM Central — RTLM Conformance Notes

This is the RTLM (Runtime + Top-Level Module) conformance record for the
PM Central module. It documents how the module satisfies each
modular-platform requirement so reviewers don't have to re-derive it from
source.

For the user-facing module description, see
[`docs/architecture/modules/PM_CENTRAL_MODULE.md`](../modules/PM_CENTRAL_MODULE.md).

## Manifest

`server/pm-central/manifest.ts` exports `pmCentralManifest`:

- `key="pmCentral"`, `name="PM Central"`, `version="1.0.0"`.
- `runtime: { mode: "embedded", required: false }`.
- `database: { kind: "owned", key: "pmdb", connect, ownedTables }`.
- `router: pmCentralRouter`, `routerKey: "pmCentral"` — mounted at
  `appRouter.pmCentral` via the typed `MODULE_ROUTERS` literal.
- `routes`, `navigation`, `governanceActions`, `events.emits`,
  `handoffs.accepts/produces`, `ports.provided/consumed`,
  `communication.modes` all populated. (See `PM_CENTRAL_MODULE.md` for the
  enumerated values.)
- `boot(ctx)` — registers a module-health action, runs idempotent seed,
  registers all gateway public APIs, registers two handoff acceptors.
- `health: pmHealth` — implements the platform `health()` contract.
- `publicApi: { path: "server/pm-central/public-api.ts" }`.

## Registration (5 places)

| Where                                                             | Entry                                |
|-------------------------------------------------------------------|--------------------------------------|
| `server/platform/modules/manifests.ts → ALL_MANIFESTS`            | `pmCentralManifest`                  |
| `server/platform/modules/module-routers.ts → MODULE_ROUTERS`      | `pmCentral: pmCentralRouter`         |
| `server/platform/modules/wiring-inventory.ts → KNOWN_MODULES`     | `{ key: "pmCentral", folder: "pm-central" }` |
| `scripts/check-modules.ts → STRONG`                               | `"pmCentral"`                        |
| `scripts/check-module-db-ownership.ts → STRONG_MODULES`           | `"pmCentral"`                        |
| `scripts/lib/module-graph.ts → MODULE_MAP`                        | `pmCentral` entry with `privateSchemas: ["pmdb"]` |
| `client/src/modules/index.ts → ALL_CLIENT_MANIFESTS`              | `pmCentralClientManifest`            |
| `client/src/App.tsx`                                              | 10 `<Route>`s under `/pm-central/rtlm/*` |
| `client/src/components/MainLayout.tsx`                            | PM Central nav group extended       |

## Database ownership

- `getPmDb()` in `server/pm-central/connection.ts` is the only way into
  `pmdb`. Not exported from `public-api.ts`.
- `pm.repository.ts` calls `db()` which throws `"PMDB not connected"` if the
  connection is null — surfaced as `INTERNAL_SERVER_ERROR: PMDB unavailable`
  by the router's `wrap()` helper.
- Schema in `drizzle/tables/pmdb.ts`. No other module imports it.
- `seed.ts → seedPmDb()` is idempotent: `CREATE TABLE IF NOT EXISTS` for all
  9 tables and their indexes. Called from `manifest.boot()`.

## Public surface

- `public-api.ts` re-exports `contracts`, `events`, `handoffs`, `ports`, and
  `pmCentralManifest`. It does **not** re-export the connection,
  repository, service, or schema.
- All cross-module callers must go through `public-api.ts`,
  `gatewayCall("pmCentral.<action>", ...)`, `submitHandoff`, or the Event
  Bus. PS uses both the gateway path (via the bridge) and the handoff lane.

## Governance

Sensitive actions declared in `governanceActions`:

| Key                              | Receipt required |
|----------------------------------|------------------|
| `pmCentral.project.archive`             | yes              |
| `pmCentral.project.status.update`       | yes              |
| `pmCentral.plan.approve`                | yes              |
| `pmCentral.handoff.convert`             | yes              |

The corresponding tRPC mutations are `governedProcedure`-wrapped — the
gateway / governance layer enforces receipts on call. Fourteen action keys
total were added to `server/governance/action-key-map.ts`.

## Event emission

All sixteen events emit through `publishEvent(makeEnvelope({ ... }))` — never
raw `bus.emit`. Envelopes carry `sourceModule: "pmCentral"`. The event
constants in `events.ts` and the `manifest.events.emits` array stay in
lock-step (verified by `__tests__/pm-events.test.ts`).

## Handoff acceptors

Two acceptors registered in `manifest.boot()` using **literal** type strings:

- `"pmCentral.project.receiveFromPS"` → records via `receivePsHandoff`
- `"pmCentral.project.convertFromPS"` → records via `receivePsHandoff`,
  then converts via `convertHandoffToProject`

The literal strings make them visible to `scripts/check-wiring-handoff.ts`.

## Architecture checks

- `pnpm check:architecture` (and the underlying `check-modules.ts`) treats
  `pmCentral` as STRONG and asserts it appears in `MODULE_ROUTERS`.
- `check-module-db-ownership.ts` asserts no other module references
  `getPmDb` or imports the schema.
- `check:wiring:awi` includes the PM Central entry in the application
  wiring inventory.

## Frontend client manifest

`client/src/modules/pm-central/manifest.ts` exports
`pmCentralClientManifest`:

- 10 routes under `/pm-central/rtlm/*`.
- One navigation group `"pmCentral"` with order 4.
- Auto-registered via `client/src/modules/index.ts → registerAllClientModules()`.

## Tests

Unit tests in `server/pm-central/__tests__/`:

- `pm-manifest.test.ts` — manifest shape, governance, routes,
  handoff/port surface.
- `pm-public-api.test.ts` — public-api re-exports.
- `pm-events.test.ts` — event constants ↔ manifest emits parity.
- `pm-validation.test.ts` — project / plan / milestone / task / risk /
  issue lifecycle state machines.
- `pm-service.test.ts` — service business logic, audit, event emission,
  handoff acceptance + conversion (idempotent).
- `pm-router.test.ts` — tRPC router shape (9 sub-routers).
- `pm-repository.test.ts` — repository function surface (35 exports).

PS-side: `server/ps/ps.pm-bridge.ts` continues to be exercised by existing
PS router tests; PM Central's handoff path is covered by
`pm-service.test.ts`.

## PS → PM compatibility

`server/ps/ps.pm-bridge.ts → createPMProjectFromPS`:

- Reads PS project, validates `VALIDATED` status (unchanged).
- Calls **`pm.service.receivePsHandoff`** (handoff lane) instead of the
  previous direct `pmt_projects` insert.
- Calls **`pm.service.convertHandoffToProject`** to materialise the
  `pm_projects` row.
- Updates `psProjects.pmProjectId` to point at the new PM Central
  `pm_projects.id` (was previously `pmt_projects.id`).
- Locks PS project status (`VALIDATED → SENT_TO_PM`) via
  `sendToPMCentral` lifecycle helper.
- PS-side audit row records both new IDs (`pmProjectId`, `pmHandoffId`).

No code in PS writes to PMDB directly. The boundary is enforced by the
service abstraction; the architecture check would flag any
`getPmDb` import outside of `server/pm-central/`.
