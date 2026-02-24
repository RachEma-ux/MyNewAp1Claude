/**
 * Unified Audit Logger
 *
 * Captures security-relevant operations across the platform:
 * provider management, secret lifecycle, auth events, policy changes.
 * Persists to the governance_audit_logs table.
 */

import { randomUUID } from "crypto";
import { getDb } from "../db";
import { governanceAuditLogs } from "../../drizzle/schema";

export type AuditActionType =
  | "PROVIDER_CONNECT"
  | "PROVIDER_UPDATE"
  | "PROVIDER_DELETE"
  | "SECRET_CREATE"
  | "SECRET_UPDATE"
  | "SECRET_DELETE"
  | "POLICY_CREATE"
  | "POLICY_UPDATE"
  | "POLICY_DELETE"
  | "AUTH_SESSION_CREATE"
  | "ADMIN_ROLE_CHANGE"
  // CGT v2 — Lifecycle & Governance
  | "LIFECYCLE_TRANSITION"
  | "LIFECYCLE_CHANGE"
  | "PUBLICATION_GATE"
  | "RBAC_DENIAL"
  | "GATE_CHECK"
  | "FREEZE_BLOCK"
  | "PRIVILEGE_ESCALATION_ATTEMPT"
  | "GOVERNANCE_SELF_CHECK"
  | "ARCHITECTURE_VALIDATION"
  | "DRIFT_DETECTION"
  | "RISK_CLASSIFICATION"
  // Discovery Artifact Governance v1
  | "DISCOVERY_ATTEMPT";

export interface AuditEvent {
  event_id: string;
  timestamp: Date;
  actor_id: string | null;
  workspace_id: string | null;
  action_type: AuditActionType;
  target_type: string;
  target_id: string | null;
  decision_result: "success" | "failure" | "denied" | "attempted" | "blocked";
  metadata?: Record<string, unknown>;
}

class AuditLogger {
  private buffer: AuditEvent[] = [];

  /**
   * Record an audit event. Persists to DB with blocking write.
   * Failure to persist throws — callers must handle or propagate.
   */
  async log(params: {
    actor_id?: string | null;
    workspace_id?: string | null;
    action_type: AuditActionType;
    target_type: string;
    target_id?: string | null;
    decision_result: "success" | "failure" | "denied" | "attempted" | "blocked";
    metadata?: Record<string, unknown>;
  }): Promise<AuditEvent> {
    const event: AuditEvent = {
      event_id: randomUUID(),
      timestamp: new Date(),
      actor_id: params.actor_id ?? null,
      workspace_id: params.workspace_id ?? null,
      action_type: params.action_type,
      target_type: params.target_type,
      target_id: params.target_id ?? null,
      decision_result: params.decision_result,
      metadata: params.metadata,
    };

    // In-memory buffer (capped at 500)
    this.buffer.push(event);
    if (this.buffer.length > 500) {
      this.buffer.shift();
    }

    console.log(`[Audit] ${event.action_type} ${event.target_type}:${event.target_id ?? "?"} → ${event.decision_result}`);

    // Blocking persist — failure propagates to caller
    await this.persistToDb(event);

    return event;
  }

  private async persistToDb(event: AuditEvent): Promise<void> {
    const db = getDb();
    if (!db) return;

    await db.insert(governanceAuditLogs).values({
      code: event.action_type,
      agentId: null,
      workspaceId: event.workspace_id,
      actorId: event.actor_id,
      decision: event.decision_result,
      reason: `${event.target_type}:${event.target_id ?? "unknown"}`,
      details: {
        event_id: event.event_id,
        target_type: event.target_type,
        target_id: event.target_id,
        ...(event.metadata ?? {}),
      },
    });
  }

  /**
   * Get recent events from in-memory buffer.
   */
  getRecent(limit: number = 50): AuditEvent[] {
    return this.buffer.slice(-limit);
  }

  /**
   * Clear buffer (for testing).
   */
  clear(): void {
    this.buffer = [];
  }
}

let _auditLogger: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!_auditLogger) {
    _auditLogger = new AuditLogger();
  }
  return _auditLogger;
}
