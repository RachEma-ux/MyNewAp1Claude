/**
 * Route Inventory.
 *
 * Builds a single denormalized table of every URL path the app knows
 * about, by combining:
 *
 *   - App.tsx `<Route path="...">` declarations
 *   - App.tsx `<Redirect to="...">` declarations (and the `from` route
 *     they sit inside)
 *   - module manifest `routes: [{ path }]`
 *   - module manifest `routeInventory: ["/...", ...]`
 *   - module manifest `compatibilityRoutes: [{ from, to }]`
 *   - module manifest `deprecatedRoutes: [...]`
 *   - module `nav.ts` href strings
 *
 * The result drives:
 *   - the route ownership map generator
 *   - check:module-routes-conflict (duplicate-path detection)
 *   - check:cross-module-links (link → declared-route resolution)
 *   - check:module-route-inventory (nav-link / inventory drift)
 *   - check:app-route-ownership (which prefixes App.tsx still owns)
 */

import { readFileSync } from "fs";
import { join } from "path";

import { readAllManifests, type ManifestSnapshot } from "./manifest-reader";
import {
  classifyRouteForAwi,
  folderToRtlmKey,
  isPlatformCorePath,
  type RouteSource,
} from "./route-source";
import {
  PLATFORM_CORE_PREFIXES,
  RTLM_FOLDER_MAP,
  type RtlmKey,
} from "./migration-state";
import { isBaseRouteMatch, normalizePath } from "./route-parser";

export interface AppRouteDecl {
  path: string;
  /** Best-effort component target (lazy import name or page name). */
  component: string | null;
  /** When the Route body contains `<Redirect to="...">`, that target. */
  redirectTo: string | null;
}

export interface RouteRow {
  path: string;
  source: RouteSource;
  /** RTLM key, "platform-core", or null for unknown / unowned. */
  owner: RtlmKey | "platform-core" | null;
  /** Component / target string for the human-readable map. */
  target: string | null;
  /** "canonical" | "compatibility-redirect" | "deprecated" | "platform-core" | "orphan" | "unknown" */
  status: RouteStatus;
  notes: string[];
}

export type RouteStatus =
  | "canonical"
  | "compatibility-redirect"
  | "deprecated"
  | "platform-core"
  | "orphan"
  | "unknown";

export interface RouteInventory {
  rows: RouteRow[];
  manifests: ManifestSnapshot[];
  appRoutes: AppRouteDecl[];
  /** Map of `from` path → canonical `to` path for App.tsx redirects. */
  appRedirects: Map<string, string>;
  /** Per-RTLM count of declared paths (manifest + routeInventory + nav). */
  perModulePathCount: Map<RtlmKey, number>;
}

/* ------------------------------------------------------------------ */
/*  Builder                                                            */
/* ------------------------------------------------------------------ */

