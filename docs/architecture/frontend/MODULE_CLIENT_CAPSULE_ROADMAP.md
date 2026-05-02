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

### Phase 3.2 — PM Central ✅ MERGED
- **Goal:** prove the capsule shape works for an RTLM whose
  storage folder name (`pm-central`) differs from its canonical URL
  subtree (`/pm`). Migrated `client/src/modules/pm-central/` to the
  capsule layout.
- The 10 RTLM pages were already inside the module folder
  (PMCentralDashboardPage, PMProjectsPage, PMProjectDetailPage,
  PMTasksPage, PMMilestonesPage, PMRisksPage, PMIssuesPage,
  PMDecisionsPage, PMHandoffsPage, PMSettingsPage). No file moves
  were needed.
- Canonical baseRoute moved from `/pm-central/rtlm/*` (the
  RTLM-namespaced canonical used before the capsule migration) to
  `/pm/*`. The 10 server-manifest routes were updated to match;
  the 9 distinct `/pm-central/rtlm/*` paths remain reachable as
  compatibility redirects rendered from App.tsx.
- The legacy `/pm-central/*` shell (PMCentralShellPage and the
  associated 16 panel routes) is **not** a PM Central RTLM
  canonical surface and was **not** migrated. Those routes
  continue to be mounted directly in App.tsx and serve a different
  shell experience.
- Updated `check:app-route-ownership` to use the manifest's
  declared `baseRoute` (when present) instead of the storage
  folder name when testing whether App.tsx mounts a canonical
  route for a migrated module. Without this fix, the legacy
  `/pm-central/*` shell mounts would have falsely failed as
  pmCentral canonical violations once `pmCentral` flipped to
  strict.
- PS → PM Central boundary preserved: PM Central UI calls only
  `trpc.pmCentral.*` (and platform-shared `trpc.hq.*`). PS hands
  off via `pmCentral.project.receiveFromPS` on the backend; no
  frontend reach-around.
- `MIGRATED_MODULES = ["communication", "dataAnalysis", "pmCentral"]`.
  AWI: `pmCentral` 96 fully-wired, warnings=0 (preserved from
  pre-capsule baseline). The next module to migrate is **Code
  Studio** (PR 5 / Phase 3.3).

### Phase 3.3 — Code Studio ✅ MERGED
- **Goal:** prove the capsule shape works for an RTLM whose existing
  shell already does view-based internal routing (the Double IBM
  Shell pattern: S1 module sidebar + optional S2 OpenCode settings
  rail). Migrated `client/src/modules/code-studio/` to the capsule
  layout.
- Pages relocated from `client/src/pages/code-studio/` to
  `client/src/modules/code-studio/pages/` (13 pages: Dashboard,
  Jobs incl. detail, Templates, Sessions, Approvals, Repositories,
  Agents, AI Catalog, Policies, Control Panel, OpenCode Settings,
  How To). Shell components relocated from
  `client/src/components/code-studio/` to
  `client/src/modules/code-studio/components/`
  (`CodeStudioShell`, `CodeStudioSidebar`, `OpenCodeSettingsRail`).
- `mod.tsx` renders `<CodeStudioShell />` directly: the existing
  shell already drives internal routing off `useLocation()` and
  preserves the special S2 rail propagation for the OpenCode
  Settings page (activeSection / activeTab / dirty). `routes.tsx`
  exists alongside as the canonical path list for
  `check:module-route-inventory`.
- 14 canonical routes covered: 11 spec paths plus 3 long-standing
  extras (`/code-studio/templates`, `/code-studio/ai-catalog`,
  `/code-studio/opencode-settings`) that pre-date the capsule
  roadmap list. Including them in `routeInventory` preserves the
  existing UX without expanding scope.
- The legacy `/code` Monaco editor route is **not** part of the
  Code Studio RTLM canonical surface. It remains mounted directly
  in App.tsx as a separate non-RTLM page.
- Port reservations remain backend-mediated through the Port
  Registry lane. Governance enforcement remains owned by the
  backend Governance module. The capsule renders only its own UI;
  no `trpc.<otherRtlm>.*` calls.
- `MIGRATED_MODULES = ["communication", "dataAnalysis", "pmCentral",
  "codeStudio"]`. AWI: `codeStudio` fully-wired, blockers=[]. The
  next module to migrate is **Projects System** (`ps`) at Phase 3.4.

### Phase 3.4 — Projects System ✅ MERGED
- **Goal:** prove the capsule shape works for an RTLM whose surface
  mixes shell-managed views (catalog/ideation list/control-panel/
  wizard/list/ai-catalog) with standalone deep-link routes
  (`/ps/ideation/:id` and `/ps/ideation/:id/convert`) that historically
  rendered without the shell.
