/**
 * Semantic Enrichment Agent public-api barrel — T-D.3.1.
 */

export {
  SEMANTIC_ENRICHMENT_PROPOSAL_KINDS,
  SEMANTIC_ENRICHMENT_PROPOSAL_KIND_METADATA,
  isSemanticEnrichmentProposalKind,
  normalizeSemanticEnrichmentMaxProposals,
  normalizeSemanticEnrichmentMinConfidence,
  DEFAULT_SEMANTIC_ENRICHMENT_MIN_CONFIDENCE,
  DEFAULT_SEMANTIC_ENRICHMENT_MAX_PROPOSALS_PER_RUN,
  ABSOLUTE_SEMANTIC_ENRICHMENT_MAX_PROPOSALS_PER_RUN,
  type SemanticEnrichmentProposalKind,
  type SemanticEnrichmentProposalKindMetadata,
  type SemanticEnrichmentSourceCitation,
  type SemanticEnrichmentProposal,
  type SemanticEnrichmentRunInput,
  type SemanticEnrichmentRunOutput,
} from "./contracts.js";

export {
  createSemanticEnrichmentAgent,
  isSemanticEnrichmentCandidateTargetKind,
  SEMANTIC_ENRICHMENT_CANDIDATE_TARGET_KINDS,
  type SemanticEnrichmentAgent,
  type CreateSemanticEnrichmentAgentOptions,
  type SemanticEnrichmentCandidate,
  type SemanticEnrichmentCandidateBase,
  type SemanticEnrichmentCandidateTargetKind,
  type SemanticEnrichmentNodeCandidate,
  type SemanticEnrichmentNodePropertyCandidate,
  type SemanticEnrichmentEntityCandidate,
  type SemanticEnrichmentEdgeCandidate,
  type SemanticEnrichmentRunInputWithCandidates,
  type SemanticEnrichmentRunOutputWithSkips,
} from "./semantic-enrichment-agent.js";

export {
  createSemanticEnrichmentStore,
  type SemanticEnrichmentStore,
  type CreateSemanticEnrichmentStoreOptions,
  type SemanticEnrichmentRunListRow,
  type SemanticEnrichmentProposalListRow,
  type SemanticEnrichmentRunStats,
  type SemanticEnrichmentRecentRejectionRow,
  type SemanticEnrichmentProposalDetail,
} from "./semantic-enrichment-store.js";

export {
  createSemanticEnrichmentEvidenceCollector,
  type SemanticEnrichmentEvidenceCollector,
  type CreateSemanticEnrichmentEvidenceCollectorOptions,
  type EvidenceCollectionInput,
} from "./semantic-enrichment-evidence-collector.js";

export {
  createSemanticEnrichmentProposer,
  type SemanticEnrichmentProposer,
  type CreateSemanticEnrichmentProposerOptions,
  type ProposeInput,
} from "./semantic-enrichment-proposer.js";

export {
  listSemanticEnrichmentCandidates,
  SEMANTIC_ENRICHMENT_CANDIDATES_DEFAULT_LIMIT,
  SEMANTIC_ENRICHMENT_CANDIDATES_ABSOLUTE_LIMIT,
  DEFAULT_WEAK_DESCRIPTION_MAX_LENGTH,
  GENERIC_EDGE_TYPE_KEYS,
  type GenericEdgeTypeKey,
  type ListSemanticEnrichmentCandidatesInput,
  type SemanticEnrichmentCandidatesEnvelope,
} from "./semantic-enrichment-candidate-selector.js";

export {
  runSemanticEnrichment,
  isSupportedTriggerProposalKind,
  SUPPORTED_TRIGGER_PROPOSAL_KINDS,
  type RunSemanticEnrichmentInput,
  type RunSemanticEnrichmentOptions,
  type RunSemanticEnrichmentOutput,
  type SemanticEnrichmentRunOkEnvelope,
  type SemanticEnrichmentRunNoCandidatesEnvelope,
  type SemanticEnrichmentRunKindNotSupportedEnvelope,
} from "./semantic-enrichment-runner.js";
