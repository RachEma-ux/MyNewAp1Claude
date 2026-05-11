/**
 * Graph Correction Proposal Lifecycle — public-api barrel.
 *
 * Phase 23. The submit / approve / reject / list / audit surface
 * for graph correction proposals.
 */

export {
  submitCorrectionProposal,
  getProposalById,
  listProposals,
  approveCorrectionProposal,
  rejectCorrectionProposal,
  requestRevisionForProposal,
  bulkApproveCorrectionProposals,
  bulkRejectCorrectionProposals,
  listAuditEvents,
  AsdbUnavailableError as GraphCorrectionAsdbUnavailableError,
  CorrectionProposalNotFoundError,
  ProposalAlreadyDecidedError,
} from "./lifecycle.js";
export type {
  SubmitProposalInput,
  ListProposalsInput,
  ProposalRow,
  ProposalStatus,
  AuditEventRow,
  ServiceOptions,
  BulkApproveCorrectionProposalsInput,
  BulkApproveCorrectionProposalsResult,
  BulkRejectCorrectionProposalsInput,
  BulkRejectCorrectionProposalsResult,
} from "./lifecycle.js";
