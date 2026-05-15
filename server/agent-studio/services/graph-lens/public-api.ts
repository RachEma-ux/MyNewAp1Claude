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
  summarizeGraphLensRegistry,
  __resetGraphLensRegistryForTests,
  type GraphLensRegistrySummary,
} from "./registry.js";

export {
  DEFAULT_GRAPH_LENS_DEFINITIONS,
  maybeInstallDefaultGraphLenses,
  type MaybeInstallDefaultGraphLensesOptions,
  type MaybeInstallDefaultGraphLensesResult,
} from "./install-default-lenses.js";

export {
  IMPACT_ANALYSIS_KINDS,
  isImpactAnalysisKind,
  DEFAULT_IMPACT_MAX_DEPTH,
  ABSOLUTE_IMPACT_MAX_DEPTH,
  normalizeImpactMaxDepth,
  summarizeImpactAnalysisResult,
  type ImpactAnalysisKind,
  type ImpactAnalysisRequest,
  type ImpactAnalysisNode,
  type ImpactAnalysisEdge,
  type ImpactAnalysisResult,
  type ImpactAnalysisResultSummary,
} from "./impact-analysis-contracts.js";

export {
  registerLensRunner,
  getLensRunner,
  runLens,
  listLensRunnerKinds,
  __resetLensRunnerRegistryForTests,
  LensRunnerAlreadyRegisteredForKindError,
  LensRunnerNotRegisteredForKindError,
  type LensRunnerFn,
  type LensRunnerViewerContext,
  type LensSnapshot,
  type LensSnapshotNode,
  type LensSnapshotEdge,
} from "./runner-contract.js";

export {
  createStubLensRunnerForKind,
  maybeInstallStubLensRunners,
  type MaybeInstallStubLensRunnersOptions,
  type MaybeInstallStubLensRunnersResult,
} from "./stub-runners.js";

export {
  maybeInstallDefaultLensStack,
  type MaybeInstallDefaultLensStackOptions,
  type MaybeInstallDefaultLensStackResult,
} from "./install-default-lens-stack.js";
