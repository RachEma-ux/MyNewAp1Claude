/**
 * AI Types — Client bootstrap.
 *
 * Registers the AI Types capsule manifest with the platform's client
 * module registry. Imported by `client/src/modules/index.ts` so the
 * registration runs once at app boot.
 */

import { registerClientModule } from "@/platform/modules/registry";

import { aiTypesClientManifest } from "./manifest";

let registered = false;

export function registerAITypesClientModule(): void {
  if (registered) return;
  registerClientModule(aiTypesClientManifest);
  registered = true;
}

export { aiTypesClientManifest };
