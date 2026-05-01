/**
 * Router Composer — Platform Modular
 *
 * Builds an object of `routerKey -> trpc-router` from registered manifests
 * for use with `t.router({ ...platformCore, ...moduleRouters })`.
 *
 * This composer does NOT replace `server/routers.ts` outright. It produces
 * a record that the root router merges in, so platform-core routers stay
 * explicit and module routers come from the manifest.
 *
 * tRPC path compatibility:
 * - Each manifest with `router` is mounted at `appRouter[manifest.routerKey ?? manifest.key]`.
 * - Existing modules' routerKeys (e.g. `prm`, `psm`, `codeStudio`) are preserved
 *   by setting `routerKey` on their manifests.
 */

import type { AnyRouter } from "@trpc/server";
import { getModuleRegistry } from "./registry";
import type { ModuleManifest } from "./types";

export interface ComposedRouters {
  /** Map of `routerKey -> tRPC sub-router`. */
  routers: Record<string, AnyRouter>;
  /** Map of `moduleKey -> routerKey`. */
  keyMap: Record<string, string>;
}

export function composeModuleRouters(filter?: (m: ModuleManifest) => boolean): ComposedRouters {
  const registry = getModuleRegistry();
  const routers: Record<string, AnyRouter> = {};
  const keyMap: Record<string, string> = {};

  for (const manifest of registry.listEnabled()) {
    if (filter && !filter(manifest)) continue;
    if (!manifest.router) continue;

    const key = manifest.routerKey ?? manifest.key;
    if (routers[key]) {
      throw new Error(
        `[RouterComposer] Duplicate routerKey '${key}' (module '${manifest.key}' collides with another)`,
      );
    }
    routers[key] = manifest.router;
    keyMap[manifest.key] = key;
  }

  return { routers, keyMap };
}
