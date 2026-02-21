import { getDb } from "../db";
import { agents, agentProofs, type Agent } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { fetchSnapshot, computeSpecHash } from "./policyService";

export type AgentSpec = Agent; // Backward compatibility alias

/**
 * Promotion Service
 * Handles sandbox-to-governed promotion with OPA policy evaluation and cryptographic signing
 */

export interface PromotionInput {
  agentId: number;
  actor: string;
  actorId: number;
}

export interface PromotionResult {
  success: boolean;
  denies?: PolicyDeny[];
  governedAgent?: AgentSpec;
  proof?: ProofBundle;
}

export interface PolicyDeny {
  rule: string;
  reason: string;
  field?: string;
}

export interface ProofBundle {
  policyHash: string;
  specHash: string;
  signature: string;
  authority: string;
  signedAt: Date;
}

/**
 * Promote sandbox agent to governed status
 * 1. Freeze sandbox anatomy snapshot
 * 2. Build governed draft
 * 3. Evaluate promotion policy via OPA
 * 4. If policy allows: sign spec and persist governed agent
 * 5. If policy denies: return denies list
 */
export async function promote(input: PromotionInput): Promise<PromotionResult> {
  const db = getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  // 1. Fetch sandbox agent
  const [sandboxAgent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, input.agentId))
    .limit(1);

  if (!sandboxAgent) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Agent not found",
    });
  }

  // Verify agent is in sandbox mode
  if (sandboxAgent.status !== "sandbox") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only sandbox agents can be promoted",
    });
  }

  // 2. Build governed draft
  const governedDraft = {
    ...sandboxAgent,
    status: "governed" as const,
  };

  // 4. Evaluate promotion policy
  const policyEvaluation = await evaluatePromotionPolicy(governedDraft, input.actor);

  if (!policyEvaluation.allowed) {
    return {
      success: false,
      denies: policyEvaluation.denies,
    };
  }

  // 5. Get current policy snapshot
  const policySnapshot = await fetchSnapshot(sandboxAgent.workspaceId);

  // 6. Sign the spec
  const specHash = computeSpecHash(governedDraft);
  const proofBundle = await signSpec(governedDraft, policySnapshot.hash, specHash, input.actor);

  // 7. Persist governed agent
  await db
    .update(agents)
    .set({
      status: "governed",
      updatedAt: new Date(),
    })
    .where(eq(agents.id, input.agentId));

  // 8. Store proof in agent_proofs table
  await db.insert(agentProofs).values({
    agentId: input.agentId,
    policyDecision: "PASS",
    policyHash: policySnapshot.hash,
    specHash,
    authority: input.actor,
    signedAt: proofBundle.signedAt,
    signature: proofBundle.signature,
  });

  // 9. Fetch updated agent
  const [governedAgent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, input.agentId))
    .limit(1);

  return {
    success: true,
    governedAgent,
    proof: proofBundle,
  };
}

/**
 * Evaluate promotion policy using OPA
 * MVP: Simple rule-based validation
 * TODO: Integrate with actual OPA engine
 */
async function evaluatePromotionPolicy(
  agent: Partial<AgentSpec>,
  actor: string
): Promise<{ allowed: boolean; denies: PolicyDeny[] }> {
  const denies: PolicyDeny[] = [];

  // Rule 1: Must have description
  if (!agent.description || agent.description.trim().length === 0) {
    denies.push({
      rule: "description_required",
      reason: "Agent description is required for governed agents",
      field: "description",
    });
  }

  // Rule 2: Temperature must be within valid range
  const temperature = agent.temperature ? Number(agent.temperature) : 0.7;
  if (temperature < 0 || temperature > 2) {
    denies.push({
      rule: "temperature_limit",
      reason: `Agent temperature must be between 0 and 2, got ${temperature}`,
      field: "temperature",
    });
  }

  // Rule 3: System prompt must be defined
  if (!agent.systemPrompt || agent.systemPrompt.trim().length === 0) {
    denies.push({
      rule: "system_prompt_required",
      reason: "Agent system prompt is required for governed agents",
      field: "systemPrompt",
    });
  }

  // Rule 4: Model must be specified
  if (!agent.modelId || agent.modelId.trim().length === 0) {
    denies.push({
      rule: "model_required",
      reason: "Agent model must be specified for governed agents",
      field: "modelId",
    });
  }

  return {
    allowed: denies.length === 0,
    denies,
  };
}

/**
 * Sign agent spec
 * MVP: HMAC-SHA256 signature
 * TODO: Upgrade to PKI (RSA/ECDSA) with certificate chain
 */
async function signSpec(
  agent: Partial<AgentSpec>,
  policyHash: string,
  specHash: string,
  authority: string
): Promise<ProofBundle> {
  // Create signature payload
  const payload = {
    policyHash,
    specHash,
    authority,
    signedAt: new Date().toISOString(),
  };

  // MVP: HMAC signature (use JWT_SECRET as signing key)
  const secret = process.env.JWT_SECRET || (() => { if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET is required in production"); return "dev-only-secret"; })();
  const signature = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");

  return {
    policyHash,
    specHash,
    signature,
    authority,
    signedAt: new Date(payload.signedAt),
  };
}

/**
 * Verify proof bundle signature
 * Used by admission control
 */
export async function verifyProof(proof: ProofBundle): Promise<boolean> {
  try {
    // Recreate payload
    const payload = {
      policyHash: proof.policyHash,
      specHash: proof.specHash,
      authority: proof.authority,
      signedAt: proof.signedAt.toISOString(),
    };

    // Verify HMAC signature
    const secret = process.env.JWT_SECRET || (() => { if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET is required in production"); return "dev-only-secret"; })();
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(payload))
      .digest("hex");

    return expectedSignature === proof.signature;
  } catch (error) {
    return false;
  }
}

/**
 * Check if signer is revoked
 * TODO: Implement revocation list checking
 */
export async function isSignerRevoked(authority: string): Promise<boolean> {
  // MVP: No revocation checking
  // TODO: Check against revoked signers list in policy snapshot
  return false;
}
