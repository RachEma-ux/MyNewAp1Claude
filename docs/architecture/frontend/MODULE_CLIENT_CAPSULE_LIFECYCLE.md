# Module Client Capsule — Lifecycle

What every file inside `client/src/modules/<folder>/` does, when
it is loaded, and what it is allowed to import.

**Migrated modules:** `communication` (pilot, PR #59),
`dataAnalysis` (PR 3, Phase 3.1), and `pmCentral` (PR 4, Phase 3.2).
`MIGRATED_MODULES = ["communication", "dataAnalysis", "pmCentral"]`.

Reference shapes:
- Single-subdomain capsule: `client/src/modules/communication/`
- Multi-subdomain capsule: `client/src/modules/data-analysis/` (3
  subdomains; GraphRAG, Data Acquisition with 10 sub-tabs, Data
  Warehouse)
- Capsule with folder/baseRoute mismatch and compatibility
  redirects: `client/src/modules/pm-central/` (folder `pm-central`,
  baseRoute `/pm`, 9 `/pm-central/rtlm/*` compatibility redirects
  rendered from App.tsx)

The next module to migrate is **Code Studio** (PR 5 / Phase 3.3).

**KGRA Agent note.** KGRA Agent's canonical route
`/data-analysis/kgra-agent` lives under the `/data-analysis/*` URL
prefix but is **not** a Data Analysis subdomain. KGRA is a separate
RTLM with its own client manifest (`client/src/modules/kgra-agent/`).
The Data Analysis capsule's `routeInventory` deliberately excludes
that path, and `App.tsx` continues to mount it directly so it is
matched before the Data Analysis capsule's `/data-analysis/:rest*`
splat. KGRA will get its own capsule (or its own baseRoute) in a
later PR. `check:app-route-ownership` understands cross-manifest
ownership and does not flag App.tsx's KGRA mount as a Data Analysis
violation.

**PM Central legacy shell note.** The 22-route legacy
`/pm-central/*` shell (PMCentralShellPage, ProjectPage, panels,
wizards, methodes, idea-builder, etc.) is **not** the PM Central
RTLM canonical surface. Those routes continue to be mounted
directly in App.tsx and serve a different shell experience. The
PM Central RTLM canonical surface lives at `/pm/*`.
`check:app-route-ownership` uses the manifest's declared
`baseRoute` (`/pm`) — not the folder name (`pm-central`) — for its
canonical-prefix test, so the legacy `/pm-central/*` mounts are
not flagged as `pmCentral` canonical violations. A future PR may
choose to migrate the legacy shell into a separate capsule (or
sunset it).

## Files at a glance

```
client/src/modules/<folder>/
  client.ts        — bootstrap entrypoint (registers manifest)
  manifest.ts      — public client metadata for the platform
  mod.tsx          — capsule entrypoint; owns internal routing
  routes.tsx       — internal route table (path patterns + components)
  nav.ts           — sidebar / nav links for this module
  index.ts         — public contract for OTHER modules to import
  pages/           — page components (private to the module)
  components/      — shared components (private to the module)
  hooks/           — module-specific hooks (private)
  types.ts         — public types (re-exported from index.ts)
```

## Loading order

1. **`client/src/modules/index.ts`** imports each `client.ts`.
2. **`client.ts`** imports its `manifest.ts` and calls
   `registerClientModule(manifest)`. This runs once at app bootstrap.
3. **`<ModuleRoutes />`** (in `client/src/platform/modules/route-composer.tsx`)
   reads the registry and emits a `<Route>` per registered manifest:
   - For capsule manifests (`baseRoute` + `capsuleEntrypoint`):
     two routes — bare `<baseRoute>` and `<baseRoute>/:rest*` —
     both rendering `<CapsuleEntrypoint />`.
   - For legacy manifests (`routes: [...]`): one `<Route>` per entry.
4. **`mod.tsx`** is the capsule entrypoint. It mounts a wouter
   `<Switch>` over the entries in `routes.tsx` and renders the
   matched page.
5. **`routes.tsx`** declares the internal route patterns. Patterns
   match the manifest's `routeInventory`.
6. **`nav.ts`** is consumed by the platform's nav composer (sidebar,
   command palette) — pure data, no JSX.
7. **`index.ts`** is the only file other modules may import. It
   exports route builders (`<Module>Routes.foo()`) and public types.

## Allowed imports per file

| File | May import |
|---|---|
| `client.ts` | `@/platform/modules/registry`, this folder |
| `manifest.ts` | `@/platform/modules/types`, this folder |
| `mod.tsx` | `wouter`, `@/components/ui/*`, `@/platform/*`, `@/lib/*`, this folder |
| `routes.tsx` | `react`, `wouter`, this folder |
| `nav.ts` | `@/platform/modules/types`, this folder |
| `index.ts` | this folder |
| `pages/`, `components/`, `hooks/` | this folder, `@/components/ui/*`, `@/platform/*`, `@/lib/*`, `@/api/trpc` (own namespace only) |
| `types.ts` | none beyond `@/lib/*` |

