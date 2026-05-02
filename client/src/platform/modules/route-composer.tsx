/**
 * Route Composer — composes wouter routes from registered client manifests.
 *
 * Two coexisting modes (during the Module Client Capsule migration):
 *
 *   1. Capsule mode (Phase-1+):
 *      A manifest with `baseRoute` + `capsuleEntrypoint` mounts the
 *      capsule under `<Route path="<baseRoute>/:rest*">`. The
 *      capsule's own `routes.tsx` / mod.tsx handles internal routing.
 *
 *   2. Legacy mode (today, every module):
 *      A manifest with the existing `routes: [{ path, component }]`
 *      list — each path becomes a `<Route>`. Unchanged behavior so
 *      no module breaks during the migration window.
 *
 * Determinism guarantees:
 *
 *   - Capsule mounts are emitted *before* legacy per-route mounts,
 *     and sorted longest-baseRoute-first. That means
 *     `/data-analysis/data-acquisition` always wins over
 *     `/data-analysis`, and `/ps` never steals `/psm` because the
 *     route is mounted using a path with the explicit `/:rest*`
 *     splat — wouter's matcher honors segment boundaries, so
 *     `/ps/...` and `/psm/...` are independent regardless of order.
 *
 *   - Tiebreaker: lexical, so two equal-length baseRoutes always
 *     resolve in the same order across renders.
 *
 * Usage in App.tsx:
 *
 *   import { ModuleRoutes } from "@/platform/modules/route-composer";
 *   ...
 *   <Switch>
 *     {platformCoreRoutes}
 *     <ModuleRoutes />
 *     <Route><NotFound /></Route>
 *   </Switch>
 *
 * App.tsx remains the canonical owner of platform-core routes and
 * compatibility redirects. The composer is intentionally *additive*
 * — removing a manifest's routes does not silently break anything.
 */

import { Suspense } from "react";
import { Route } from "wouter";
import { listClientModules } from "./registry";
import type { ClientModuleManifest } from "./types";

interface CapsuleEntry {
  manifest: ClientModuleManifest;
  baseRoute: string;
}

interface LegacyRouteEntry {
  manifestKey: string;
  path: string;
  component: NonNullable<ClientModuleManifest["routes"][number]["component"]>;
}

export function ModuleRoutes() {
  const modules = listClientModules();
  const { capsules, legacy } = partitionRoutes(modules);

  return (
    <>
      {capsules.flatMap((c) => {
        const Capsule = c.manifest.capsuleEntrypoint as any;
        // Mount both the bare baseRoute (`/foo`) and a splat
        // (`/foo/:rest*`) so the capsule renders for the root and any
        // descendant. Wouter's <Switch> picks the first match; the
        // bare entry is emitted first so `useLocation()` inside the
        // capsule sees the exact URL.
        const splatPath =
          c.baseRoute === "/" ? "/:rest*" : `${c.baseRoute}/:rest*`;
        return [
          <Route key={`capsule:${c.manifest.key}:base`} path={c.baseRoute}>
            <Suspense fallback={null}>
              <Capsule />
            </Suspense>
          </Route>,
          <Route key={`capsule:${c.manifest.key}:splat`} path={splatPath}>
            <Suspense fallback={null}>
              <Capsule />
            </Suspense>
          </Route>,
        ];
      })}

      {legacy.map((r) => {
        const Component = r.component as any;
        return (
          <Route key={`${r.manifestKey}:${r.path}`} path={r.path}>
            <Suspense fallback={null}>
              <Component />
            </Suspense>
          </Route>
        );
      })}
    </>
  );
}

/**
 * Split registered manifests into capsule vs legacy mounts. Exposed
 * for tests so the matcher logic can be exercised without rendering.
 */
export function partitionRoutes(manifests: ClientModuleManifest[]): {
  capsules: CapsuleEntry[];
  legacy: LegacyRouteEntry[];
} {
  const capsules: CapsuleEntry[] = [];
  const legacy: LegacyRouteEntry[] = [];

  for (const m of manifests) {
    if (m.baseRoute && m.capsuleEntrypoint) {
      capsules.push({
        manifest: m,
        baseRoute: normalizeBaseRoute(m.baseRoute),
      });
      // A capsule may still declare individual `routes[]` for back-
      // compat with hard-coded App.tsx mounts; the composer ignores
      // them — App.tsx still owns those during the migration window.
      continue;
    }
    for (const r of m.routes) {
      legacy.push({ manifestKey: m.key, path: r.path, component: r.component });
    }
  }

  capsules.sort((a, b) => compareBaseRoute(a.baseRoute, b.baseRoute));

  return { capsules, legacy };
}

/**
 * Sort comparator: longer baseRoutes first; lexical tiebreak.
 *
 * Wouter's `<Switch>` picks the first matching `<Route>` so the
 * composer must emit `/data-analysis/data-acquisition` before
 * `/data-analysis`.
 */
export function compareBaseRoute(a: string, b: string): number {
  const na = normalizeBaseRoute(a);
  const nb = normalizeBaseRoute(b);
  if (na.length !== nb.length) return nb.length - na.length;
  return na < nb ? -1 : na > nb ? 1 : 0;
}

function normalizeBaseRoute(p: string): string {
  if (!p) return "/";
  let q = p.startsWith("/") ? p : "/" + p;
  q = q.replace(/\/{2,}/g, "/");
  if (q.length > 1 && q.endsWith("/")) q = q.slice(0, -1);
  return q;
}
