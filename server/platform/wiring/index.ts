/**
 * Application Wiring Inventory — Public surface
 *
 * Consumers should import from `server/platform/wiring` rather than
 * the implementation files so internals can change without churning
 * call sites. The HQ tRPC procedures and check scripts go through
 * this entry point.
 */

export type {
  WiringArea,
  WiringStatus,
  WiringSeverity,
  WiringEvidence,
  ModuleWiringAreaStatus,
  ModuleWiringInventory,
  ModuleDependencyEdge,
  WiringGraph,
  WiringGraphNode,
  WiringGraphEdge,
  WiringMatrix,
  WiringInventorySummary,
  ModuleReadinessStatus,
} from "./types";

export { DEFAULT_MATRIX_COLUMNS, readinessStatusFor } from "./types";

export {
  buildApplicationWiringInventory,
  type AwiRuntimeFacts,
  type BuildAwiOptions,
} from "./inventory";

export {
  buildWiringMatrix,
  summarize,
  getModuleWiring,
  getMissingWires,
  getBrokenWires,
  getDeclaredOnlyWires,
  getPartialWires,
} from "./matrix";

export {
  buildDependencyGraph,
  buildGraphFromInventory,
  getModuleDependencies,
  getReverseDependencies,
  detectDependencyCycles,
} from "./graph";

export { computeReadiness, AREA_WEIGHTS, type ReadinessResult } from "./readiness";

export { renderApplicationWiringReport, type RenderedReport } from "./report";
