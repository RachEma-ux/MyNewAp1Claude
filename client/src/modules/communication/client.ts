/**
 * Communication — Client bootstrap.
 *
 * Registers the Communication capsule manifest with the platform's
 * client module registry. Imported by `client/src/modules/index.ts`
 * so the registration runs once at app boot.
 *
 * The repo's existing convention is for `client/src/modules/index.ts`
 * to import each module's manifest directly and call
 * `registerClientModule(manifest)`. We add `client.ts` per the
 * Module Client Capsule spec and have `index.ts` import it instead
 * of the manifest — that gives every module a single, named
 * bootstrap entrypoint and lets `check:module-registration` verify
 * the wiring without parsing the manifest export shape.
 */

import { registerClientModule } from "@/platform/modules/registry";

import { communicationClientManifest } from "./manifest";

let registered = false;

/**
 * Idempotent — safe to call multiple times. The platform registry
 * itself dedupes by `manifest.key`, but the local guard avoids
 * double work in tests that bootstrap repeatedly.
 */
export function registerCommunicationClientModule(): void {
  if (registered) return;
  registerClientModule(communicationClientManifest);
  registered = true;
}

export { communicationClientManifest };
