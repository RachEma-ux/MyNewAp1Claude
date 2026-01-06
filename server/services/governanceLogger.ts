/**
 * Governance Logger
 * Phase 7: Observability & Audit
 * 
 * Structured logging for governance events with decision codes
 */

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

    // Also log to console for debugging
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
   * Store log entry
   */
  private log(entry: LogEntry): void {
    this.logs.push(entry);

    // Keep only last 1000 logs in memory
    if (this.logs.length > 1000) {
      this.logs.shift();
    }
  }

  /**
   * Get recent logs
   */
  getRecentLogs(limit: number = 100): LogEntry[] {
    return this.logs.slice(-limit);
  }

  /**
   * Get logs by agent
   */
  getLogsByAgent(agentId: number): LogEntry[] {
    return this.logs.filter((log) => log.agentId === agentId);
  }

  /**
   * Get logs by workspace
   */
  getLogsByWorkspace(workspaceId: string): LogEntry[] {
    return this.logs.filter((log) => log.workspaceId === workspaceId);
  }

  /**
   * Clear all logs (for testing)
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
