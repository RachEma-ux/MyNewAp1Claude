/**
 * PM Central — Client bootstrap.
 *
 * Registers the PM Central capsule manifest with the platform's
 * client module registry. Imported by `client/src/modules/index.ts`
 * so the registration runs once at app boot.
 *
 * Mirrors the bootstrap shape established by Communication and Data
 * Analysis: a single named entrypoint that registers the manifest,
 * with a local idempotency guard so test setup that bootstraps
 * repeatedly doesn't re-enter registry side-effects.
 */

import { registerClientModule } from "@/platform/modules/registry";

import { pmCentralClientManifest } from "./manifest";

let registered = false;

/**
 * Idempotent — safe to call multiple times. The platform registry
 * itself dedupes by `manifest.key`, but the local guard avoids
 * double work in tests that bootstrap repeatedly.
 */
export function registerPMCentralClientModule(): void {
  if (registered) return;
  registerClientModule(pmCentralClientManifest);
  registered = true;
}

export { pmCentralClientManifest };