**Forbidden everywhere inside the module:**
- `@/modules/<other>/pages/...`, `/components/...`, `/hooks/...`,
  `/api/...` — reach into another module's privates
- `MainLayout` from `@/components/MainLayout` — modules don't own layout
- `trpc.<otherRtlm>.*` — cross-module backend reach-around
- `@/pages/<folder>/...` for the *same* folder once the module has
  internalized them (during migration this is loose; in strict mode
  it is a hard fail)

## `manifest.ts` shape (capsule mode)

```ts
export const communicationClientManifest: ClientModuleManifest = {
  key: "communication",
  name: "Communication",
  baseRoute: "/communication",
  capsuleEntrypoint: lazy(() => import("./mod")),
  layoutMode: "inside-main-layout",
  routeInventory: [
    "/communication",
    "/communication/chat",
    "/communication/conversations",
    "/communication/video-meeting",
    "/communication/notifications",
  ],
  compatibilityRoutes: [
    { from: "/chat", to: "/communication/chat", reason: "legacy deep link" },
  ],
  deprecatedRoutes: [],
  requiredPermissions: ["communication.read"],
  routes: [], // legacy field — empty for capsule modules
};
```

## `mod.tsx` shape (capsule entrypoint)

```tsx
import { Suspense } from "react";
import { Route, Switch } from "wouter";
import { communicationRoutes } from "./routes";
import { CommunicationShell } from "./components/CommunicationShell";

export default function CommunicationCapsule() {
  return (
    <CommunicationShell>
      <Suspense fallback={null}>
        <Switch>
          {communicationRoutes.map((r) => (
            <Route key={r.path} path={r.path} component={r.component} />
          ))}
          <Route><div>Not found</div></Route>
        </Switch>
      </Suspense>
    </CommunicationShell>
  );
}
```

`mod.tsx` may NOT import `MainLayout`. If a module needs full-bleed
or embedded layout, it sets `layoutMode` + `layoutReason` in the
manifest; the platform decides whether to wrap.

## `routes.tsx` shape

```tsx
import { lazy } from "react";
const ChatPage = lazy(() => import("./pages/ChatPage"));
const ConversationsPage = lazy(() => import("./pages/ConversationsPage"));

export const communicationRoutes = [
  { path: "/communication", component: ChatPage },
  { path: "/communication/chat", component: ChatPage },
  { path: "/communication/conversations", component: ConversationsPage },
  { path: "/communication/video-meeting/:roomId?", component: ChatPage },
];
```

## `index.ts` shape — public contract

```ts
export type { CommunicationMessage, ConversationSummary } from "./types";

export const CommunicationRoutes = {
  dashboard: () => "/communication",
  chat: (id?: string) => id ? `/communication/chat/${id}` : "/communication/chat",
  conversations: () => "/communication/conversations",
  videoMeeting: (roomId?: string) =>
    roomId ? `/communication/video-meeting/${roomId}` : "/communication/video-meeting",
  notifications: () => "/communication/notifications",
};
```

**Forbidden in `index.ts`:**
- exporting `communicationRouter`, service functions, private hooks,
  pages, or components

## Layout modes

| Mode | When to use | Required field |
|---|---|---|
| `inside-main-layout` | Default. Renders inside `<MainLayout>`. | — |
| `full-bleed` | Module owns the entire viewport (Workspace shell, Code Studio editor surface). | `layoutReason` |
| `embedded` | Capsule is rendered inside another panel; no chrome. | `layoutReason` |

## Compatibility window

Migrating a module is a single PR per module (see the roadmap).
During the migration:

- `App.tsx` continues to render compatibility redirects for any
  pre-migration deep links (e.g. `/chat → /communication/chat`).
- The capsule mounts the canonical paths via `<ModuleRoutes />`.
- Wouter's `<Switch>` resolves the first matching `<Route>`, so
  `App.tsx` redirects fire before the module sees the legacy path.
- Once the legacy URL is no longer in production, the redirect can
  be removed (a follow-up cleanup PR).

## What the platform owns

- `<MainLayout>` — visual chrome.
- `<Switch>` ordering at the top level (`App.tsx`).
- The nav composer (`nav-composer.ts`) — reads each module's nav.
- The route composer (`route-composer.tsx`) — emits `<Route>` per
  registered manifest.
- AWI route-source classification (`server/platform/wiring/...`).

## What modules own

- Their canonical URL subtree (`baseRoute`).
- Their pages, components, hooks, types.
- Their own internal `<Switch>` (in `mod.tsx`).
- Public route builders (`<Module>Routes.foo()` from `index.ts`).
