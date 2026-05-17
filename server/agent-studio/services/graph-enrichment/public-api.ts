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
  type SemanticEnrichmentAgent,
  type CreateSemanticEnrichmentAgentOptions,
  type SemanticEnrichmentCandidate,
  type SemanticEnrichmentRunInputWithCandidates,
  type SemanticEnrichmentRunOutputWithSkips,
} from "./semantic-enrichment-agent.js";

export {
  createSemanticEnrichmentStore,
  type SemanticEnrichmentStore,
  type CreateSemanticEnrichmentStoreOptions,
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
