/**
 * PSM — Client bootstrap.
 *
 * Registers the PSM capsule manifest with the platform's client
 * module registry. Imported by `client/src/modules/index.ts` so the
 * registration runs once at app boot.
 */

import { registerClientModule } from "@/platform/modules/registry";

import { psmClientManifest } from "./manifest";

let registered = false;

export function registerPSMClientModule(): void {
  if (registered) return;
  registerClientModule(psmClientManifest);
  registered = true;
}

export { psmClientManifest };
