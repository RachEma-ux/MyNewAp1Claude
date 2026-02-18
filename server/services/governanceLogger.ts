/**
 * Governance Logger
 * Phase 7: Observability & Audit
 *
 * Structured logging for governance events with decision codes.
 * Persists to governance_audit_logs table AND keeps in-memory buffer.
 */

import { getDb } from "../db";
import { governanceAuditLogs } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

export type DecisionCode =
  | "ADMISSION_ALLOW"
  | "ADMISSION_DENY_PROOF_MISSING"
  | "ADMISSION_DENY_SPEC_HASH_MISMATCH"
  | "ADMISSION_DENY_POLICY_HASH_MISMATCH"
  | "ADMISSION_DENY_SIGNER_REVOKED"
  | "ADMISSION_DENY_SIGNATURE_INVALID"
  | "ADMISSION_DENY_SANDBOX_EXPIRED"
  | "ADMISSION_DENY_CONTAINMENT_VIOLATION"
  | "PROMOTION_ATTEMPT"
  | "PROMOTION_DENIED"
  | "PROMOTION_SUCCESS"
  | "POLICY_HOTRELOAD"
  | "POLICY_REVALIDATION";

export interface LogEntry {
  timestamp: Date;
  code: DecisionCode;
  agentId?: number;
  workspaceId?: string;
  actorId?: string;
  decision?: "allow" | "deny";
  reason?: string;
  details?: Record<string, any>;
}

class GovernanceLogger {
  private logs: LogEntry[] = [];

  /**
   * Log admission decision
   */
  logAdmission(params: {
    agentId: number;
    workspaceId: string;
    decision: "allow" | "deny";
    reason?: string;
    errorCodes?: string[];
  }): void {
    const code: DecisionCode = params.decision === "allow"
      ? "ADMISSION_ALLOW"
      : (params.errorCodes?.[0] as any) || "ADMISSION_DENY_PROOF_MISSING";

    this.log({
      timestamp: new Date(),
      code,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      decision: params.decision,
      reason: params.reason,
      details: {
        errorCodes: params.errorCodes,
      },
    });

    console.log(`[Governance] ${code}`, {
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      decision: params.decision,
      reason: params.reason,
    });
  }

  /**
   * Log promotion attempt
   */
  logPromotion(params: {
    agentId: number;
    actorId: string;
    success: boolean;
    denies?: string[];
  }): void {
    const code: DecisionCode = params.success
      ? "PROMOTION_SUCCESS"
      : "PROMOTION_DENIED";

    this.log({
      timestamp: new Date(),
      code,
      agentId: params.agentId,
      actorId: params.actorId,
      details: {
        denies: params.denies,
      },
    });

    console.log(`[Governance] ${code}`, {
      agentId: params.agentId,
      actorId: params.actorId,
      denies: params.denies,
    });
  }

  /**
   * Log policy hot reload
   */
  logPolicyHotReload(params: {
    policySet: string;
    actorId: string;
    oldHash: string;
    newHash: string;
    reason?: string;
  }): void {
    this.log({
      timestamp: new Date(),
      code: "POLICY_HOTRELOAD",
      actorId: params.actorId,
      details: {
        policySet: params.policySet,
        oldHash: params.oldHash,
        newHash: params.newHash,
        reason: params.reason,
      },
    });

    console.log("[Governance] POLICY_HOTRELOAD", {
      policySet: params.policySet,
      oldHash: params.oldHash,
      newHash: params.newHash,
    });
  }

  /**
   * Log policy revalidation
   */
  logPolicyRevalidation(params: {
    policySet: string;
    agentCount: number;
    invalidatedCount: number;
    restrictedCount: number;
  }): void {
    this.log({
      timestamp: new Date(),
      code: "POLICY_REVALIDATION",
      details: {
        policySet: params.policySet,
        agentCount: params.agentCount,
        invalidatedCount: params.invalidatedCount,
        restrictedCount: params.restrictedCount,
      },
    });

    console.log("[Governance] POLICY_REVALIDATION", {
      policySet: params.policySet,
      agentCount: params.agentCount,
      invalidatedCount: params.invalidatedCount,
      restrictedCount: params.restrictedCount,
    });
  }