- Migrated `client/src/modules/ps/` to the capsule layout. 22 pages
  relocated from `client/src/pages/projects-system/` to
  `client/src/modules/ps/pages/`; 29 components (PSShell, PSSidebar,
  control-panel/, ideation/, wizard/) relocated from
  `client/src/components/projects-system/` to
  `client/src/modules/ps/components/`. The legacy 12-line
  `PSShellPage.tsx` wrapper is dropped — `mod.tsx` carries the
  flex/`calc(100vh - 4rem)` chrome directly.
- 9 canonical routes covered: 8 spec paths plus the long-standing
  `/ps/ai-catalog` extra (kept for UX continuity). No legacy
  `/projects-system/*` paths existed in App.tsx, so
  `compatibilityRoutes` is empty.
- `mod.tsx` is a thin Wouter `<Switch>`: dynamic ideation routes
  (`:id` and `:id/convert`) dispatch to their dedicated pages
  WITHOUT PSShell to preserve their full-page UX; everything else
  falls through to `<PSShell />` which keeps its existing internal
  view dispatch off `useLocation()`.
- **PS → PM Central boundary preserved.** PS UI calls only
  `trpc.ps.*`. The Ideation Chat Window's pre-existing round-table
  call (previously `trpc.sandboxWf.maestro.roundTable`) was
  refactored to call `trpc.ps.chat.roundTable`, a thin PS-side proxy
  that delegates to the Sandbox WF service server-side. This
  preserves the frontend cross-module boundary; no UX change.
- WorkspaceExecutionShell (a workspace platform component, not a
  module) had its 4 PS page imports updated to the new
  `@/modules/ps/pages/` paths.
- `MIGRATED_MODULES = ["communication", "dataAnalysis", "pmCentral",
  "codeStudio", "ps"]`. AWI: `ps` fully-wired, blockers=[]. The
  next module to migrate is **PRM** at Phase 3.5.

### Phase 3.1 — Data Analysis ✅ MERGED
- **Goal:** prove the capsule shape scales to a multi-subdomain
  RTLM. Data Analysis owns three subdomains (GraphRAG, Data
  Acquisition with 10 sub-tabs, Data Warehouse).
- Migrated `client/src/modules/data-analysis/` to the capsule
  layout. Pages relocated from `client/src/pages/data-analysis/` to
  `client/src/modules/data-analysis/pages/` (GraphRAG family +
  Data Acquisition family + Data Warehouse).
- Moved `/data-analysis`, `/data-analysis/graphrag`,
  `/data-analysis/data-acquisition[/...]` (10 paths), and
  `/data-analysis/data-warehouse` off App.tsx. The bare
  `/data-analysis` redirects to `/data-analysis/graphrag` inside
  the capsule (preserves the prior `<Redirect>` UX).
- KGRA Agent was **not** migrated. KGRA's `/data-analysis/kgra-agent`
  route stays on App.tsx (mounted by KGRA's own manifest), since
  KGRA Agent is a separate RTLM. The path lives under Data
  Analysis's `/data-analysis` URL prefix by historical accident
  only.
- Removed RAG manifest's stale `/data-analysis/graphrag` claim
  (GraphRAG is a Data Analysis subdomain, not a RAG subdomain).
  This eliminated a pre-existing duplicate-canonical-ownership
  warning that would otherwise have failed
  `check:module-routes-conflict` once Data Analysis flipped to
  strict mode.
- Dropped a single tab inside `GraphRAGPage` ("KGRA Agent" tab)
  that previously made `trpc.kgraAgent.*` calls from inside Data
  Analysis territory. KGRA remains accessible at its own
  `/data-analysis/kgra-agent` route.
- `MIGRATED_MODULES = ["communication", "dataAnalysis"]`. Every
  frontend modularity check is strict for Communication and Data
  Analysis. AWI: `dataAnalysis` 95 fully-wired (improved from
  warnings=1 → warnings=0).

### Subsequent migrations (one PR each)

The order is intentional — modules with the largest blast radius
go first so we shake out platform-side issues before touching the
long tail.

1. Communication                   _(Phase 2 pilot, merged)_
2. Data Analysis                   _(Phase 3.1, merged)_
3. PM Central                      _(Phase 3.2, merged)_
4. Code Studio                     _(Phase 3.3, merged)_
5. Projects System (`ps`)          _(Phase 3.4, merged)_
6. PRM                             _(Phase 3.5, next)_
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
