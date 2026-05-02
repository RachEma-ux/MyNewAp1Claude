/**
 * Manifests barrel — registers all module manifests with the registry.
 *
 * Importing this file registers manifests as a side effect. The Runtime
 * Manager and Router Composer rely on the registry being populated.
 *
 * Add new modules by:
 *   1. Creating `server/<module>/manifest.ts` exporting `<module>Manifest`.
 *   2. Importing it here and pushing to the array.
 */

import { getModuleRegistry } from "./registry";
import type { ModuleManifest } from "./types";

import { prmManifest } from "../../prm/manifest";
import { psmManifest } from "../../psm/manifest";
import { codeStudioManifest } from "../../code-studio/manifest";
import { agentStudioManifest } from "../../agent-studio/manifest";
import { sandboxWfManifest } from "../../sandbox-wf/manifest";
import { ragManifest } from "../../rag/manifest";
import { openRouterManifest } from "../../openrouter/manifest";
import { psManifest } from "../../ps/manifest";
import { hrManifest } from "../../hr/manifest";
import { omManifest } from "../../organization-management/manifest";
import { cvManifest } from "../../culture-values/manifest";
import { aiTypesManifest } from "../../ai-types/manifest";
import { kgraAgentManifest } from "../../kgra-agent/manifest";
import { communicationManifest } from "../../communication/manifest";
import { pmCentralManifest } from "../../pm-central/manifest";
import { dataAnalysisManifest } from "../../data-analysis/manifest";

export const ALL_MANIFESTS: ModuleManifest[] = [
  // Pilot modules (priority migration set)
  prmManifest,
  psmManifest,
  codeStudioManifest,
  agentStudioManifest,
  sandboxWfManifest,
  ragManifest,
  openRouterManifest,
  // Strong modules (manifest first pass)
  psManifest,
  hrManifest,
  omManifest,
  cvManifest,
  aiTypesManifest,
  kgraAgentManifest,
  communicationManifest,
  pmCentralManifest,
  dataAnalysisManifest,
];

let _registered = false;

/**
 * Idempotently register all manifests. Safe to call from multiple
 * entrypoints (the Express boot path, tests, scripts).
 */
export function registerAllManifests(): void {
  if (_registered) return;
  _registered = true;
  const registry = getModuleRegistry();
  registry.registerAll(ALL_MANIFESTS);
}
