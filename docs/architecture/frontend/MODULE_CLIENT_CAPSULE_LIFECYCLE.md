# Module Client Capsule — Lifecycle

What every file inside `client/src/modules/<folder>/` does, when
it is loaded, and what it is allowed to import.

**Pilot module: `communication`.** Communication is the first RTLM
to fully implement the capsule pattern (`MIGRATED_MODULES = ["communication"]`).
Use `client/src/modules/communication/` as the reference shape when
migrating subsequent modules. The next module to migrate is
**Data Analysis** (PR 3 / Phase 3.1).

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
