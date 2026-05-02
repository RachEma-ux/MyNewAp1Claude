/**
 * OpenRouter — Client bootstrap.
 *
 * Registers the OpenRouter capsule manifest with the platform's
 * client module registry. Imported by `client/src/modules/index.ts`
 * so the registration runs once at app boot.
 */

import { registerClientModule } from "@/platform/modules/registry";

import { openRouterClientManifest } from "./manifest";

let registered = false;

export function registerOpenRouterClientModule(): void {
  if (registered) return;
  registerClientModule(openRouterClientManifest);
  registered = true;
}

export { openRouterClientManifest };
