/**
 * Graph Lens public-API barrel — Phase 24 §T-F.1.
 *
 * Re-exports the registry surface for consumption by:
 *   - boot installers (lenses registered at startup)
 *   - tRPC layer (`agentStudio.graphLens.*` procedures — ship in
 *     subsequent T-F slices)
 *   - operator dashboard (lens browser UI)
 *
 * Hard-rule compliance: this barrel itself imports only from local
 * modules; no `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 * `credential-resolver` imports.
 */

export {
  GRAPH_LENS_KINDS,
  GRAPH_LENS_LAYOUTS,
  GRAPH_LENS_GOVERNANCE_SCOPES,
  isGraphLensKind,
  GraphLensIdAlreadyRegisteredError,
  GraphLensNotFoundError,
} from "./contracts.js";

export type {
  GraphLensKind,
  GraphLensLayout,
  GraphLensGovernanceScope,
  GraphLensDefinition,
} from "./contracts.js";

export {
  registerGraphLens,
  getGraphLens,
  listGraphLenses,
  listGraphLensesByKind,
  getGraphLensRegistrySize,
  __resetGraphLensRegistryForTests,
} from "./registry.js";
