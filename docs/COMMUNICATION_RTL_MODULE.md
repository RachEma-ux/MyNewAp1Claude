# Communication — RTLM Conformance Notes

This is the RTLM (Runtime + Top-Level Module) conformance record for the
Communication module. It documents how the module satisfies each
modular-platform requirement so reviewers don't have to re-derive it from
source.

For the user-facing module description, see
[COMMUNICATION_MODULE.md](./COMMUNICATION_MODULE.md).

## Manifest

`server/communication/manifest.ts` exports `communicationManifest`:

- `key="communication"`, `name="Communication"`, `version="1.0.0"`.
- `runtime: { mode: "embedded", required: false }` — boots in-process; the
  app keeps starting if Communication's boot fails.
- `database: { kind: "owned", key: "communicationdb", connect, ownedTables }`.
- `router: communicationRouter`, `routerKey: "communication"` — mounted at
  `appRouter.communication` via the typed `MODULE_ROUTERS` literal.
- `routes`, `navigation`, `governanceActions`, `events.emits`,
  `handoffs.accepts/produces`, `ports.provided/consumed`,
  `communication.modes` all populated. (See COMMUNICATION_MODULE.md for the
  enumerated values.)
- `boot(ctx)` — registers a module-health action, runs idempotent seed,
  registers all gateway public APIs, registers all handoff acceptors.
- `health: communicationHealth` — implements the platform `health()` contract.
- `publicApi: { path: "server/communication/public-api.ts" }`.

## Registration

| Where                                                             | Entry                                |
|-------------------------------------------------------------------|--------------------------------------|
| `server/platform/modules/manifests.ts → ALL_MANIFESTS`            | `communicationManifest`              |
| `server/platform/modules/module-routers.ts → MODULE_ROUTERS`      | `communication: communicationRouter` |
| `server/platform/modules/wiring-inventory.ts → KNOWN_MODULES`     | `{ key: "communication", folder: "communication" }` |
| `scripts/check-modules.ts → STRONG`                               | `"communication"`                    |
| `scripts/check-module-db-ownership.ts → STRONG_MODULES`           | `"communication"`                    |
| `scripts/lib/module-graph.ts → MODULE_MAP`                        | `communication` entry with `privateSchemas: ["communicationdb"]` |
| `client/src/modules/index.ts → ALL_CLIENT_MANIFESTS`              | `communicationClientManifest`        |
| `client/src/App.tsx`                                              | 5 `<Route>`s + 3 legacy `<Redirect>`s |
| `client/src/components/MainLayout.tsx`                            | "Communication" nav group            |

## Database ownership

- `getCommunicationDb()` in `server/communication/connection.ts` is the only
  way into `communicationdb`. Not exported from `public-api.ts`.
- `communication.repository.ts` calls `db()` which throws
  `"CommunicationDB not connected"` if the connection is null — surfaced as
  `INTERNAL_SERVER_ERROR: CommunicationDB unavailable` by the router's
  `wrap()` helper.
- Schema in `drizzle/tables/communicationdb.ts`. No other module imports it.
- `seed.ts → seedCommunicationDb()` is idempotent: `CREATE TABLE IF NOT
  EXISTS` for all 5 tables and their indexes. Called from `manifest.boot()`.

## Public surface

- `public-api.ts` re-exports `contracts`, `events`, `handoffs`, `ports`, and
  `communicationManifest`. It does **not** re-export the connection,
  repository, service, or schema.
- All cross-module callers must go through `public-api.ts`,
  `gatewayCall("communication.<action>", ...)`, `submitHandoff`, or the
  Event Bus.

## Governance

Sensitive actions declared in `governanceActions`:

| Key                                       | Receipt required |
|-------------------------------------------|------------------|
| `communication.conversation.delete`       | yes              |
| `communication.message.delete`            | yes              |
| `communication.meeting.cancel`            | yes              |
| `communication.export`                    | yes              |

The corresponding tRPC mutations are `governedProcedure`-wrapped — the
gateway / governance layer enforces receipts on call.

## Event emission

All eight events emit through `publishEvent(makeEnvelope({ ... }))` — never
raw `bus.emit`. Envelopes carry `sourceModule: "communication"`. The event
constants in `events.ts` and the `manifest.events.emits` array stay
in lock-step (verified by `__tests__/communication-events.test.ts`).

## Handoff acceptors

Three acceptors registered in `manifest.boot()` using **literal** type
strings:

- `"communication.conversation.open"` → `createConversation`
- `"communication.meeting.schedule"` → `createMeeting`
- `"communication.notification.create"` → `createNotification`

The literal strings make them visible to `scripts/check-wiring-handoff.ts`.

## Architecture checks

- `pnpm check:architecture` (and the underlying `check-modules.ts`) treats
  `communication` as STRONG and asserts it appears in `MODULE_ROUTERS`.
- `check-module-db-ownership.ts` asserts no other module references
  `getCommunicationDb` or imports the schema.
- `check:wiring:awi` includes the Communication entry in the application
  wiring inventory.

## Frontend client manifest

`client/src/modules/communication/manifest.ts` exports
`communicationClientManifest`:

- 5 routes pointing at the lazy-loaded pages.
- One navigation group `"communication"` with order 5.
- Auto-registered via `client/src/modules/index.ts → registerAllClientModules()`.

## Tests

Unit tests in `server/communication/__tests__/`:

- `communication-manifest.test.ts` — manifest shape, governance,
  routes, handoff/port surface.
- `communication-public-api.test.ts` — public-api re-exports.
- `communication-events.test.ts` — event constants ↔ manifest emits parity.
- `communication-contracts.test.ts` — Zod schema accept/reject.
- `communication-validation.test.ts` — conversation + meeting lifecycle
  state machine.
- `communication-service.test.ts` — service business logic, audit, event
  emission, source attribution from agents.
- `communication-router.test.ts` — tRPC router shape (7 sub-routers).
- `communication-repository.test.ts` — repository function surface.

## Compatibility delegates

- `server/chat/router.ts` — calls `svc.chatSendMessage`,
  `svc.listConversations`, `svc.deleteConversation`. No DB writes here.
- `server/routers/conversations.ts` — calls `svc.createConversation`,
  `svc.listConversations`, `svc.getConversation`, `svc.deleteConversation`.
  Maps `agentId` → `conversationType="agent" + sourceModule="agents" +
  sourceRefId=agentId`. Returns legacy shape.
