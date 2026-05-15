/**
 * Code Intelligence Graph contracts public-api barrel — Phase 25 §T-G.2.
 */

export {
  CODE_GRAPH_NODE_TYPES,
  CODE_GRAPH_EDGE_TYPES,
  CODE_GRAPH_EDGE_CONSTRAINTS,
  isCodeGraphNodeType,
  isCodeGraphEdgeType,
  isAllowedCodeGraphEdge,
  listAllowedEdgeTypesFromSource,
  listAllowedEdgeTypesToTarget,
  validateCodeGraphEdgeWithReason,
  validateCodeGraphEdgeBatch,
  summarizeCodeGraph,
  summarizeCodeGraphCardinality,
  type CodeGraphNodeType,
  type CodeGraphEdgeType,
  type CodeGraphEdgeConstraint,
  type CodeGraphEdgeValidationReason,
  type CodeGraphEdgeValidationOutcome,
  type CodeGraphEdgeBatchInput,
  type CodeGraphEdgeBatchResult,
  type CodeGraphSummary,
  type CodeGraphCardinalitySummary,
} from "./code-intelligence-contracts.js";
