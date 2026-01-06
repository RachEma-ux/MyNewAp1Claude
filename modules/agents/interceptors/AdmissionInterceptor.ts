import type { Interceptor } from "./InterceptorChain";
import type { InterceptorDecision, InterceptorContext, AgentSpec } from "../types";
import { ErrorCodes } from "../types";
import crypto from "crypto";

/**
 * Admission Interceptor
 * Phase 2: Orchestrator Runtime - Admission Control
 * 
 * Validates agents before allowing them to start:
 * - Sandbox expiry check
 * - Sandbox containment check
 * - Governed proof presence check
 * - Spec hash verification
 * - Policy hash binding check
 * - Signer revocation check
 * - Signature verification
 */

export class AdmissionInterceptor implements Interceptor {
  name = "AdmissionInterceptor";

  /**
   * Intercept method required by Interceptor interface
   */
  async intercept(context: InterceptorContext): Promise<InterceptorDecision> {
    return await this.execute(context);
  }

  constructor(
    private revokedSigners: Set<string> = new Set(),
    private signingSecret: string = process.env.JWT_SECRET || "default-secret"
  ) {}

  async execute(context: InterceptorContext): Promise<InterceptorDecision> {
    const { agent, policyHash } = context;

    // Route to appropriate validation based on agent mode
    if (agent.mode === "sandbox") {
      return await this.validateSandbox(agent as any, context);
    } else if (agent.mode === "governed") {
      return await this.validateGoverned(agent as any, context, policyHash);
    }

    return {
      allow: false,
      deny: true,
      reasons: [`Unknown agent mode: ${(agent as any).mode}`],
      errorCodes: ["INVALID_MODE"],
    };
  }

  /**
   * Validate sandbox agent
   */
  private async validateSandbox(
    agent: any,
    context: InterceptorContext
  ): Promise<InterceptorDecision> {
    const reasons: string[] = [];
    const errorCodes: string[] = [];

    // 1. Check sandbox expiry
    if (agent.expiresAt) {
      const expiryDate = new Date(agent.expiresAt);
      if (expiryDate < context.timestamp) {
        reasons.push(
          `Sandbox expired at ${expiryDate.toISOString()}, current time: ${context.timestamp.toISOString()}`
        );
        errorCodes.push(ErrorCodes.SANDBOX_EXPIRED);
      }
    }

    // 2. Check sandbox containment
    const sandboxConstraints = agent.sandboxConstraints || {};
    
    if (sandboxConstraints.externalCalls === true) {
      reasons.push("Sandbox agents cannot make external calls");
      errorCodes.push(ErrorCodes.CONTAINMENT_VIOLATION);
    }

    if (sandboxConstraints.persistentWrites === true) {
      reasons.push("Sandbox agents cannot make persistent writes");
      errorCodes.push(ErrorCodes.CONTAINMENT_VIOLATION);
    }

    // If any violations, deny
    if (errorCodes.length > 0) {
      return {
        allow: false,
        deny: true,
        reasons,
        errorCodes,
      };
    }

    // Sandbox is valid
    return {
      allow: true,
      deny: false,
      reasons: [],
      errorCodes: [],
    };
  }

  /**
   * Validate governed agent
   */
  private async validateGoverned(
    agent: any,
    context: InterceptorContext,
    policyHash: string
  ): Promise<InterceptorDecision> {
    const reasons: string[] = [];
    const errorCodes: string[] = [];

    // 1. Check proof presence
    const governance = agent.governance;
    if (!governance || !governance.proofBundle) {
      reasons.push("Governed agent missing proof bundle");
      errorCodes.push(ErrorCodes.PROOF_MISSING);
      return {
        allow: false,
        deny: true,
        reasons,
        errorCodes,
      };
    }

    const proof = governance.proofBundle;

    // 2. Verify spec hash
    const currentSpecHash = this.computeSpecHash(agent);
    if (proof.specHash !== currentSpecHash) {
      reasons.push(
        `Spec hash mismatch: expected ${proof.specHash}, got ${currentSpecHash}`
      );
      errorCodes.push(ErrorCodes.SPEC_HASH_MISMATCH);
    }

    // 3. Verify policy hash binding
    if (proof.policyHash !== policyHash) {
      reasons.push(
        `Policy hash mismatch: expected ${policyHash}, got ${proof.policyHash}`
      );
      errorCodes.push(ErrorCodes.POLICY_HASH_MISMATCH);
    }

    // 4. Check signer revocation
    if (this.revokedSigners.has(proof.authority)) {
      reasons.push(`Signer ${proof.authority} has been revoked`);
      errorCodes.push(ErrorCodes.SIGNER_REVOKED);
    }

    // 5. Verify signature
    const signatureValid = await this.verifySignature(proof);
    if (!signatureValid) {
      reasons.push("Invalid signature");
      errorCodes.push(ErrorCodes.SIGNATURE_INVALID);
    }

    // If any violations, deny
    if (errorCodes.length > 0) {
      return {
        allow: false,
        deny: true,
        reasons,
        errorCodes,
      };
    }

    // Governed agent is valid
    return {
      allow: true,
      deny: false,
      reasons: [],
      errorCodes: [],
    };
  }

  /**
   * Compute spec hash (exclude metadata fields)
   */
  private computeSpecHash(spec: any): string {
    const { id, createdAt, updatedAt, governance, ...hashableSpec } = spec;
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(hashableSpec))
      .digest("hex");
  }

  /**
   * Verify HMAC signature
   * MVP: HMAC-SHA256
   * TODO: Upgrade to PKI (RSA/ECDSA)
   */
  private async verifySignature(proof: any): Promise<boolean> {
    try {
      const payload = {
        policyHash: proof.policyHash,
        specHash: proof.specHash,
        authority: proof.authority,
        signedAt: new Date(proof.signedAt).toISOString(),
      };

      const expectedSignature = crypto
        .createHmac("sha256", this.signingSecret)
        .update(JSON.stringify(payload))
        .digest("hex");

      return expectedSignature === proof.signature;
    } catch (error) {
      return false;
    }
  }

  /**
   * Add revoked signer
   */
  addRevokedSigner(authority: string): void {
    this.revokedSigners.add(authority);
  }

  /**
   * Remove revoked signer
   */
  removeRevokedSigner(authority: string): void {
    this.revokedSigners.delete(authority);
  }

  /**
   * Get all revoked signers
   */
  getRevokedSigners(): string[] {
    return Array.from(this.revokedSigners);
  }
}
