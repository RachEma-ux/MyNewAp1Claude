/**
 * Agent Governance Module - Error Taxonomy
 * 
 * Defines error codes and types for governance operations.
 */

// ============================================================================
// Error Codes
// ============================================================================

export const GovernanceErrorCodes = {
  // Proof Validation Errors
  PROOF_MISSING: "PROOF_MISSING",
  POLICY_HASH_MISMATCH: "POLICY_HASH_MISMATCH",
  SPEC_HASH_MISMATCH: "SPEC_HASH_MISMATCH",
  SIGNATURE_INVALID: "SIGNATURE_INVALID",
  SIGNER_REVOKED: "SIGNER_REVOKED",
  
  // Sandbox Errors
  SANDBOX_EXPIRED: "SANDBOX_EXPIRED",
  CONTAINMENT_VIOLATION: "CONTAINMENT_VIOLATION",
  
  // Policy Errors
  POLICY_EVALUATION_FAILED: "POLICY_EVALUATION_FAILED",
  POLICY_DENIED: "POLICY_DENIED",
  
  // Resource Errors
  BUDGET_EXCEEDED: "BUDGET_EXCEEDED",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  CAPABILITY_DENIED: "CAPABILITY_DENIED",
  
  // Runtime Errors
  AGENT_NOT_FOUND: "AGENT_NOT_FOUND",
  AGENT_INVALIDATED: "AGENT_INVALIDATED",
  RUNTIME_UNAVAILABLE: "RUNTIME_UNAVAILABLE",
  
  // Configuration Errors
  INVALID_CONFIG: "INVALID_CONFIG",
  MISSING_SIGNER: "MISSING_SIGNER",
} as const;

export type GovernanceErrorCode = typeof GovernanceErrorCodes[keyof typeof GovernanceErrorCodes];

// ============================================================================
// Error Class
// ============================================================================

export class GovernanceError extends Error {
  constructor(
    public code: GovernanceErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GovernanceError";
  }
}

// ============================================================================
// Error Factory Functions
// ============================================================================

export function proofMissingError(agentId: string): GovernanceError {
  return new GovernanceError(
    GovernanceErrorCodes.PROOF_MISSING,
    `Agent ${agentId} is in governed mode but missing proof bundle`,
    { agentId }
  );
}

export function policyHashMismatchError(
  agentId: string,
  expectedHash: string,
  actualHash: string
): GovernanceError {
  return new GovernanceError(
    GovernanceErrorCodes.POLICY_HASH_MISMATCH,
    `Agent ${agentId} proof policy hash mismatch: expected ${expectedHash}, got ${actualHash}`,
    { agentId, expectedHash, actualHash }
  );
}

export function specHashMismatchError(
  agentId: string,
  expectedHash: string,
  actualHash: string
): GovernanceError {
  return new GovernanceError(
    GovernanceErrorCodes.SPEC_HASH_MISMATCH,
    `Agent ${agentId} spec has been tampered: expected ${expectedHash}, got ${actualHash}`,
    { agentId, expectedHash, actualHash }
  );
}

export function signatureInvalidError(agentId: string): GovernanceError {
  return new GovernanceError(
    GovernanceErrorCodes.SIGNATURE_INVALID,
    `Agent ${agentId} proof signature verification failed`,
    { agentId }
  );
}

export function signerRevokedError(agentId: string, authority: string): GovernanceError {
  return new GovernanceError(
    GovernanceErrorCodes.SIGNER_REVOKED,
    `Agent ${agentId} was signed by revoked authority: ${authority}`,
    { agentId, authority }
  );
}

export function sandboxExpiredError(agentId: string, expiryDate: string): GovernanceError {
  return new GovernanceError(
    GovernanceErrorCodes.SANDBOX_EXPIRED,
    `Sandbox agent ${agentId} expired at ${expiryDate}`,
    { agentId, expiryDate }
  );
}

export function containmentViolationError(agentId: string, violation: string): GovernanceError {
  return new GovernanceError(
    GovernanceErrorCodes.CONTAINMENT_VIOLATION,
    `Sandbox agent ${agentId} violates containment: ${violation}`,
    { agentId, violation }
  );
}

export function budgetExceededError(agentId: string, budget: number, cost: number): GovernanceError {
  return new GovernanceError(
    GovernanceErrorCodes.BUDGET_EXCEEDED,
    `Agent ${agentId} cost ${cost} exceeds budget ${budget}`,
    { agentId, budget, cost }
  );
}

export function capabilityDeniedError(agentId: string, capability: string): GovernanceError {
  return new GovernanceError(
    GovernanceErrorCodes.CAPABILITY_DENIED,
    `Agent ${agentId} requested denied capability: ${capability}`,
    { agentId, capability }
  );
}

export function agentInvalidatedError(agentId: string, reason: string): GovernanceError {
  return new GovernanceError(
    GovernanceErrorCodes.AGENT_INVALIDATED,
    `Agent ${agentId} has been invalidated: ${reason}`,
    { agentId, reason }
  );
}
