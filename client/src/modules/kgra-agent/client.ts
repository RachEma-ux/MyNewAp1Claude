/**
 * KGRA Agent — Client bootstrap.
 *
 * Registers the KGRA Agent capsule manifest with the platform's
 * client module registry. Imported by `client/src/modules/index.ts`
 * so the registration runs once at app boot.
 */

import { registerClientModule } from "@/platform/modules/registry";

import { kgraAgentClientManifest } from "./manifest";

let registered = false;

export function registerKgraAgentClientModule(): void {
  if (registered) return;
  registerClientModule(kgraAgentClientManifest);
  registered = true;
}

export { kgraAgentClientManifest };
