/**
 * Policy Drift Detection Service
 * 
 * Detects when governed agents diverge from current policy requirements
 * Runs every 10 minutes to identify agents that need revalidation
 */

import { getDb } from "../db";
import { evaluatePolicy } from "./opa-engine";
import { computeSpecHash } from "../../features/agents-create/types/agent-schema";
import { eq } from "drizzle-orm";
import { agents as agentsTable } from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";

export interface DriftReport {
  agentId: string;
  agentName: string;
  driftType: "policy_change" | "spec_tamper" | "expired" | "invalid";
  severity: "critical" | "high" | "medium" | "low";
  details: string;
  detectedAt: Date;
  recommendedAction: string;
}

export interface DriftSummary {
  totalDrifted: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  reports: DriftReport[];
}

/**
 * Detect policy drift across all governed agents
 */
export async function detectDrift(): Promise<DriftSummary> {
  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const reports: DriftReport[] = [];

  // Get all governed agents
  const agents = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.mode, "governed"));

  for (const agent of agents) {
    // Check 1: Policy drift (agent was valid under old policy, invalid under new)
    const policyResult = await evaluatePolicy(agent, {
      hook: "on_promotion_attempt",
      actor: { id: "system", role: "admin" },
    });

    if (!policyResult.allow) {
      reports.push({
        agentId: agent.id,
        agentName: agent.name,
        driftType: "policy_change",
        severity: "high",
        details: `Agent no longer complies with current policy: ${policyResult.violations.map((v: any) => v.message).join(", ")}`,
        detectedAt: new Date(),
        recommendedAction: "Revalidate or restrict agent",
      });
      continue;
    }

    // Check 2: Spec tampering (hash mismatch)
    const currentHash = computeSpecHash(agent.spec);
    if (agent.proofBundle?.specHash && currentHash !== agent.proofBundle.specHash) {
      reports.push({
        agentId: agent.id,
        agentName: agent.name,
        driftType: "spec_tamper",
        severity: "critical",
        details: "Agent specification has been tampered with",
        detectedAt: new Date(),
        recommendedAction: "Investigate and rollback to last valid version",
      });
      continue;
    }

    // Check 3: Expiry
    if (agent.expiresAt && new Date(agent.expiresAt) < new Date()) {
      reports.push({
        agentId: agent.id,
        agentName: agent.name,
        driftType: "expired",
        severity: "medium",
        details: `Agent expired on ${new Date(agent.expiresAt).toISOString()}`,
        detectedAt: new Date(),
        recommendedAction: "Renew or archive agent",
      });
    }
  }

  // Build summary
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const report of reports) {
    byType[report.driftType] = (byType[report.driftType] || 0) + 1;
    bySeverity[report.severity] = (bySeverity[report.severity] || 0) + 1;
  }

  return {
    totalDrifted: reports.length,
    byType,
    bySeverity,
    reports,
  };
}

/**
 * Detect drift for a single agent
 */
export async function detectAgentDrift(agentId: string): Promise<DriftReport | null> {
  const summary = await detectDrift();
  return summary.reports.find((r) => r.agentId === agentId) || null;
}

/**
 * Schedule drift detection to run every 10 minutes
 */
export function scheduleDriftDetection(callback: (summary: DriftSummary) => void) {
  const INTERVAL = 10 * 60 * 1000; // 10 minutes

  const runDetection = async () => {
    try {
      const summary = await detectDrift();
      callback(summary);
    } catch (error) {
      console.error("[DriftDetector] Error detecting drift:", error);
    }
  };

  // Run immediately
  runDetection();

  // Schedule recurring runs
  setInterval(runDetection, INTERVAL);
}

/**
 * Get drift history for an agent
 */
export async function getAgentDriftHistory(agentId: string, limit = 10): Promise<DriftReport[]> {
  // In production, this would query a drift_history table
  // For now, return current drift status
  const drift = await detectAgentDrift(agentId);
  return drift ? [drift] : [];
}
