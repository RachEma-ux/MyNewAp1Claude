/**
 * Graph Quality — public API barrel.
 *
 * Phase 23 §1. Exposes the scan orchestrator + registered scanners.
 */

export {
  runQualityScan,
  UnknownScanKindError,
} from "./scan-orchestrator.js";
export type {
  QualityFinding,
  QualityScanSample,
  QualityScanner,
  QualityScannerRegistration,
  RunQualityScanInput,
  RunQualityScanOptions,
  RunQualityScanResult,
} from "./scan-orchestrator.js";

export {
  scanForOrphanNodes,
  orphanNodeScanner,
} from "./scanners/orphan-node-scanner.js";
export {
  scanForDuplicateEntities,
  duplicateEntityScanner,
} from "./scanners/duplicate-entity-scanner.js";
export {
  scanForStaleNodes,
  staleNodeScanner,
} from "./scanners/stale-node-scanner.js";

export {
  convertFindingToProposal,
  proposalKindForFinding,
  severityToConfidence,
  FINDING_CLASS_TO_PROPOSAL_KIND,
  AsdbUnavailableError as FindingConversionAsdbUnavailableError,
  FindingNotFoundError,
  FindingAlreadyConvertedError,
} from "./finding-to-proposal.js";
export type {
  ConvertFindingToProposalInput,
  ConvertFindingToProposalResult,
  ConvertFindingOptions,
} from "./finding-to-proposal.js";

export {
  runQualityAgent,
  AsdbUnavailableError as QualityAgentAsdbUnavailableError,
} from "./agent-run.js";
export type {
  RunQualityAgentInput,
  RunQualityAgentOptions,
  RunQualityAgentResult,
  ScannerInvocationSummary,
} from "./agent-run.js";

export {
  buildProposalPayload,
  buildProposalPayloadFromQualityFinding,
} from "./proposal-payload-builder.js";
export type {
  ProposalPayload,
  FindingForPayload,
} from "./proposal-payload-builder.js";

export {
  applyApprovedProposal,
  DEFAULT_APPLIER_REGISTRY,
  AsdbUnavailableError as MutationWorkerAsdbUnavailableError,
  ProposalNotFoundError,
  ProposalNotApprovedError,
  ProposalAlreadyAppliedError,
  InvalidProposalPayloadError,
} from "./mutation-worker.js";
export type {
  ApplierRegistry,
  ApplierResult,
  ApplyApprovedProposalInput,
  ApplyApprovedProposalResult,
  ApplyApprovedProposalOptions,
} from "./mutation-worker.js";

export { approveAndApplyProposal } from "./approve-and-apply.js";
export type {
  ApproveAndApplyInput,
  ApproveAndApplyOptions,
  ApproveAndApplyResult,
} from "./approve-and-apply.js";

export { getFindingAuditTrail } from "./finding-audit-trail.js";
export type {
  FindingAuditTrail,
  FindingAuditTrailAuditRow,
  FindingAuditTrailFindingRow,
  FindingAuditTrailProposalRow,
  GetFindingAuditTrailOptions,
} from "./finding-audit-trail.js";

import { orphanNodeScanner } from "./scanners/orphan-node-scanner.js";
import { duplicateEntityScanner } from "./scanners/duplicate-entity-scanner.js";
import { staleNodeScanner } from "./scanners/stale-node-scanner.js";
import type { QualityScannerRegistration } from "./scan-orchestrator.js";

/**
 * Canonical registry: every scanner the orchestrator can dispatch on.
 * Additional scanners (missing_property, projection_drift, ...) extend
 * this list in follow-up PRs.
 */
export const QUALITY_SCANNER_REGISTRY: readonly QualityScannerRegistration[] = [
  orphanNodeScanner,
  duplicateEntityScanner,
  staleNodeScanner,
];
