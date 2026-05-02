/**
 * Sandbox WF — Client bootstrap.
 *
 * Registers the Sandbox WF capsule manifest with the platform's
 * client module registry. Imported by `client/src/modules/index.ts`
 * so the registration runs once at app boot.
 */

import { registerClientModule } from "@/platform/modules/registry";

import { sandboxWfClientManifest } from "./manifest";

let registered = false;

export function registerSandboxWfClientModule(): void {
  if (registered) return;
  registerClientModule(sandboxWfClientManifest);
  registered = true;
}

export { sandboxWfClientManifest };
