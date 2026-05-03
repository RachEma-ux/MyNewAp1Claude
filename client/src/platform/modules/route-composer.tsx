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
import type { ClientModuleManifest, ModuleLayoutMode } from "./types";
import MainLayout from "@/components/MainLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl, isOAuthConfigured } from "@/const";

interface CapsuleEntry {
  manifest: ClientModuleManifest;
  baseRoute: string;
}

interface LegacyRouteEntry {
  manifestKey: string;
  path: string;
  component: NonNullable<ClientModuleManifest["routes"][number]["component"]>;
}

/**
 * Renders a capsule with the same auth gating + chrome the legacy
 * `<ProtectedRoute>` / `<ShellRoute>` helpers in App.tsx apply. Capsule
 * mounts go through `<ModuleRoutes />` directly (not ProtectedRoute), so
 * without this wrapper the platform header/sidebar are missing for any
 * module-owned URL — the manifest's `layoutMode` decides which chrome to
 * apply (default: render under `<MainLayout>`).
 */
function CapsuleHost({
  Capsule,
  layoutMode,
}: {
  Capsule: any;
  layoutMode: ModuleLayoutMode;
}) {
  const { isAuthenticated, loading } = useAuth();
  const wrap = (node: React.ReactNode) =>
    layoutMode === "inside-main-layout" ? <MainLayout>{node}</MainLayout> : <>{node}</>;

  if (!isOAuthConfigured()) {
    return wrap(
      <Suspense fallback={null}>
        <Capsule />
      </Suspense>,
    );
  }
  if (loading) return null;
  if (!isAuthenticated) {
    const loginUrl = getLoginUrl();
    if (loginUrl) window.location.href = loginUrl;
    return null;
  }
  return wrap(
    <Suspense fallback={null}>
      <Capsule />
    </Suspense>,
  );
}

export function ModuleRoutes() {
  const modules = listClientModules();
  const { capsules, legacy } = partitionRoutes(modules);

  return (
    <>
      {capsules.flatMap((c) => {
        const Capsule = c.manifest.capsuleEntrypoint as any;
        const layoutMode: ModuleLayoutMode =
          c.manifest.layoutMode ?? "inside-main-layout";
        // Mount both the bare baseRoute (`/foo`) and a splat
        // (`/foo/*`) so the capsule renders for the root and any
        // descendant. The wildcard `*` matches multi-segment tails
        // (e.g. `/agent-studio/catalog/skills`); using a named param
        // like `:rest*` would only match single-segment tails because
        // regexparam treats the `*` as part of the key name.
        const splatPath =
          c.baseRoute === "/" ? "/*" : `${c.baseRoute}/*`;
        return [
          <Route key={`capsule:${c.manifest.key}:base`} path={c.baseRoute}>
            <CapsuleHost Capsule={Capsule} layoutMode={layoutMode} />
          </Route>,
          <Route key={`capsule:${c.manifest.key}:splat`} path={splatPath}>
            <CapsuleHost Capsule={Capsule} layoutMode={layoutMode} />
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
