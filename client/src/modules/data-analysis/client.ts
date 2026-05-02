/**
 * Data Analysis — Client bootstrap.
 *
 * Registers the Data Analysis capsule manifest with the platform's
 * client module registry. Imported by `client/src/modules/index.ts`
 * so the registration runs once at app boot.
 *
 * Mirrors the bootstrap shape established by Communication
 * (`client/src/modules/communication/client.ts`): a single named
 * entrypoint that registers the manifest, with a local idempotency
 * guard so test setup that bootstraps repeatedly doesn't re-enter
 * registry side-effects.
 */

import { registerClientModule } from "@/platform/modules/registry";

import { dataAnalysisClientManifest } from "./manifest";

let registered = false;

/**
 * Idempotent — safe to call multiple times. The platform registry
 * itself dedupes by `manifest.key`, but the local guard avoids
 * double work in tests that bootstrap repeatedly.
 */
export function registerDataAnalysisClientModule(): void {
  if (registered) return;
  registerClientModule(dataAnalysisClientManifest);
  registered = true;
}

export { dataAnalysisClientManifest };
