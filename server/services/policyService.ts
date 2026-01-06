import { getDb } from "../db";
import { policyVersions, agents, type Agent } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";

/**
 * Policy Service
 * Handles policy snapshots, hot reload, and agent revalidation
 */

export type AgentSpec = Agent; // Backward compatibility alias

export interface PolicySnapshot {
  policySet: string;
  version: string;
  hash: string;
  bundle: Record<string, any>;
  revokedSigners: string[];
  invalidatedAgents: number[];
  loadedAt: Date;
}

export interface HotReloadResult {
  success: boolean;
  oldHash: string;
  newHash: string;
  revalidatedAgents: number;
  invalidatedAgents: number[];
}

export interface RevalidationResult {
  agentId: number;
  previousStatus: string;
  newStatus: "GOVERNED_VALID" | "GOVERNED_RESTRICTED" | "GOVERNED_INVALIDATED";
  reason?: string;
}

/**
 * Fetch current policy snapshot for a workspace
 * Returns policy set, hash, revoked signers, and invalidated agents
 */
export async function fetchSnapshot(workspaceId: string): Promise<PolicySnapshot> {
  const db = getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  // Get latest policy version
  const [latestPolicy] = await db
    .select()
    .from(policyVersions)
    .where(eq(policyVersions.policySet, `workspace_${workspaceId}`))
    .orderBy(desc(policyVersions.loadedAt))
    .limit(1);

  if (!latestPolicy) {
    // Return default policy if none exists
    return {
      policySet: `workspace_${workspaceId}`,
      version: "1.0.0",
      hash: "default",
      bundle: {},
      revokedSigners: [],
      invalidatedAgents: [],
      loadedAt: new Date(),
    };
  }

  // Get invalidated agents
  const invalidatedAgents = await db
    .select()
    .from(agents)
    .where(eq(agents.status, "archived"));

  return {
    policySet: latestPolicy.policySet,
    version: latestPolicy.version,
    hash: latestPolicy.policyHash,
    bundle: latestPolicy.bundle as Record<string, any>,
    revokedSigners: latestPolicy.revokedSigners || [],
    invalidatedAgents: invalidatedAgents.map((a) => a.id),
    loadedAt: latestPolicy.loadedAt,
  };
}

/**
 * Hot reload policy bundle
 * Atomically swaps policy and triggers revalidation
 */
export async function hotReload(
  workspaceId: string,
  policySet: string,
  bundle: Record<string, any>,
  actor: string
): Promise<HotReloadResult> {
  const db = getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  // Get current policy hash
  const currentSnapshot = await fetchSnapshot(workspaceId);
  const oldHash = currentSnapshot.hash;

  // Compute new policy hash
  const newHash = crypto.createHash("sha256").update(JSON.stringify(bundle)).digest("hex");

  // Store new policy version
  const version = `${Date.now()}`; // Simple versioning
  await db.insert(policyVersions).values({
    policySet: `workspace_${workspaceId}`,
    version,
    policyHash: newHash,
    bundle: bundle,
    loadedAt: new Date(),
    loadedBy: 1, // TODO: Get actual actor ID
    isCurrent: true,
  });

  // Trigger revalidation of all governed agents
  const governedAgents = await db
    .select()
    .from(agents)
    .where(eq(agents.status, "governed"));

  const revalidationResults = await Promise.all(
    governedAgents.map((agent) => revalidateAgent(agent, newHash))
  );

  const invalidatedAgents = revalidationResults
    .filter((r) => r.newStatus === "GOVERNED_INVALIDATED")
    .map((r) => r.agentId);

  return {
    success: true,
    oldHash,
    newHash,
    revalidatedAgents: revalidationResults.length,
    invalidatedAgents,
  };
}

/**
 * Revalidate specific agents against current policy
 */
export async function revalidate(agentIds: number[]): Promise<RevalidationResult[]> {
  const db = getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  // Get agents
  const agentRows = await Promise.all(agentIds.map((id) => db.select().from(agents).where(eq(agents.id, id)).limit(1)));

  const validAgents = agentRows.map((a) => a[0]).filter(Boolean);

  // Get current policy hash (use first agent's workspace)
  if (validAgents.length === 0) return [];

  const workspaceId = validAgents[0].workspaceId;
  const snapshot = await fetchSnapshot(workspaceId);

  // Revalidate each agent
  const results = await Promise.all(
    validAgents.map((agent) => revalidateAgent(agent, snapshot.hash))
  );

  return results;
}

/**
 * Revalidate single agent against policy
 * Internal helper function
 */
async function revalidateAgent(agent: AgentSpec, policyHash: string): Promise<RevalidationResult> {
  const db = getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const previousStatus = agent.status;

  // Check if agent is sandbox (skip revalidation)
  if (agent.status === "sandbox") {
    return {
      agentId: agent.id,
      previousStatus,
      newStatus: "governed", // Sandbox doesn't change
      reason: "Sandbox agents are not revalidated",
    };
  }

  // Check policy digest exists
  const policyDigest = agent.policyDigest;
  if (!policyDigest) {
    await db
      .update(agents)
      .set({
        status: "archived",
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id));

    return {
      agentId: agent.id,
      previousStatus,
      newStatus: "archived",
      reason: "PROOF_MISSING: No policy digest found",
    };
  }

  // Check policy hash match
  if (policyDigest !== policyHash) {
    await db
      .update(agents)
      .set({
        status: "archived",
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id));

    return {
      agentId: agent.id,
      previousStatus,
      newStatus: "archived",
      reason: `POLICY_HASH_MISMATCH: Expected ${policyHash}, got ${policyDigest}`,
    };
  }

  // Agent is valid
  if (previousStatus !== "governed") {
    await db
      .update(agents)
      .set({
        status: "governed",
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id));
  }

  return {
    agentId: agent.id,
    previousStatus,
    newStatus: "governed",
  };
}

/**
 * Compute hash of agent spec
 * Used for spec hash verification in proofs
 */
export function computeSpecHash(spec: Record<string, any>): string {
  // Remove fields that shouldn't affect hash
  const { id, createdAt, updatedAt, ...hashableSpec } = spec;
  return crypto.createHash("sha256").update(JSON.stringify(hashableSpec)).digest("hex");
}

/**
 * Store policy version
 */
export async function storePolicyVersion(
  policySet: string,
  version: string,
  bundle: Record<string, any>
): Promise<void> {
  const db = getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const hash = crypto.createHash("sha256").update(JSON.stringify(bundle)).digest("hex");

  await db.insert(policyVersions).values({
    policySet,
    version,
    policyHash: hash,
    bundle: bundle,
    loadedAt: new Date(),
    loadedBy: 1, // TODO: Get actual actor ID
    isCurrent: true,
  });
}
