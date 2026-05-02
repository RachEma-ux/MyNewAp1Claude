/**
 * Frontend Module Bootstrap
 *
 * Imports each per-module client manifest and registers them with the
 * shared client registry. Importing this module is a side-effectful
 * `register` — call it once from `App.tsx` (or another bootstrap site)
 * before reading the registry.
 *
 * Adding a new module:
 *   1. Create `client/src/modules/<key>/manifest.ts` exporting the
 *      `ClientModuleManifest`.
 *   2. Import + register it below.
 *
 * No code outside `client/src/modules/` should import these manifests
 * directly — consumers should go through the registry / route composer
 * / nav composer in `client/src/platform/modules/`.
 */

import { registerClientModule } from "@/platform/modules/registry";

// Migrated modules expose a `client.ts` bootstrap that registers the
// manifest itself. Unmigrated modules still export the manifest from
// `./<folder>/manifest.ts`; we keep that path alive during the
// migration window so existing modules don't need to change.
import { registerCommunicationClientModule } from "./communication/client";
import { registerDataAnalysisClientModule } from "./data-analysis/client";
import { registerPMCentralClientModule } from "./pm-central/client";
import { registerCodeStudioClientModule } from "./code-studio/client";
import { registerProjectsSystemClientModule } from "./ps/client";
import { registerPRMClientModule } from "./prm/client";
import { registerPSMClientModule } from "./psm/client";
import { registerHRClientModule } from "./hr/client";

import { agentStudioClientManifest } from "./agent-studio/manifest";
import { sandboxWfClientManifest } from "./sandbox-wf/manifest";
import { ragClientManifest } from "./rag/manifest";
import { openRouterClientManifest } from "./openrouter/manifest";
import { organizationManagementClientManifest } from "./organization-management/manifest";
import { cultureValuesClientManifest } from "./culture-values/manifest";
import { aiTypesClientManifest } from "./ai-types/manifest";
import { kgraAgentClientManifest } from "./kgra-agent/manifest";

const LEGACY_CLIENT_MANIFESTS = [
  agentStudioClientManifest,
  sandboxWfClientManifest,
  ragClientManifest,
  openRouterClientManifest,
  organizationManagementClientManifest,
  cultureValuesClientManifest,
  aiTypesClientManifest,
  kgraAgentClientManifest,
];

let registered = false;

/**
 * Register every per-module client manifest with the shared registry.
 * Idempotent — safe to call multiple times.
 *
 * Migrated modules go through their own `client.ts` (which lets the
 * `check:module-registration` script verify the bootstrap shape).
 * Legacy modules continue to register their manifests directly.
 */
export function registerAllClientModules(): void {
  if (registered) return;

  // Migrated capsules.
  registerCommunicationClientModule();
  registerDataAnalysisClientModule();
  registerPMCentralClientModule();
  registerCodeStudioClientModule();
  registerProjectsSystemClientModule();
  registerPRMClientModule();
  registerPSMClientModule();
  registerHRClientModule();

  // Legacy manifests.
  for (const manifest of LEGACY_CLIENT_MANIFESTS) {
    registerClientModule(manifest);
  }

  registered = true;
}

// Auto-register on import. Importers that need explicit control can call
// `registerAllClientModules()` after the import — it's idempotent.
registerAllClientModules();
