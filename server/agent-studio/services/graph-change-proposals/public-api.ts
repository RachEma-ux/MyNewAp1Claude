/**
 * Graph change proposals service — public API barrel.
 *
 * Phase 11.5.
 */

export type {
  GraphChangeProposalKind,
  GraphChangeProposalStatus,
  GraphChangeProposalItem,
  GraphChangeProposalRequest,
  GraphChangeProposalValidationOutcome,
  GraphChangeProposalGovernanceResult,
  GraphChangeProposalAdapter,
} from "./lifecycle.js";
export { GraphChangeProposalLifecycle } from "./lifecycle.js";
