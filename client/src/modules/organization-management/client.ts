/**
 * Organization Management — Client bootstrap.
 *
 * Registers the OM capsule manifest with the platform's client
 * module registry. Imported by `client/src/modules/index.ts` so the
 * registration runs once at app boot.
 */

import { registerClientModule } from "@/platform/modules/registry";

import { organizationManagementClientManifest } from "./manifest";

let registered = false;

export function registerOrganizationManagementClientModule(): void {
  if (registered) return;
  registerClientModule(organizationManagementClientManifest);
  registered = true;
}

export { organizationManagementClientManifest };
