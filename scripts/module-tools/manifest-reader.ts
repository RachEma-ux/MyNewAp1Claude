/**
 * Manifest Reader.
 *
 * Reads `client/src/modules/<folder>/manifest.ts` source text (NOT
 * the compiled module — these scripts run before the bundler) and
 * extracts the fields the guardrail checks need.
 *
 * Supports three manifest shapes:
 *
 *   1. Legacy (today, every module):
 *        { key, name, routes: [{ path, label, component }, ...],
 *          navigation, requiredPermissions, fallback?, enabled? }
 *
 *   2. Capsule (target shape, migrated modules):
 *        { key, name, baseRoute, capsuleEntrypoint, layoutMode,
 *          layoutReason?, routeInventory: [...],
 *          compatibilityRoutes: [{ from, to, reason }],
 *          deprecatedRoutes, requiredPermissions, ...
 *          (routes still allowed for back-compat with ModuleRoutes) }
 *
 *   3. Anything in between during migration. Missing fields are
 *      reported as baseline warnings rather than parse errors so
 *      Phase-0 generators can run cleanly against an unmigrated
 *      tree.
 *
 * The reader is regex-based (consistent with how the rest of the
 * platform's static checks parse manifests) so it can run from
 * `tsx` without booting the React bundle.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { isMigrated, RTLM_FOLDER_MAP, type RtlmKey } from "./migration-state";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type LayoutMode = "inside-main-layout" | "full-bleed" | "embedded";

export interface ManifestRouteDecl {
  path: string;
  label?: string;
}

export interface CompatibilityRouteDecl {
  from: string;
  to: string;
  reason?: string;
}

export interface ManifestSnapshot {
  /** Module key declared inside the manifest (e.g. "communication"). */
  key: string | null;
  name: string | null;
  /** Folder under client/src/modules/ where the manifest lives. */
  folder: string;
  /** Absolute path to the manifest source file. */
  manifestPath: string;
  manifestExists: boolean;

  /* ----- legacy fields ----- */
  routes: ManifestRouteDecl[];
  navigationLabels: string[];
  requiredPermissions: string[];

  /* ----- capsule (Phase-1+) fields ----- */
  baseRoute: string | null;
  capsuleEntrypoint: string | null;
  layoutMode: LayoutMode | null;
  layoutReason: string | null;
  routeInventory: string[];
  compatibilityRoutes: CompatibilityRouteDecl[];
  deprecatedRoutes: string[];

  /** Set of paths declared inside `nav.ts` for this module. */
  navHrefs: string[];
  /** Set of paths declared inside `routes.tsx` if it exists. */
  routesFileEntries: string[];

  /** Static-check warnings ("baseline" — non-fatal in Phase 0). */
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

const MODULES_ROOT = "client/src/modules";

/**
 * Read every RTLM manifest. Modules without a manifest still appear
 * in the output with `manifestExists: false` and a warning.
 */
export function readAllManifests(repoRoot: string): ManifestSnapshot[] {
  const out: ManifestSnapshot[] = [];
  for (const [key, folder] of Object.entries(RTLM_FOLDER_MAP)) {
    out.push(readManifestFor(repoRoot, key as RtlmKey, folder));
  }
  return out;
}

/**
 * Read a single module's manifest + sibling `nav.ts` + `routes.tsx`
 * into one snapshot. Tolerates missing files (returns warnings).
 */
export function readManifestFor(
  repoRoot: string,
  key: RtlmKey,
  folder: string,
): ManifestSnapshot {
  const moduleDir = join(repoRoot, MODULES_ROOT, folder);
  const manifestPath = join(moduleDir, "manifest.ts");
  const navPath = join(moduleDir, "nav.ts");
  const routesPath = join(moduleDir, "routes.tsx");

  const snap: ManifestSnapshot = {
    key: null,
    name: null,
    folder,
    manifestPath,
    manifestExists: existsSync(manifestPath),
    routes: [],
    navigationLabels: [],
    requiredPermissions: [],
    baseRoute: null,
    capsuleEntrypoint: null,
    layoutMode: null,
    layoutReason: null,
    routeInventory: [],
    compatibilityRoutes: [],
    deprecatedRoutes: [],
    navHrefs: [],
    routesFileEntries: [],
    warnings: [],
  };

  if (!snap.manifestExists) {
    snap.warnings.push(`manifest missing: ${manifestPath}`);
    return snap;
  }

  const src = readFileSync(manifestPath, "utf8");

  snap.key = extractStringField(src, "key");
  snap.name = extractStringField(src, "name");
  snap.baseRoute = extractStringField(src, "baseRoute");
  snap.capsuleEntrypoint = extractStringField(src, "capsuleEntrypoint");
  const layoutModeRaw = extractStringField(src, "layoutMode");
  snap.layoutMode = isLayoutMode(layoutModeRaw) ? layoutModeRaw : null;
  snap.layoutReason = extractStringField(src, "layoutReason");

  snap.routes = extractRoutes(src);
  snap.navigationLabels = extractNavigationLabels(src);
  snap.requiredPermissions = extractStringArray(src, "requiredPermissions");
  snap.routeInventory = extractStringArray(src, "routeInventory");
  snap.deprecatedRoutes = extractStringArray(src, "deprecatedRoutes");
  snap.compatibilityRoutes = extractCompatibilityRoutes(src);

  if (existsSync(navPath)) {
    snap.navHrefs = extractStringLikePaths(readFileSync(navPath, "utf8"));
  }
  if (existsSync(routesPath)) {
    snap.routesFileEntries = extractStringLikePaths(
      readFileSync(routesPath, "utf8"),
    );
  }

  // Capsule-shape warnings — only become hard failures for migrated modules.
  const wantStrict = isMigrated(key);
  if (!snap.baseRoute) {
    push(snap, wantStrict, "manifest missing baseRoute");
  }
  if (!snap.capsuleEntrypoint) {
    push(snap, wantStrict, "manifest missing capsuleEntrypoint");
  }
  if (!snap.layoutMode) {
    push(snap, wantStrict, "manifest missing layoutMode");
  }
  if (snap.routeInventory.length === 0) {
    push(snap, wantStrict, "manifest missing routeInventory");
  }
  if (snap.layoutMode && snap.layoutMode !== "inside-main-layout" && !snap.layoutReason) {
    push(snap, wantStrict, `layoutMode=${snap.layoutMode} requires layoutReason`);
  }

  return snap;
}

