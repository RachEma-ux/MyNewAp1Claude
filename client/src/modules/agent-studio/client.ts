/**
 * Agent Studio — Client bootstrap.
 *
 * Registers the Agent Studio capsule manifest with the platform's
 * client module registry. Imported by `client/src/modules/index.ts`
 * so the registration runs once at app boot.
 */

import { registerClientModule } from "@/platform/modules/registry";

import { agentStudioClientManifest } from "./manifest";

let registered = false;

export function registerAgentStudioClientModule(): void {
  if (registered) return;
  registerClientModule(agentStudioClientManifest);
  registered = true;
}

export { agentStudioClientManifest };
