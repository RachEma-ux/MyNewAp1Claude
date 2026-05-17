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
  withdrawCorrectionProposal,
  bulkApproveCorrectionProposals,
  bulkRejectCorrectionProposals,
  listAuditEvents,
  AsdbUnavailableError as GraphCorrectionAsdbUnavailableError,
  CorrectionProposalNotFoundError,
  ProposalAlreadyDecidedError,
  ProposalNotProposerError,
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

export {
  createRollbackProposal,
  isRollbackableProposalKind,
  ROLLBACKABLE_PROPOSAL_KINDS,
  ProposalNotApprovedForRollbackError,
  NonReversibleProposalKindError,
  AlreadyHasRollbackInFlightError,
} from "./rollback.js";
export type {
  CreateRollbackProposalInput,
  RollbackProposalLink,
} from "./rollback.js";
