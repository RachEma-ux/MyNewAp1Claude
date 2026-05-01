# Modular Platform — Phase 2 Closure Report

**Branch:** `feat/close-modular-platform-gaps`
**Predecessor:** PR #46 (`feat/modular-platform`, merged 2026-04-30)

This report documents the second pass at closing the modular-platform
gaps that were left intentionally open in PR #46. The first pass landed
the registry, gateway, handoff manager, event bus, coordinator runtime,
13 module manifests, the Digital HQ read model, and 6 architecture-CI
checks. This pass turns those foundations from "wired but stubbed" into
"durable, observable, boundary-enforced".

## Gaps closed in this pass

### Gap #1 — `registerPublicApi` handlers wired

Every module's `boot:` hook now calls
`registerModuleHealthAction(<manifest>)` to register a uniform
`<key>.health` action with the Module Gateway. Health is read-only and
does not require a governance receipt, so it's safe to register
unconditionally; observability tooling (Digital HQ + other modules) now
has a governed, boundary-respecting way to ask "is module X up?".

PRM additionally registers a real read-only public API
(`prm.methods.listTemplates`) as the canonical "rich public API" example
for other modules to copy.

### Gap #2 — Frontend module manifests

`client/src/modules/<key>/manifest.ts` exists for each migrated module
(prm, psm, codeStudio, agentStudio, sandboxWf, rag, openRouter, ps, hr,
organizationManagement, cultureValues, aiTypes, kgraAgent). Each one
declares: `key`, `name`, `routes` (with lazy-loaded components),
`navigation` entries, and `requiredPermissions`. A central
`client/src/modules/index.ts` registers all 13 with the existing client
registry on import.

### Gap #3 — Durable Event Bus foundations

`server/platform/events/store.ts` defines the `EventBusStore` interface
(`outbox`, `inbox`, `deadLetter`, `criticalDeadLetter` collections with
typed records) and a `DbEventBusStoreNotConfigured` foundation that
throws on every method. The in-memory store remains the default; a
follow-up phase swaps it for a Postgres-backed store using the schema
in `migrations/event-bus/001_outbox_inbox_dlq.sql`.

### Gap #4 — Persistent Coordinator store foundations

`server/platform/coordinator/store.ts` extracts the `WorkflowStore`
interface, ships an `InMemoryWorkflowStore` as the default, and a
`DbWorkflowStoreNotConfigured` foundation that throws until wired up.
Schema lives in `migrations/coordinator/001_workflows.sql`.

### Gap #5 — DB role / grant scripts

`migrations/db-roles/` contains a per-module SQL template that
provisions a least-privilege Postgres role (`prm_runtime_user`,
`psm_runtime_user`, etc.) with CONNECT + table CRUD on its own DB only.
`scripts/check-db-roles.ts` (registered as `check:db-roles` and rolled
into `check:architecture`) connects to the live cluster and warns when
a role has CONNECT on a foreign DB or has been granted superuser. The
check auto-skips in dev sandboxes that don't set `DATABASE_URL`.

### Gap #8 — `<ModuleRoutes />` mounted in App.tsx

`App.tsx` imports `@/modules` (side-effectful registration) and renders
`<ModuleRoutes />` after the existing Switch entries. Wouter's `Switch`
picks the first match, so existing routes always win — module-only
routes flow through `<ModuleRoutes />` going forward. This is the
deliberate compatibility-mode rollout: new modules mount via manifest,
existing routes stay where they are until incrementally migrated.

### Digital HQ expansion

`DigitalHqSnapshot` now exposes:

- `modules.degradedKeys` for at-a-glance alerts.
- `events.criticalDeadLetter` (introduced in PR #46 review-fix).
- All handoff statuses (`draft`, `inProgress`, `cancelled`).
- All workflow statuses (`draft`, `paused`, `compensating`,
  `compensated`, `cancelled`).
- `workflows.stuck` + `workflows.stuckIds` (5-minute non-terminal
  threshold).
- `gateway`: registered actions count + per-module breakdown.
- `compensation`: handlers count + per-module breakdown.

### A2 — Compensation handler registry (carried forward)

`server/platform/coordinator/compensation-registry.ts` now refuses to
silently no-op a `compensation` workflow step. If no handler is
registered for `(module, action)`, the runtime throws and the workflow
fails loudly. Worked examples are in
`server/platform/coordinator/coordinator-examples.test.ts`.

### A5 — Centralized manifest registration (carried forward)

`server/routers.ts` no longer triggers a side-effectful
`registerAllManifests()` import. The platform module bootstrap is the
single registration site, eliminating the dual-registration risk.

## Architecture CI

`pnpm check:architecture` now runs:

```
check:modules
check:boundaries
check:sql-boundaries
check:db-ownership
check:coordinator-boundaries
check:governance-actions
check:db-roles      ← new in this pass
```

`tsc --noEmit` runs as `pnpm check`. Both pass on this branch.

## What remains for a future pass

- Actually persist the in-memory `WorkflowStore` and `EventBusStore`
  using the migrations in this PR. The interfaces and DDL are in place;
  the implementation is gated behind environment variables to avoid
  forcing a Postgres roundtrip in dev sandboxes.
- Migrate the existing App.tsx routes off `<Switch>` and onto
  `<ModuleRoutes />` per module, one at a time, deleting the App.tsx
  copy after each migration.
- Wire `requiredPermissions` on client manifests into the existing
  `useHrRole`-style gate so a module's nav entries hide when the user
  lacks permission.
- Add a real `app_runtime_user` Postgres role to the dev sandbox setup
  script and wire `DATABASE_URL` to use it (currently the dev sandbox
  connects as the cluster superuser).
