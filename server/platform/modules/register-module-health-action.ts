/**
 * Helper used by every module's `boot:` hook to register a uniform
 * `<key>.health` action with the Module Gateway.
 *
 * Why centralize this:
 *   - Every module already declares a `health()` function. Exposing it
 *     through the gateway gives observability tooling (Digital HQ,
 *     other modules) a governed, boundary-respecting way to ask
 *     "is module X up?" without importing the module's internals.
 *   - The action is read-only and does not require a governance
 *     receipt, so it's safe to register unconditionally.
 *   - Modules that want richer public APIs add their own
 *     `registerPublicApi({...})` calls in their boot hook in addition
 *     to this one.
 */

import { registerPublicApi } from "./module-gateway";
import type { ModuleManifest } from "./types";

export function registerModuleHealthAction(manifest: ModuleManifest): void {
  registerPublicApi({
    module: manifest.key,
    action: `${manifest.key}.health`,
    handler: async () => {
      if (!manifest.health) {
        return {
          moduleKey: manifest.key,
          version: manifest.version,
          state: "unknown",
          message: "module did not declare a health() function",
          checkedAt: new Date().toISOString(),
        };
      }
      const result = await manifest.health();
      return {
        moduleKey: manifest.key,
        version: manifest.version,
        state: result.state,
        message: result.message,
        checkedAt: result.checkedAt,
      };
    },
  });
}
