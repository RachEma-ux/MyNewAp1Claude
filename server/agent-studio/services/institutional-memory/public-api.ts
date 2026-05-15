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
  INSTITUTIONAL_MEMORY_NODE_TYPE_METADATA,
  getInstitutionalMemoryNodeTypeMetadata,
  type InstitutionalMemoryNodeType,
  type InstitutionalMemorySourceMapping,
  type InstitutionalMemoryCoverageSummary,
  type InstitutionalMemoryNodeTypeMetadata,
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
