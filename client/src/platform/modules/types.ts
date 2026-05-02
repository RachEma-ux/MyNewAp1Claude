/**
 * Frontend Module Manifest Types
 *
 * Mirrors the server manifest shape for the parts the client needs:
 *   - key, name
 *   - routes
 *   - nav (group / order / icon / label)
 *   - required permissions
 *   - feature flags
 *   - degraded/disabled behavior
 *
 * Lazy-loaded shells are imported via dynamic `() => import(...)`.
 *
 * Capsule fields (Phase-1+): the *Module Client Capsule* refactor
 * adds a small set of optional fields that let a module own a whole
 * URL subtree behind a single capsule entrypoint. They are optional
 * here so legacy modules continue to compile during the migration —
 * scripts/module-tools/migration-state.ts decides which modules must
 * have them set in strict mode.
 */

import type { ComponentType, LazyExoticComponent } from "react";

export interface ClientModuleRoute {
  path: string;
  label?: string;
  permissions?: string[];
  /** Lazily-imported component for the route. */
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
}

export interface ClientModuleNav {
  group?: string;
  label: string;
  icon?: string;
  order?: number;
}

/**
 * Where the module's pages render relative to the platform shell.
 *  - inside-main-layout: render under <MainLayout> (default for most RTLMs)
 *  - full-bleed:         the module owns the full viewport (e.g. workspaces)
 *  - embedded:           rendered inside another panel; no chrome
 *
 * Defaults to "inside-main-layout" when unset. `full-bleed` and
 * `embedded` require `layoutReason` so the migration audit can tell
 * intentional escapes from oversights.
 */
export type ModuleLayoutMode = "inside-main-layout" | "full-bleed" | "embedded";

/**
 * Compatibility redirect declared by a migrating module so legacy
 * deep links keep working. The capsule itself does not mount these —
 * App.tsx (or a small platform-side shim) renders the redirect.
 */
export interface ModuleCompatibilityRoute {
  from: string;
  to: string;
  reason?: string;
}

export interface ClientModuleManifest {
  key: string;
  name: string;
  /**
   * Per-route registrations consumed by `<ModuleRoutes />`. Capsule
   * modules can leave this empty and rely on `capsuleEntrypoint`
   * instead — the composer prefers the capsule entry when present.
   */
  routes: ClientModuleRoute[];
  navigation?: ClientModuleNav[];
  requiredPermissions?: string[];
  featureFlag?: string;
  /** Optional: render this when the module is disabled or degraded. */
  fallback?: ComponentType<any>;
  /** Optional enable predicate. */
  enabled?: () => boolean;

  /* ----- Capsule fields (optional during migration) ----- */
  /**
   * URL subtree owned by this module, e.g. "/communication". The
   * route composer matches the active path against `baseRoute` using
   * route-segment-aware logic so `/ps` does not steal `/psm`.
   */
  baseRoute?: string;
  /**
   * Component that owns internal routing for everything under
   * `baseRoute`. The composer renders this once; the capsule's
   * own `routes.tsx` / mod.tsx handles inner navigation.
   */
  capsuleEntrypoint?:
    | LazyExoticComponent<ComponentType<any>>
    | ComponentType<any>;
  layoutMode?: ModuleLayoutMode;
  /** Required when layoutMode != "inside-main-layout". */
  layoutReason?: string;
  /**
   * Authoritative list of canonical paths the capsule serves. Used
   * by `check:module-route-inventory` to verify nav links resolve to
   * a declared route, and by AWI to count the module's wired
   * client-route surface.
   */
  routeInventory?: string[];
  /** Compatibility redirects (rendered by App.tsx / shim, not the capsule). */
  compatibilityRoutes?: ModuleCompatibilityRoute[];
  /** Paths that should disappear after the migration window. */
  deprecatedRoutes?: string[];
}
