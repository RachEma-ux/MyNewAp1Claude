# Cross-Module Frontend Boundaries

One module's UI may not reach into another module's internals.
This is the operational contract; the rules are enforced by the
`check:frontend-modularity` suite.

**Status:** Strict mode is currently active for **`communication`**,
**`dataAnalysis`**, and **`pmCentral`**
(`MIGRATED_MODULES = ["communication", "dataAnalysis", "pmCentral"]`).
Every rule below fails the build for any violation in those three
capsules. Other RTLMs continue in report-only mode until their own
migration PR flips them to strict.

Data Analysis owns three frontend subdomains — GraphRAG, Data
Acquisition, and Data Warehouse — all served by the single
`client/src/modules/data-analysis/` capsule. KGRA Agent is a
separate RTLM and is **not** a Data Analysis subdomain even though
its canonical route `/data-analysis/kgra-agent` lives under the
`/data-analysis/*` URL prefix.

PM Central owns the canonical `/pm/*` surface (Dashboard, Projects,
Tasks, Milestones, Risks, Issues, Decisions, Handoffs, Settings).
Two ownership notes specific to PM Central:

1. **Folder/baseRoute mismatch.** PM Central's storage folder is
   `client/src/modules/pm-central/` but its canonical URL subtree
   is `/pm`. The `check:app-route-ownership` script consults the
   manifest's declared `baseRoute` (rather than the folder name)
   when testing whether App.tsx mounts a canonical route for a
   migrated module. The legacy `/pm-central/*` shell mounts
   (PMCentralShellPage and its 16 sibling panels) are **not** PM
   Central RTLM canonical routes and continue to be mounted
   directly in App.tsx.
2. **PS → PM Central handoff.** Projects System (`ps`) is a
   separate RTLM. PS does not write PM Central data and PM Central
   does not call `trpc.ps.*`. PS → PM Central is a backend handoff
   via `pmCentral.project.receiveFromPS`; no frontend
   reach-around.

## Allowed

| From `client/src/modules/<self>/...` | Example |
|---|---|
| Same-module imports | `./pages/Chat`, `./components/Foo`, `./hooks/useX` |
| Public index of another module | `import { CommunicationRoutes } from "@/modules/communication"` |
| Platform UI primitives | `@/components/ui/Button` |
| Platform helpers | `@/platform/modules/types`, `@/platform/auth` |
| Lib utilities | `@/lib/cn`, `@/lib/api/trpc` (own namespace only) |
| Platform-shared trpc | `trpc.auth.*`, `trpc.system.*`, `trpc.workspaces.*` |
| Own-module trpc | `trpc.<self>.*` |
| Wouter | `Link`, `Route`, `Switch`, `useLocation`, `Redirect` |

## Forbidden

| Pattern | Why |
|---|---|
| `@/modules/<other>/pages/<X>` | Private page reach-around |
| `@/modules/<other>/components/<X>` | Private component reach-around |
| `@/modules/<other>/hooks/<X>` | Private hook reach-around |
| `@/modules/<other>/api/<X>` | Private internal API |
| `../../<other>/pages/<X>` (or any relative climb into another module's `pages`/`components`/`hooks`/`api`) | Same as above, dressed up |
| `import "MainLayout"` from anywhere under `client/src/modules/` | Modules don't own layout |
| `trpc.<otherRtlm>.*` | Cross-module backend reach-around |
| `<a href="/<other-base>/...">` or `navigate("/<other-base>/...")` when the other module's `index.ts` exports a route builder | Use the builder; hardcoded links rot |

## Why these rules

1. **Boundary integrity at runtime.** A capsule that imports another
   module's private code pulls that module's bundle and types into
   its own chunk. This breaks lazy loading and creates invisible
   coupling.

2. **Refactor safety.** A page move inside one module shouldn't
   trigger import-path edits in three other modules. The public
   `index.ts` is the contract.

3. **Backend authorization integrity.** `trpc.<other>.*` skips the
   *other* module's own service-layer authorization. Routing that
   call through `trpc.<self>.*` means `<self>`'s backend can decide
   what to expose, with its own gateway / handoff / event semantics.

4. **Layout cohesion.** When a module imports `MainLayout` it
   double-wraps, breaks `layoutMode: "full-bleed"`, and produces
   hard-to-debug visual regressions. The platform decides where
   `MainLayout` wraps based on each module's `layoutMode`.

## How the rules are enforced

| Rule | Check script |
|---|---|
| Private cross-module imports | `check:module-api-boundaries` |
| Cross-module trpc calls | `check:module-api-boundaries` |
| `MainLayout` imports under modules | `check:app-route-ownership` |
| Hardcoded cross-module links | `check:cross-module-links` |
| App.tsx hardcoding migrated module canonical routes | `check:app-route-ownership` |
| Duplicate canonical ownership | `check:module-routes-conflict` |
| Module registration / bootstrap | `check:module-registration` |
| Capsule completeness for migrated modules | `check:client-capsules` |
| Route inventory consistency | `check:module-route-inventory` |

All seven checks run via `pnpm run check:frontend-modularity`.

## Phase-aware enforcement

The checks are *phase-aware* (`scripts/module-tools/migration-state.ts`):

- For modules in `MIGRATED_MODULES`, every rule is **strict** —
  violations fail the build.
- For unmigrated modules, violations appear in the report as
  **baseline warnings** so we can see drift without blocking
  Phase-0 PRs.

The Communication pilot PR (#59) flipped the rules to strict for
Communication. The Data Analysis migration PR (#60) extended
strict-mode coverage to GraphRAG, Data Acquisition, and Data
Warehouse. The PM Central migration PR set
`MIGRATED_MODULES = ["communication", "dataAnalysis", "pmCentral"]`,
extending strict-mode coverage to PM Central's planning/delivery
surface. KGRA Agent and the remaining 12 RTLMs (Code Studio, PS,
PRM, PSM, HR, OM, Culture Values, AI Types, OpenRouter, Agent
Studio, Sandbox WF, RAG) continue in report-only mode pending
their own migration PRs.

## Backend cross-module communication

For backend cross-module communication, the rules already exist:
**Gateway / Handoff / Event** through `server/platform/...`. A
frontend that tries to dodge those by calling `trpc.<other>.*`
directly is a backend boundary violation in disguise.

If your module needs data from another module:

1. The frontend calls `trpc.<self>.<endpoint>.*`.
2. `<self>`'s backend talks to the other module via:
   - Public API + Gateway (synchronous query)
   - Handoff (work transfer, with receipt)
   - Event (asynchronous notification)
3. `<self>`'s backend returns to the frontend.

Digital HQ / AWI remain *observers* — they audit the wiring; they
do not act as a routing layer.
