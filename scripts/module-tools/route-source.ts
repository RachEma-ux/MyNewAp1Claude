/**
 * Route Source resolver.
 *
 * Every URL path served by the app comes from exactly one of seven
 * places. Knowing the source for a given route lets the route
 * ownership map, AWI, and the frontend modularity checks classify a
 * route correctly without each consumer reinventing the rules.
 *
 *   app-platform-core
 *     A `<Route>` mounted directly in `client/src/App.tsx` whose path
 *     belongs to the platform-core list (auth/system/governance/hq/
 *     workspaces/...). These are intentional, central concerns.
 *
 *   app-compatibility-redirect
 *     A `<Route>` mounted in `App.tsx` that renders `<Redirect>` to a
 *     canonical module-owned path. Used to keep legacy deep links
 *     working after a route moved into a module capsule.
 *
 *   module-manifest
 *     A `path` declared in a registered `ClientModuleManifest.routes`
 *     entry. Mounted at runtime by `<ModuleRoutes />`.
 *
 *   module-mod-route
 *     A path defined inside a module's `mod.tsx` / `routes.tsx` that
 *     is not also listed in the manifest. Reachable because the
 *     manifest's `capsuleEntrypoint` swallows the whole `baseRoute`
 *     subtree.
 *
 *   module-nav
 *     A path that appears only in a module's nav file (sidebar / nav
 *     entry) without a matching route. This is almost always a
 *     misconfiguration — surfaced by check:module-route-inventory.
 *
 *   deprecated
 *     A path explicitly listed in `manifest.deprecatedRoutes` — used
 *     by the migration generator to mark routes that should disappear
 *     after a migration window.
 *
 *   unknown
 *     A path that the scanner found referenced but cannot map to any
 *     of the above. The presence of `unknown` rows is itself the
 *     signal that the ownership map needs human attention.
 */

import {
  PLATFORM_CORE_PREFIXES,
  RTLM_FOLDER_MAP,
  type RtlmKey,
} from "./migration-state";
import { isBaseRouteMatch, normalizePath } from "./route-parser";

export type RouteSource =
  | "app-platform-core"
  | "app-compatibility-redirect"
  | "module-manifest"
  | "module-mod-route"
  | "module-nav"
  | "deprecated"
  | "unknown";

export interface RouteOwnership {
  path: string;
  source: RouteSource;
  /** RTLM key when the route is owned by a module; `null` for platform-core/unknown. */
  owner: RtlmKey | "platform-core" | null;
  /** Free-form note used by the generator (e.g. redirect target). */
  notes?: string;
}

/**
 * Lightweight inputs the resolver needs. Generators populate these
 * from manifest scans + App.tsx parsing.
 */
export interface RouteResolutionContext {
  /** Map of `baseRoute` → RTLM key for every registered module. */
  moduleBaseRoutes: Map<string, RtlmKey>;
  /** Set of paths the manifest scanner saw declared in `routes[].path`. */
  manifestRoutePaths: Set<string>;
  /** Set of paths that mod.tsx-style internal routes declare. */
  modRoutePaths: Set<string>;
  /** Set of nav-only paths (no route declared). */
  navOnlyPaths: Set<string>;
  /** Paths the App.tsx parser saw declared as `<Redirect to=...>`. */
  appRedirectFromPaths: Set<string>;
  /** Set of deprecated paths from `manifest.deprecatedRoutes`. */
  deprecatedPaths: Set<string>;
}

/**
 * Resolve a single path to its `RouteSource` and probable owner.
 * Order of checks matters — explicit declarations beat implicit
 * subtree ownership.
 */
