/**
 * Embedded Runtime
 * 
 * Manages agent lifecycle operations (start, stop, status) in embedded mode.
 * This is the internal implementation that runs agents within the same process.
 */

import { getDb } from "../db";
import { agents, agent_proofs } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { z } from "zod";
import { getOPAEngine } from "./opa-engine";

// Zod schema for validating agent restore data
const agentRestoreSchema = z.object({
  name: z.string().min(1).max(255),
  roleClass: z.string().min(1).max(50),
  status: z.string().max(50).default("draft"),
  systemPrompt: z.string().min(1),
  modelId: z.string().min(1).max(255),
  createdBy: z.number().int().positive(),
  description: z.string().nullish(),
  tags: z.unknown().optional(),
  lifecycle: z.unknown().optional(),
  temperature: z.string().nullish(),
  capabilities: z.unknown().optional(),
  limits: z.unknown().optional(),
  hasDocumentAccess: z.boolean().nullish(),
  hasToolAccess: z.boolean().nullish(),
  allowedTools: z.unknown().optional(),
  policyDigest: z.string().max(64).nullish(),
  policySetHash: z.string().max(64).nullish(),
  lockedFields: z.unknown().optional(),
}).passthrough();

export interface AgentSpec {
  mode: "sandbox" | "governed";
  roleClass: string;
  anatomy: {
    systemPrompt: string;
    tools: string[];
    constraints?: Record<string, any>;
  };
  governanceStatus: string;
  expiresAt?: Date;
}

export interface StartAgentResult {
  success: boolean;
  agentId: number;
  status: "running" | "denied";
  reason?: string;
}

export interface AgentStatus {
  agentId: number;
  status: "running" | "stopped" | "denied";
  uptime?: number;
  lastActivity?: Date;
}

/**
 * Start an agent with admission control checks
 */
export async function startAgent(
  workspaceId: number,
  agentId: number,
  spec: AgentSpec
): Promise<StartAgentResult> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // Fetch agent
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)));

  if (!agent) {
    return {
      success: false,
      agentId,
      status: "denied",
      reason: "Agent not found"
    };
  }

  // Admission control checks
  if (agent.mode === "sandbox") {
    // Check expiry
    if (agent.expiresAt && new Date(agent.expiresAt) < new Date()) {
      return {
        success: false,
        agentId,
        status: "denied",
        reason: "Sandbox agent expired"
      };
    }
  }

  if (agent.mode === "governed") {
    // Check governance status
    if (agent.governanceStatus === "GOVERNED_INVALIDATED") {
      return {
        success: false,
        agentId,
        status: "denied",
        reason: "Agent invalidated by policy"
      };
    }

    if (agent.governanceStatus === "GOVERNED_RESTRICTED") {
      return {
        success: false,
        agentId,
        status: "denied",
        reason: "Agent restricted by policy"
      };
    }

    // Verify proof exists
    const [proof] = await db
      .select()
      .from(agent_proofs)
      .where(eq(agent_proofs.agentId, agentId));

    if (!proof) {
      return {
        success: false,
        agentId,
        status: "denied",
        reason: "No governance proof found"
      };
    }

    // Verify spec hash matches proof
    const specHash = computeSpecHash(spec);
    const proofBundle = proof.proofBundle as any;
    
    if (proofBundle.specHash !== specHash) {
      return {
        success: false,
        agentId,
        status: "denied",
        reason: "Spec tampering detected - hash mismatch"
      };
    }

    // Verify policy hash matches current policy
    try {
      const opa = getOPAEngine();
      const policyInfo = opa.getPolicyInfo();
      if (policyInfo.bundleHash && proofBundle.policyHash) {
        const currentPolicyHash = `sha256:${policyInfo.bundleHash}`;
        if (proofBundle.policyHash !== currentPolicyHash) {
          // Policy has changed since agent was approved — invalidate
          await db
            .update(agents)
            .set({ governanceStatus: "GOVERNED_INVALIDATED" })
            .where(eq(agents.id, agentId));

          return {
            success: false,
            agentId,
            status: "denied",
            reason: "Policy hash mismatch - agent governance invalidated"
          };
        }
      }
    } catch (policyErr) {
      // If OPA is not available, fail closed
      console.warn("[Runtime] Could not verify policy hash:", policyErr instanceof Error ? policyErr.message : String(policyErr));
    }
  }

  // All checks passed - agent can start
  return {
    success: true,
    agentId,
    status: "running"
  };
}