  /**
   * Store log entry in memory AND persist to database
   */
  private log(entry: LogEntry): void {
    // In-memory buffer (for fast reads without DB)
    this.logs.push(entry);
    if (this.logs.length > 1000) {
      this.logs.shift();
    }

    // Persist to database (fire and forget — don't block caller)
    this.persistToDb(entry).catch((err) => {
      console.error("[GovernanceLogger] Failed to persist audit log:", err);
    });
  }

  /**
   * Persist a log entry to the governance_audit_logs table
   */
  private async persistToDb(entry: LogEntry): Promise<void> {
    const db = getDb();
    if (!db) return; // Skip if DB not available (e.g., during startup)

    await db.insert(governanceAuditLogs).values({
      code: entry.code,
      agentId: entry.agentId ?? null,
      workspaceId: entry.workspaceId ?? null,
      actorId: entry.actorId ?? null,
      decision: entry.decision ?? null,
      reason: entry.reason ?? null,
      details: entry.details ?? null,
    });
  }

  /**
   * Get recent logs (from memory buffer for speed)
   */
  getRecentLogs(limit: number = 100): LogEntry[] {
    return this.logs.slice(-limit);
  }

  /**
   * Get recent logs from database (persistent, survives restarts)
   */
  async getRecentLogsFromDb(limit: number = 100): Promise<LogEntry[]> {
    const db = getDb();
    if (!db) return this.getRecentLogs(limit);

    const rows = await db
      .select()
      .from(governanceAuditLogs)
      .orderBy(desc(governanceAuditLogs.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      timestamp: row.createdAt,
      code: row.code as DecisionCode,
      agentId: row.agentId ?? undefined,
      workspaceId: row.workspaceId ?? undefined,
      actorId: row.actorId ?? undefined,
      decision: row.decision as "allow" | "deny" | undefined,
      reason: row.reason ?? undefined,
      details: (row.details as Record<string, any>) ?? undefined,
    }));
  }

  /**
   * Get logs by agent (from DB for full history)
   */
  async getLogsByAgentFromDb(agentId: number, limit: number = 100): Promise<LogEntry[]> {
    const db = getDb();
    if (!db) return this.logs.filter((log) => log.agentId === agentId);

    const rows = await db
      .select()
      .from(governanceAuditLogs)
      .where(eq(governanceAuditLogs.agentId, agentId))
      .orderBy(desc(governanceAuditLogs.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      timestamp: row.createdAt,
      code: row.code as DecisionCode,
      agentId: row.agentId ?? undefined,
      workspaceId: row.workspaceId ?? undefined,
      actorId: row.actorId ?? undefined,
      decision: row.decision as "allow" | "deny" | undefined,
      reason: row.reason ?? undefined,
      details: (row.details as Record<string, any>) ?? undefined,
    }));
  }

  /**
   * Get logs by agent (in-memory fast path)
   */
  getLogsByAgent(agentId: number): LogEntry[] {
    return this.logs.filter((log) => log.agentId === agentId);
  }

  /**
   * Get logs by workspace (in-memory fast path)
   */
  getLogsByWorkspace(workspaceId: string): LogEntry[] {
    return this.logs.filter((log) => log.workspaceId === workspaceId);
  }

  /**
   * Clear all in-memory logs (for testing)
   */
  clear(): void {
    this.logs = [];
  }
}

// Singleton instance
let _governanceLogger: GovernanceLogger | null = null;

export function getGovernanceLogger(): GovernanceLogger {
  if (!_governanceLogger) {
    _governanceLogger = new GovernanceLogger();
  }
  return _governanceLogger;
}
