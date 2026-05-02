/**
 * PRM — Client bootstrap.
 *
 * Registers the PRM capsule manifest with the platform's client
 * module registry. Imported by `client/src/modules/index.ts` so the
 * registration runs once at app boot.
 */

import { registerClientModule } from "@/platform/modules/registry";

import { prmClientManifest } from "./manifest";

let registered = false;

export function registerPRMClientModule(): void {
  if (registered) return;
  registerClientModule(prmClientManifest);
  registered = true;
}

export { prmClientManifest };