export function buildRouteInventory(repoRoot: string): RouteInventory {
  const manifests = readAllManifests(repoRoot);
  const appPath = join(repoRoot, "client", "src", "App.tsx");
  const appSrc = readFileSync(appPath, "utf8");
  const appRoutes = extractAppRoutes(appSrc);
  const appRedirects = new Map<string, string>();
  for (const r of appRoutes) {
    if (r.redirectTo) appRedirects.set(normalizePath(r.path), normalizePath(r.redirectTo));
  }

  // Per-module sets used by the resolver.
  const manifestPaths = new Set<string>();
  const modRoutePaths = new Set<string>();
  const navOnlyPaths = new Set<string>();
  const deprecatedPaths = new Set<string>();
  const compatFromPaths = new Set<string>();

  for (const m of manifests) {
    for (const r of m.routes) manifestPaths.add(normalizePath(r.path));
    for (const p of m.routeInventory) manifestPaths.add(normalizePath(p));
    for (const p of m.routesFileEntries) modRoutePaths.add(normalizePath(p));
    for (const p of m.navHrefs) {
      const np = normalizePath(p);
      if (!manifestPaths.has(np) && !modRoutePaths.has(np)) navOnlyPaths.add(np);
    }
    for (const p of m.deprecatedRoutes) deprecatedPaths.add(normalizePath(p));
    for (const c of m.compatibilityRoutes) compatFromPaths.add(normalizePath(c.from));
  }

  // App.tsx redirect `from` paths also count as compatibility-redirect.
  for (const fromPath of appRedirects.keys()) compatFromPaths.add(fromPath);

  // Collect every path we've seen, regardless of source.
  const allPaths = new Set<string>();
  for (const r of appRoutes) allPaths.add(normalizePath(r.path));
  for (const p of manifestPaths) allPaths.add(p);
  for (const p of modRoutePaths) allPaths.add(p);
  for (const p of navOnlyPaths) allPaths.add(p);
  for (const p of deprecatedPaths) allPaths.add(p);

  // Collect every module's baseRoute (legacy fallback uses common prefix).
  const moduleBaseRoutes = collectBaseRoutes(manifests);

  const rows: RouteRow[] = [];
  for (const path of allPaths) {
    rows.push(
      buildRow(path, {
        manifestPaths,
        modRoutePaths,
        navOnlyPaths,
        deprecatedPaths,
        compatFromPaths,
        appRedirects,
        appRoutes,
        manifests,
        moduleBaseRoutes,
      }),
    );
  }

  rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const perModulePathCount = new Map<RtlmKey, number>();
  for (const m of manifests) {
    if (!m.key) continue;
    const k = m.key as RtlmKey;
    const declared =
      m.routes.length + m.routeInventory.length + m.navHrefs.length;
    perModulePathCount.set(k, declared);
  }

  return { rows, manifests, appRoutes, appRedirects, perModulePathCount };
}

interface RowCtx {
  manifestPaths: Set<string>;
  modRoutePaths: Set<string>;
  navOnlyPaths: Set<string>;
  deprecatedPaths: Set<string>;
  compatFromPaths: Set<string>;
  appRedirects: Map<string, string>;
  appRoutes: AppRouteDecl[];
  manifests: ManifestSnapshot[];
  moduleBaseRoutes: Map<string, RtlmKey>;
}

function buildRow(rawPath: string, ctx: RowCtx): RouteRow {
  const path = normalizePath(rawPath);
  const source = classifyRouteForAwi(path, {
    manifestPaths: ctx.manifestPaths,
    modRoutePaths: ctx.modRoutePaths,
    navOnlyPaths: ctx.navOnlyPaths,
    deprecatedPaths: ctx.deprecatedPaths,
    appRedirectFromPaths: ctx.compatFromPaths,
  });

  let owner: RouteRow["owner"] = null;
  if (source === "app-platform-core") owner = "platform-core";
  else owner = ownerFromBase(path, ctx.moduleBaseRoutes);

  let target: string | null = null;
  let notes: string[] = [];
  let status: RouteStatus;

  switch (source) {
    case "app-platform-core":
      status = "platform-core";
      target = appComponentFor(path, ctx.appRoutes);
      break;
    case "app-compatibility-redirect": {
      status = "compatibility-redirect";
      const target1 = ctx.appRedirects.get(path);
      target = target1 ?? compatTargetForManifest(path, ctx.manifests);
      if (target) notes.push(`redirects to ${target}`);
      break;
    }
    case "module-manifest":
      status = "canonical";
      target = appComponentFor(path, ctx.appRoutes) ?? `module:${owner ?? "?"}`;
      break;
    case "module-mod-route":
      status = "canonical";
      target = `mod.tsx:${owner ?? "?"}`;
      break;
    case "module-nav":
      status = "orphan";
      notes.push("nav points to a path no manifest declares");
      break;
    case "deprecated":
      status = "deprecated";
      notes.push("declared deprecated");
      break;
    case "unknown":
    default:
      status = "unknown";
      break;
  }

  return { path, source, owner, target, status, notes };
}

