/**
 * Institutional Memory Lens public-api barrel — Phase 25 §T-G.1.
 */

export {
  INSTITUTIONAL_MEMORY_NODE_TYPES,
  INSTITUTIONAL_MEMORY_SOURCE_MAPPING,
  isInstitutionalMemoryNodeType,
  listMappedInstitutionalMemoryNodeTypes,
  listUnmappedInstitutionalMemoryNodeTypes,
  summarizeInstitutionalMemoryCoverage,
  type InstitutionalMemoryNodeType,
  type InstitutionalMemorySourceMapping,
  type InstitutionalMemoryCoverageSummary,
} from "./contracts.js";

export {
  projectInstitutionalMemoryNode,
  projectInstitutionalMemoryNodeWithReason,
  projectInstitutionalMemoryNodes,
  isInstitutionalMemoryMappable,
  summarizeInstitutionalMemoryProjectionResult,
  INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS,
  type ProjectedInstitutionalMemoryNode,
  type InstitutionalMemoryProjectionSkipReason,
  type ProjectInstitutionalMemoryNodeOutcome,
  type ProjectInstitutionalMemoryNodesResult,
  type InstitutionalMemoryProjectionResultSummary,
} from "./project-node.js";
