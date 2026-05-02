/**
 * HR — Client bootstrap.
 *
 * Registers the HR capsule manifest with the platform's client
 * module registry. Imported by `client/src/modules/index.ts` so the
 * registration runs once at app boot.
 */

import { registerClientModule } from "@/platform/modules/registry";

import { hrClientManifest } from "./manifest";

let registered = false;

export function registerHRClientModule(): void {
  if (registered) return;
  registerClientModule(hrClientManifest);
  registered = true;
}

export { hrClientManifest };
