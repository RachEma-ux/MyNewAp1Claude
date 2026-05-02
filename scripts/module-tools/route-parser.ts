/**
 * Wouter-compatible route parser.
 *
 * Wouter's path syntax (the project uses Wouter, not React Router v6):
 *   /foo/:id          required parameter
 *   /foo/:id?         optional parameter
 *   /foo/:rest*       splat (zero or more segments captured as one)
 *   /foo/*            anonymous splat
 *
 * This module exposes:
 *   normalizePath(path)
 *   isBaseRouteMatch(baseRoute, pathname)
 *   routePatternMatches(pattern, candidate)
 *   compareBaseRoutePriority(a, b)   — sort comparator, longest first
 *
 * It does NOT depend on `wouter` at runtime so it can be used from
 * Node-side scripts (`tsx scripts/...`) without pulling in the
 * client bundle.
 *
 * The matching rules below are deliberately strict:
 *   /ps must NOT match /psm/foo
 *   /pm must NOT match /pm-central/foo
 *   /data-analysis must match /data-analysis and /data-analysis/sub
 * because the route composer relies on `isBaseRouteMatch` to pick the
 * right capsule when several modules declare overlapping prefixes.
 */

/**
 * Trim duplicate slashes, drop a trailing `/` (except for root `/`)
 * and collapse the result. Idempotent.
 */
export function normalizePath(path: string): string {
  if (!path) return "/";
  let p = path.trim();
  if (!p.startsWith("/")) p = "/" + p;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/**
 * `true` iff `pathname` lives under `baseRoute`. The match is by
 * route-segment boundary, NOT by raw string prefix:
 *
 *   isBaseRouteMatch("/ps", "/ps")           === true
 *   isBaseRouteMatch("/ps", "/ps/")          === true
 *   isBaseRouteMatch("/ps", "/ps/foo")       === true
 *   isBaseRouteMatch("/ps", "/psm")          === false   ← key invariant
 *   isBaseRouteMatch("/ps", "/psm/foo")      === false
 *   isBaseRouteMatch("/pm", "/pm-central")   === false
 *   isBaseRouteMatch("/", "/anything")       === true    ← root catch-all
 */
export function isBaseRouteMatch(baseRoute: string, pathname: string): boolean {
  const base = normalizePath(baseRoute);
  const path = normalizePath(pathname);
  if (base === "/") return true;
  if (path === base) return true;
  return path.startsWith(base + "/");
}

/**
 * Compile a Wouter-flavored pattern into a regex. Public for tests
 * and also for `routePatternMatches` below. The result is anchored on
 * both sides so partial matches don't accidentally succeed.
 *
 * Ignores trailing-slash differences (handled by `normalizePath`).
 */
export function patternToRegex(pattern: string): RegExp {
  const norm = normalizePath(pattern);
  // Each path segment becomes one regex group. We split on `/` so
  // segment-level tokens like `:id?` and `:rest*` keep their meaning.
  const segments = norm.split("/").slice(1); // drop leading ""
  const parts: string[] = [];
  for (const seg of segments) {
    if (seg === "") continue;
    if (seg === "*") {
      // Anonymous splat — matches zero or more remaining segments.
      parts.push("(?:/.*)?");
      continue;
    }
    if (/^:[A-Za-z_][A-Za-z0-9_]*\*$/.test(seg)) {
      // Named splat: capture zero or more segments.
      parts.push("(?:/.*)?");
      continue;
    }
    if (/^:[A-Za-z_][A-Za-z0-9_]*\?$/.test(seg)) {
      // Optional parameter.
      parts.push("(?:/[^/]+)?");
      continue;
    }
    if (/^:[A-Za-z_][A-Za-z0-9_]*$/.test(seg)) {
      // Required parameter.
      parts.push("/[^/]+");
      continue;
    }
    // Literal segment — escape regex metachars.
    parts.push("/" + seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  }
  const body = parts.join("");
  return new RegExp("^" + (body || "/") + "/?$");
}

/**
 * `true` iff the candidate URL path matches the route pattern.
 *
 * Used by:
 *   - check:module-route-inventory  — verify nav links resolve to a
 *     declared route pattern.
 *   - tests around dynamic routes (e.g. `/agent-studio/:agentId`).
 */
export function routePatternMatches(pattern: string, candidate: string): boolean {
  const re = patternToRegex(pattern);
  return re.test(normalizePath(candidate));
}

/**
 * Comparator that sorts longer / more-specific base routes first.
 * Used by `ModuleRoutes` so `/data-analysis/data-acquisition` is
 * tried before `/data-analysis`, regardless of registration order.
 *
 * Tiebreaker: lexical, so the order is stable across runs.
 */
export function compareBaseRoutePriority(a: string, b: string): number {
  const na = normalizePath(a);
  const nb = normalizePath(b);
  if (na.length !== nb.length) return nb.length - na.length;
  return na < nb ? -1 : na > nb ? 1 : 0;
}

/**
 * Return all base routes from `routes`, sorted longest-first. Helper
 * for the route composer.
 */
export function sortBaseRoutes<T extends { baseRoute: string }>(routes: T[]): T[] {
  return [...routes].sort((a, b) =>
    compareBaseRoutePriority(a.baseRoute, b.baseRoute),
  );
}