function ownerFromBase(
  path: string,
  bases: Map<string, RtlmKey>,
): RtlmKey | null {
  const sorted = Array.from(bases.keys()).sort((a, b) => b.length - a.length);
  for (const base of sorted) {
    if (isBaseRouteMatch(base, path)) return bases.get(base)!;
  }
  return null;
}

function compatTargetForManifest(
  path: string,
  manifests: ManifestSnapshot[],
): string | null {
  for (const m of manifests) {
    for (const c of m.compatibilityRoutes) {
      if (normalizePath(c.from) === path) return c.to;
    }
  }
  return null;
}

function appComponentFor(path: string, routes: AppRouteDecl[]): string | null {
  for (const r of routes) {
    if (normalizePath(r.path) === path) return r.component ?? null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  App.tsx parsing                                                    */
/* ------------------------------------------------------------------ */

/**
 * Pull `<Route path="..." component={...} />` declarations out of
 * App.tsx. The codebase's convention is one `<Route>` per line; we
 * walk lines instead of trying to write a JSX-aware regex (those
 * fall over because the body of `component={() => <ProtectedRoute />}`
 * contains its own `>` chars).
 *
 * Multi-line `<Route> ... </Route>` blocks (e.g. those wrapping a
 * `<Redirect>`) are handled by also looking at the small window
 * after each opening line for a `<Redirect to=...>`.
 */
export function extractAppRoutes(src: string): AppRouteDecl[] {
  const out: AppRouteDecl[] = [];
  const lines = src.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.indexOf("<Route");
    if (idx < 0) continue;
    // Skip ModuleRoutes / ProtectedRoute / NotFound-only lines.
    if (/<Route(Provider|Match|Group)\b/.test(line)) continue;

    const pathMatch = /\bpath\s*=\s*["'`]([^"'`]+)["'`]/.exec(line);
    if (!pathMatch) continue;
    const path = pathMatch[1];

    // Component target — look on this line and the next two for the
    // first identifier inside `component={...}` or `<X />` inside the
    // route body.
    const window = [line, lines[i + 1] ?? "", lines[i + 2] ?? ""].join(" ");
    let component: string | null = null;
    const componentMatch =
      /component=\{[^}]*?component=\{([A-Za-z_$][\w$]*)/.exec(window) ??
      /component=\{([A-Za-z_$][\w$]*)\s*\}/.exec(window) ??
      /component=\{[^}]*?<([A-Za-z_$][\w$]*)/.exec(window);
    if (componentMatch) component = componentMatch[1];

    const redirectMatch = /<Redirect[^>]*?\bto\s*=\s*["'`]([^"'`]+)["'`]/.exec(
      window,
    );
    const redirectTo = redirectMatch?.[1] ?? null;

    out.push({ path, component, redirectTo });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build a base-route → RTLM key map. Prefers the manifest's explicit
 * `baseRoute` field; falls back to the longest common path prefix of
 * the module's declared `routes`.
 */
export function collectBaseRoutes(
  manifests: ManifestSnapshot[],
): Map<string, RtlmKey> {
  const reverse = folderToRtlmKey();
  const out = new Map<string, RtlmKey>();
  for (const m of manifests) {
    const key = (m.key as RtlmKey | null) ?? reverse.get(m.folder) ?? null;
    if (!key) continue;
    if (m.baseRoute) {
      out.set(normalizePath(m.baseRoute), key);
      continue;
    }
    // Heuristic for legacy modules: use the shortest declared path
    // ignoring dynamic segments. e.g. /agent-studio (over /agent-studio/templates).
    const literalPaths = m.routes
      .map((r) => normalizePath(r.path))
      .filter((p) => !p.includes(":") && !p.includes("*"));
    if (literalPaths.length === 0) continue;
    literalPaths.sort((a, b) => a.length - b.length);
    out.set(literalPaths[0], key);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Convenience exports                                                */
/* ------------------------------------------------------------------ */

export { isPlatformCorePath, PLATFORM_CORE_PREFIXES };