export function resolveRouteSource(
  rawPath: string,
  ctx: RouteResolutionContext,
): RouteOwnership {
  const path = normalizePath(rawPath);

  if (ctx.deprecatedPaths.has(path)) {
    return { path, source: "deprecated", owner: ownerFromBase(path, ctx) };
  }

  // Platform-core wins over module subtree matching: if a route lives
  // under `/governance` it is platform-core even if a stray module
  // happened to declare a `/governance` baseRoute.
  if (isPlatformCorePath(path)) {
    return { path, source: "app-platform-core", owner: "platform-core" };
  }

  if (ctx.appRedirectFromPaths.has(path)) {
    return {
      path,
      source: "app-compatibility-redirect",
      owner: ownerFromBase(path, ctx),
    };
  }

  if (ctx.manifestRoutePaths.has(path)) {
    return { path, source: "module-manifest", owner: ownerFromBase(path, ctx) };
  }

  if (ctx.modRoutePaths.has(path)) {
    return {
      path,
      source: "module-mod-route",
      owner: ownerFromBase(path, ctx),
    };
  }

  if (ctx.navOnlyPaths.has(path)) {
    return { path, source: "module-nav", owner: ownerFromBase(path, ctx) };
  }

  // Last resort: subtree-owned by a module via baseRoute, but not
  // explicitly declared anywhere. Mark unknown so the generator
  // surfaces it for human review.
  const owner = ownerFromBase(path, ctx);
  if (owner) {
    return {
      path,
      source: "unknown",
      owner,
      notes: "covered by baseRoute but no declaration found",
    };
  }
  return { path, source: "unknown", owner: null };
}

/**
 * Identify the first matching RTLM owner via baseRoute. Returns
 * `null` when no module claims the path's prefix.
 */
function ownerFromBase(
  path: string,
  ctx: RouteResolutionContext,
): RtlmKey | null {
  // Iterate longest-first so /data-analysis/data-acquisition wins over
  // /data-analysis when both are registered.
  const bases = Array.from(ctx.moduleBaseRoutes.keys()).sort(
    (a, b) => b.length - a.length,
  );
  for (const base of bases) {
    if (isBaseRouteMatch(base, path)) {
      return ctx.moduleBaseRoutes.get(base) ?? null;
    }
  }
  return null;
}

/**
 * `true` iff the path begins with one of the platform-core prefixes
 * (`/auth`, `/system`, `/hq`, etc.). The bare prefix itself counts —
 * `/governance` and `/governance/overview` both resolve to platform-
 * core.
 */
export function isPlatformCorePath(rawPath: string): boolean {
  const path = normalizePath(rawPath);
  for (const prefix of PLATFORM_CORE_PREFIXES) {
    if (isBaseRouteMatch(prefix, path)) return true;
  }
  return false;
}

/**
 * Convenience wrapper used by the AWI integration: derive the source
 * field for a single (path, manifest-paths, mod-paths) tuple. The
 * AWI builder doesn't need the full context map; this lets it reuse
 * the same classification logic.
 */
export function classifyRouteForAwi(
  path: string,
  args: {
    manifestPaths: Set<string>;
    modRoutePaths: Set<string>;
    navOnlyPaths: Set<string>;
    deprecatedPaths: Set<string>;
    appRedirectFromPaths: Set<string>;
  },
): RouteSource {
  if (args.deprecatedPaths.has(path)) return "deprecated";
  if (isPlatformCorePath(path)) return "app-platform-core";
  if (args.appRedirectFromPaths.has(path)) return "app-compatibility-redirect";
  if (args.manifestPaths.has(path)) return "module-manifest";
  if (args.modRoutePaths.has(path)) return "module-mod-route";
  if (args.navOnlyPaths.has(path)) return "module-nav";
  return "unknown";
}

/**
 * Build a folder→key reverse lookup from `RTLM_FOLDER_MAP` so
 * scanners that walk `client/src/modules/<folder>/...` can resolve
 * back to the canonical RTLM key.
 */
export function folderToRtlmKey(): Map<string, RtlmKey> {
  const out = new Map<string, RtlmKey>();
  for (const [key, folder] of Object.entries(RTLM_FOLDER_MAP)) {
    out.set(folder, key as RtlmKey);
  }
  return out;
}
