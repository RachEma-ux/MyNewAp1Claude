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

export interface ClientModuleManifest {
  key: string;
  name: string;
  routes: ClientModuleRoute[];
  navigation?: ClientModuleNav[];
  requiredPermissions?: string[];
  featureFlag?: string;
  /** Optional: render this when the module is disabled or degraded. */
  fallback?: ComponentType<any>;
  /** Optional enable predicate. */
  enabled?: () => boolean;
}
