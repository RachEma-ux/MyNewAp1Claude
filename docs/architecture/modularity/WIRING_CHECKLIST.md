# Module Wiring Checklist

Use this checklist when adding a new module or auditing an existing one.

A module is **fully wired** only when every applicable box is checked.

## Manifest

- [ ] `server/<folder>/manifest.ts` exists and exports `<key>Manifest`
- [ ] Manifest is added to `ALL_MANIFESTS` in
      `server/platform/modules/manifests.ts`
- [ ] `key`, `name`, `version` are set
- [ ] `runtime.mode` is one of `shared` / `embedded` / `worker` / `external`
- [ ] `runtime.required` is set explicitly (true blocks startup, false degrades)
- [ ] `database` descriptor matches the module's actual storage:
  - `none` if no DB
  - `shared` with `ownedTables` for platform-DB modules
  - `owned` with `key` and `ownedTables` for strong modules

## Router

- [ ] tRPC router exported from manifest as `router` (or `routerKey` set)
- [ ] Router is wired into `MODULE_ROUTERS` in
      `server/platform/modules/module-routers.ts`

## Lifecycle

- [ ] `boot` hook is declared
- [ ] `health()` is declared
- [ ] No top-level side effects in `manifest.ts` or `boot.ts`
      (no `setInterval`, `setTimeout`, `new pg.Pool`, `new Worker`, top-level `await`)
- [ ] `postListen` is declared if the module needs post-server-listen work
- [ ] `stop` is declared if the module starts long-running resources

## Public API

- [ ] Every cross-module action is declared in `governanceActions[]`
- [ ] `boot()` calls `registerPublicApi()` for each declared action
- [ ] Actions with `receiptRequired: true` propagate the flag in
      `descriptor.receiptRequired`
- [ ] Handlers do NOT directly export private repository / connection /
      service symbols — they wrap them

## Events

- [ ] Event types this module emits are declared in `events.emits`
- [ ] Event types this module consumes are declared in `events.consumes`
- [ ] `boot()` calls `subscribeEvent()` for each declared consumption
- [ ] Producers use `makeEnvelope` (not raw object literals)
- [ ] Critical events have failure handlers wired (not just hope)
- [ ] Logical retries reuse `idempotencyKey` so downstream dedup works

## Handoffs

- [ ] Handoff types this module produces are declared in `handoffs.produces`
- [ ] Handoff types this module accepts are declared in `handoffs.accepts`
- [ ] `boot()` calls `registerHandoffAcceptor()` for each accepted type
- [ ] Receiving module owns target record creation
      (sender never writes the receiver's DB)
- [ ] Acceptor file does not import private cross-module paths
- [ ] Simple `PS → PM Central` flows are handoff-only, not coordinator

## Routes / Navigation

- [ ] Server manifest declares `routes[]` for SPA routes
- [ ] `client/src/modules/<folder>/manifest.ts` exists with the
      same routes
- [ ] Client manifest is registered via `registerClientModule()`
- [ ] Nav items reference declared routes (no dangling links)
- [ ] Hardcoded `<Route>` entries in `App.tsx` are documented as
      compatibility-mode

## Governance

- [ ] Every governance action in `governanceActions[]` has a stable `key`
- [ ] Each action has a `risk` classification
- [ ] Sensitive actions set `receiptRequired: true`
- [ ] No private DB action is exposed via the gateway

## Coordinator boundary

- [ ] Coordinator never imports this module's repository, connection,
      service, or schema files
- [ ] Cross-module coordination uses the four step kinds:
      `gateway-call` / `handoff` / `event-publish` / `wait-for-event`
- [ ] Compensation handlers are real or explicitly stubbed

## Digital HQ

- [ ] Module appears in the registry list — `snapshotDigitalHq()` will pick it up
- [ ] Health is reported via `manifest.health()` so HQ can color it
- [ ] The HQ snapshot does NOT query this module's private DB directly

## Validation

- [ ] `pnpm check` passes
- [ ] `pnpm check:architecture` passes
- [ ] `pnpm check:wiring` passes (or flags only follow-ups)
- [ ] Targeted tests under `server/platform/**/*-wiring.test.ts` pass
- [ ] `pnpm build` passes
