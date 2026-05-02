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

import { prmClientManifest } from "./prm/manifest";
import { psmClientManifest } from "./psm/manifest";
import { codeStudioClientManifest } from "./code-studio/manifest";
import { agentStudioClientManifest } from "./agent-studio/manifest";
import { sandboxWfClientManifest } from "./sandbox-wf/manifest";
import { ragClientManifest } from "./rag/manifest";
import { openRouterClientManifest } from "./openrouter/manifest";
import { psClientManifest } from "./ps/manifest";
import { hrClientManifest } from "./hr/manifest";
import { organizationManagementClientManifest } from "./organization-management/manifest";
import { cultureValuesClientManifest } from "./culture-values/manifest";
import { aiTypesClientManifest } from "./ai-types/manifest";
import { kgraAgentClientManifest } from "./kgra-agent/manifest";
import { communicationClientManifest } from "./communication/manifest";
import { pmCentralClientManifest } from "./pm-central/manifest";
import { dataAnalysisClientManifest } from "./data-analysis/manifest";

const ALL_CLIENT_MANIFESTS = [
  prmClientManifest,
  psmClientManifest,
  codeStudioClientManifest,
  agentStudioClientManifest,
  sandboxWfClientManifest,
  ragClientManifest,
  openRouterClientManifest,
  psClientManifest,
  hrClientManifest,
  organizationManagementClientManifest,
  cultureValuesClientManifest,
  aiTypesClientManifest,
  kgraAgentClientManifest,
  communicationClientManifest,
  pmCentralClientManifest,
  dataAnalysisClientManifest,
];

let registered = false;

/**
 * Register every per-module client manifest with the shared registry.
 * Idempotent — safe to call multiple times.
 */
export function registerAllClientModules(): void {
  if (registered) return;
  for (const manifest of ALL_CLIENT_MANIFESTS) {
    registerClientModule(manifest);
  }
  registered = true;
}

// Auto-register on import. Importers that need explicit control can call
// `registerAllClientModules()` after the import — it's idempotent.
registerAllClientModules();