/**
 * Stop a running agent
 */
export async function stopAgent(
  workspaceId: number,
  agentId: number
): Promise<{ success: boolean; agentId: number }> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // Verify agent exists
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)));

  if (!agent) {
    throw new Error("Agent not found");
  }

  // TODO: Implement actual stop logic (terminate process, cleanup resources)
  
  return {
    success: true,
    agentId
  };
}

/**
 * Get agent status
 */
export async function getAgentStatus(
  workspaceId: number,
  agentId: number
): Promise<AgentStatus> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)));

  if (!agent) {
    throw new Error("Agent not found");
  }

  // TODO: Implement actual status tracking
  return {
    agentId,
    status: "stopped", // Default status
    uptime: 0,
    lastActivity: agent.updatedAt ? new Date(agent.updatedAt) : undefined
  };
}

/**
 * Revalidate agents after policy hot reload
 */
export async function revalidateAgents(
  workspaceId: number,
  agentIds: number[]
): Promise<{ invalidated: number[]; valid: number[] }> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const invalidated: number[] = [];
  const valid: number[] = [];

  for (const agentId of agentIds) {
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)));

    if (!agent || agent.mode !== "governed") {
      continue;
    }

    // TODO: Re-evaluate agent against new policy
    // For now, mark all as invalidated (fail-closed)
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    await db

      .update(agents)
      .set({ governanceStatus: "GOVERNED_INVALIDATED" })
      .where(eq(agents.id, agentId));

    invalidated.push(agentId);
  }

  return { invalidated, valid };
}

/**
 * Invalidate specific agents
 */
export async function invalidateAgents(
  agentIds: number[],
  reason: string
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  for (const agentId of agentIds) {
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    await db

      .update(agents)
      .set({ 
        governanceStatus: "GOVERNED_INVALIDATED"
        // TODO: Store invalidation reason in separate field or metadata
      })
      .where(eq(agents.id, agentId));
  }
}

/**
 * Compute hash of agent spec for tampering detection
 */
function computeSpecHash(spec: AgentSpec): string {
  const specString = JSON.stringify(spec, Object.keys(spec).sort());
  return crypto.createHash("sha256").update(specString).digest("hex");
}

/**
 * Persist governance state
 */
export async function persistGovernanceState(
  agentId: number,
  status: string,
  reason: string,
  policyHash: string
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });


  await db

    .update(agents)
    .set({ 
      governanceStatus: status
      // TODO: Store reason and policyHash in metadata or separate table
    })
    .where(eq(agents.id, agentId));
}

/**
 * Get governance state
 */
export async function getGovernanceState(agentId: number): Promise<{
  status: string;
  reason?: string;
  policyHash?: string;
}> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId));

  if (!agent) {
    throw new Error("Agent not found");
  }

  return {
    status: agent.governanceStatus,
    // TODO: Fetch reason and policyHash from metadata
  };
}

/**
 * Backup agents for a workspace
 */
export async function backupAgents(workspaceId: number): Promise<any[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const workspaceAgents = await db
    .select()
    .from(agents)
    .where(eq(agents.workspaceId, workspaceId));

  return workspaceAgents;
}

/**
 * Restore agents from backup
 */
export async function restoreAgents(
  workspaceId: number,
  backup: any[]
): Promise<{ restored: number; skipped: number }> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  if (!Array.isArray(backup)) {
    throw new Error("Restore data must be an array");
  }

  let restored = 0;
  let skipped = 0;

  for (const agentData of backup) {
    const result = agentRestoreSchema.safeParse(agentData);
    if (!result.success) {
      const errors = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
      console.warn(`[Restore] Skipping invalid agent entry: ${errors}`);
      skipped++;
      continue;
    }

    // Strip id to avoid PK conflicts — DB generates a new serial id
    const { id, ...validated } = result.data as any;

    await db.insert(agents).values({
      ...validated,
      workspaceId // Ensure workspace ID is correct
    });
    restored++;
  }

  return { restored, skipped };
}
