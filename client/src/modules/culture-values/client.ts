/**
 * Culture & Values — Client bootstrap.
 *
 * Registers the CV capsule manifest with the platform's client
 * module registry. Imported by `client/src/modules/index.ts` so the
 * registration runs once at app boot.
 */

import { registerClientModule } from "@/platform/modules/registry";

import { cultureValuesClientManifest } from "./manifest";

let registered = false;

export function registerCultureValuesClientModule(): void {
  if (registered) return;
  registerClientModule(cultureValuesClientManifest);
  registered = true;
}

export { cultureValuesClientManifest };