/* ------------------------------------------------------------------ */
/*  Field extractors                                                   */
/* ------------------------------------------------------------------ */

function push(snap: ManifestSnapshot, _strict: boolean, msg: string) {
  // Strictness is enforced by the *caller* (the check script) — the
  // reader always records the warning so generators can include it
  // in baseline reports, but the boolean is documented here so future
  // maintainers don't get confused about who decides severity.
  snap.warnings.push(msg);
}

function extractStringField(src: string, field: string): string | null {
  const re = new RegExp(
    `(?:^|[\\s,{])${field}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`,
    "m",
  );
  return re.exec(src)?.[1] ?? null;
}

function extractStringArray(src: string, field: string): string[] {
  const re = new RegExp(`${field}\\s*:\\s*\\[([\\s\\S]*?)\\]`, "m");
  const m = re.exec(src);
  if (!m) return [];
  return [...m[1].matchAll(/["'`]([^"'`\n]+)["'`]/g)].map((x) => x[1]);
}

function extractRoutes(src: string): ManifestRouteDecl[] {
  // Match the `routes: [ ... ]` array, then walk each `{ ... }` entry.
  const arr = /routes\s*:\s*\[([\s\S]*?)\]/m.exec(src)?.[1];
  if (!arr) return [];
  const out: ManifestRouteDecl[] = [];
  for (const obj of walkObjectArray(arr)) {
    const path = /path\s*:\s*["'`]([^"'`]+)["'`]/.exec(obj)?.[1];
    if (!path) continue;
    const label = /label\s*:\s*["'`]([^"'`]+)["'`]/.exec(obj)?.[1];
    out.push({ path, label });
  }
  return out;
}

function extractNavigationLabels(src: string): string[] {
  const arr = /navigation\s*:\s*\[([\s\S]*?)\]/m.exec(src)?.[1];
  if (!arr) return [];
  return [...arr.matchAll(/label\s*:\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
}

function extractCompatibilityRoutes(src: string): CompatibilityRouteDecl[] {
  const arr = /compatibilityRoutes\s*:\s*\[([\s\S]*?)\]/m.exec(src)?.[1];
  if (!arr) return [];
  const out: CompatibilityRouteDecl[] = [];
  for (const obj of walkObjectArray(arr)) {
    const from = /from\s*:\s*["'`]([^"'`]+)["'`]/.exec(obj)?.[1];
    const to = /to\s*:\s*["'`]([^"'`]+)["'`]/.exec(obj)?.[1];
    if (!from || !to) continue;
    const reason = /reason\s*:\s*["'`]([^"'`]+)["'`]/.exec(obj)?.[1];
    out.push({ from, to, reason });
  }
  return out;
}

/**
 * Pull every quoted path-shaped string from a source file. Used to
 * scan `nav.ts` / `routes.tsx` for declared paths without building
 * a full TS AST.
 */
function extractStringLikePaths(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/["'`](\/[A-Za-z0-9/_:?\-*.]+)["'`]/g)) {
    const p = m[1];
    // Skip `/foo.png` style assets and obvious non-routes.
    if (/\.[a-z0-9]{2,5}$/i.test(p)) continue;
    out.add(p);
  }
  return Array.from(out);
}

/**
 * Walk a comma-separated array of `{ ... }` object literals, ignoring
 * nested braces. The regex parser used elsewhere in the platform uses
 * the same trick — it's good enough for hand-written manifests.
 */
function walkObjectArray(arr: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < arr.length; i++) {
    const ch = arr[i];
    if (ch === "{") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(arr.slice(start, i));
        start = -1;
      }
    }
  }
  return out;
}

function isLayoutMode(s: string | null): s is LayoutMode {
  return s === "inside-main-layout" || s === "full-bleed" || s === "embedded";
}
