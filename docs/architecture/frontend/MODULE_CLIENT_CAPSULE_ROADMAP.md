# Module Client Capsule — Roadmap

The Module Client Capsule refactor moves every Real-Time Lifecycle
Module (RTLM) from the legacy "App.tsx mounts every page" pattern to
self-contained frontend capsules — one entrypoint per module, owning
its own internal routing, layout, and nav.

## Phases

### Phase 0 — Guardrails (this PR)
- **Goal:** prove the safety net before any module migrates.
- **Touches:** `scripts/module-tools/`, `scripts/check-*` (frontend
  modularity suite), `scripts/generate-route-ownership-map.ts`,
  `client/src/platform/modules/route-composer.tsx` (deterministic +
  capsule-aware), `client/src/platform/modules/types.ts` (optional
  capsule fields), `server/platform/modules/wiring-types.ts` and
  `wiring-inventory.ts` (`routeSource` field; capsule-covered routes
  count as wired).
- **No module migrated.** `MIGRATED_MODULES = []`.
- **No App.tsx route removed.** Legacy mounts continue to work
  unchanged.
- **AWI behavior:** unchanged for unmigrated modules; once a manifest
  declares `baseRoute` + `capsuleEntrypoint`, the AWI inventory
  counts every server-declared subtree path as wired through the
  capsule.

### Phase 2 — Pilot: Communication ✅ MERGED
- **Goal:** prove a real RTLM works end-to-end in the capsule shape.
- Migrated `client/src/modules/communication/` to the capsule layout
  (`client.ts`, `manifest.ts`, `mod.tsx`, `routes.tsx`, `nav.ts`,
  `index.ts`, `components/CommunicationShell.tsx`, `types.ts`).
- Moved `/communication/*` routes off App.tsx; private page imports
  removed. The three compatibility redirects (`/chat`,
  `/conversations`, `/video-meeting`) remain in App.tsx as
  `<Redirect>` shims only.
- `MIGRATED_MODULES = ["communication"]`. Every frontend modularity
  check is strict for Communication.

### Subsequent migrations (one PR each)

The order is intentional — modules with the largest blast radius
go first so we shake out platform-side issues before touching the
long tail.

1. Communication                   _(Phase 1 pilot, above)_
2. Data Analysis
3. PM Central
4. Code Studio
5. Projects System (`ps`)
6. PRM
7. PSM
8. HR
9. Organization Management
10. Culture Values
11. AI Types
12. OpenRouter
13. Agent Studio
14. Sandbox WF
15. KGRA Agent

## Definition of Done per migration

A module is "migrated" only when **all** of these hold:

- ✅ `MIGRATED_MODULES` includes the key
- ✅ `client.ts`, `manifest.ts`, `mod.tsx`, `routes.tsx`,
  `nav.ts`, `index.ts` all present under `client/src/modules/<folder>/`
- ✅ manifest declares `baseRoute`, `capsuleEntrypoint`,
  `layoutMode`, `routeInventory`, `compatibilityRoutes`
- ✅ `App.tsx` mounts no canonical paths under the module's
  `baseRoute` (only compatibility redirects allowed)
- ✅ `App.tsx` does not import any private page from the module
- ✅ no `MainLayout` import inside `client/src/modules/<folder>/`
- ✅ no `trpc.<otherRtlm>.*` calls inside the module
- ✅ `index.ts` exports only public route builders + types — no
  routers, services, or pages
- ✅ `pnpm run check:frontend-modularity` passes with zero failures
- ✅ AWI score for the module is preserved or improved
- ✅ Route Ownership Map regenerated and committed

## Platform Core (never migrate)

These prefixes stay mounted directly in `App.tsx`. They are central
concerns, not RTLMs:

`/auth`, `/login`, `/logout`, `/system`, `/diagnostic`,
`/diagnostics`, `/governance`, `/hq`, `/digital-hq`, `/ws`,
`/workspace`, `/workspaces`, `/ws-catalog`, `/modules`,
`/orchestrator`, `/secrets`, `/policies`, `/key-rotation`, `/keys`.

## Why this matters

- **Boundary integrity.** Today's "every route in App.tsx" means
  any change to Communication may ship private types into App.tsx's
  bundle and any module is one careless import away from coupling.
- **Lifecycle correctness.** A module that owns its own routes can
  honor its own `disabled` / `degraded` states without App.tsx
  threading every fallback by hand.
- **AWI signal.** When the manifest's `routeInventory` is the source
  of truth, AWI knows which routes the module *intends* to ship and
  can flag drift instead of just counting raw `<Route>` elements.

## See also

- [`MODULE_CLIENT_CAPSULE_LIFECYCLE.md`](./MODULE_CLIENT_CAPSULE_LIFECYCLE.md)
  — concrete shape of each capsule file
- [`CROSS_MODULE_FRONTEND_BOUNDARIES.md`](./CROSS_MODULE_FRONTEND_BOUNDARIES.md)
  — what one module can/can't do to another
- [`ROUTE_OWNERSHIP_MAP.md`](./ROUTE_OWNERSHIP_MAP.md)
  — generated; regenerate with
  `pnpm run generate:route-ownership-map`
