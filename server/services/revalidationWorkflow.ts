import { getDb } from "../db";
import { agents } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
// Revalidation result type
interface RevalidationResult {
  agentId: number;
  previousStatus: string;
  newStatus: string;
  reason?: string;
}

/**
 * Revalidation Workflow
 * Phase 6: Policy Hot Reload & UI Feedback Loop
 * 
 * Revalidates all governed agents against new policy
 */

export interface RevalidationSummary {
  total: number;
  valid: number;
  restricted: number;
  invalidated: number;
  results: RevalidationResult[];
}

export async function executeRevalidation(
  policyHash: string
): Promise<RevalidationSummary> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // Fetch all governed agents
  const agentRows = await db
    .select()
    .from(agents)
    .where(eq(agents.status, "governed"));

  const results: RevalidationResult[] = [];
  let validCount = 0;
  let restrictedCount = 0;
  let invalidatedCount = 0;

  // Evaluate each agent
  for (const agent of agentRows) {
    const previousStatus = agent.status;
    
    // MVP: Simple validation based on proof bundle
    let newStatus: any = "GOVERNED_VALID";
    let reason: string | undefined;

    // Check if proof bundle exists
    const policyDigest = agent.policyDigest;
    if (!policyDigest) {
      newStatus = "archived";
      reason = "Missing policy digest";
      invalidatedCount++;
    }
    // Check if policy hash matches
    else if (policyDigest !== policyHash) {
      newStatus = "archived";
      reason = `Policy hash mismatch: expected ${policyHash}, got ${policyDigest}`;
      invalidatedCount++;
    }
    // Valid
    else {
      validCount++;
    }

    // Persist status change
    if (newStatus !== previousStatus) {
      await db
        .update(agents)
        .set({
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, agent.id));
    }

    results.push({
      agentId: agent.id,
      previousStatus: previousStatus || "UNKNOWN",
      newStatus,
      reason,
    });
  }

  return {
    total: agentRows.length,
    valid: validCount,
    restricted: restrictedCount,
    invalidated: invalidatedCount,
    results,
  };
}

/**
 * Get recent governance events
 */
export async function getGovernanceEvents(
  since: Date
): Promise<Array<{
  agentId: number;
  agentName: string;
  oldStatus: string;
  newStatus: string;
  reason?: string;
  timestamp: Date;
}>> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // MVP: Return agents that were updated since the given timestamp
  const agentRows = await db
    .select()
    .from(agents)
    .where(eq(agents.status, "governed"));

  return agentRows
    .filter((agent: any) => new Date(agent.updatedAt) > since)
    .map((agent: any) => ({
      agentId: agent.id,
      agentName: agent.name,
      oldStatus: "governed", // MVP: assume previous status
      newStatus: agent.status || "unknown",
      reason: undefined, // MVP: no reason tracking yet
      timestamp: new Date(agent.updatedAt),
    }));
}
