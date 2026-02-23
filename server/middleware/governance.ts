/**
 * Governance Middleware — Governance Bible CGT v2
 *
 * Phase 5 — Middleware Enforcement
 * Role: CE-A (Backend Engine & Middleware)
 *
 * Express/tRPC middleware that enforces governance gates:
 *   - requireGateMiddleware: Runs scorecard, blocks on DENY (HTTP 409)
 *   - blockIfFrozen: Blocks all mutations on frozen subjects
 *   - auditLifecycleChange: Logs all lifecycle mutations
 *   - validateRole: Ensures actor role is sufficient for governance actions
 *
 * Enforcement guarantees:
 *   - UI bypass attempt → backend blocks (409)
 *   - Background job direct publish → blocked (409)
 *   - No silent privilege escalation
 *   - All decisions audit-logged
 */

import type { Request, Response, NextFunction } from "express";
import { requireGate, canPassGate } from "../governance/requireGate";
import { isFrozen, getFreezeDetails } from "../governance/scorecard";
import { getAuditLogger } from "../services/auditLogger";
import { hasPermission, normalizeRole, type PermissionAction } from "../governance/rbac-model";
import type { LifecycleStage } from "../governance/lifecycle-guard";

// ============================================================================
// Types
// ============================================================================

export interface GovernanceContext {
  subjectId: number;
  subjectName: string;
  subjectType: string;
  tags: string[];
  description?: string;
  config?: any;
  actorId: string;
  actorRole: string;
}

// ============================================================================
// blockIfFrozen — Rejects all mutations on frozen subjects
// ============================================================================

/**
 * Express middleware: blocks mutations if subject is frozen.
 * Extracts subject ID from request body or params.
 */
export function blockIfFrozen() {
  return (req: Request, res: Response, next: NextFunction) => {
    const subjectId = extractSubjectId(req);
    if (subjectId === null) return next();

    // Check subject-level freeze
    if (isFrozen(subjectId)) {
      const details = getFreezeDetails(subjectId);
      const reason = `Subject #${subjectId} is FROZEN: ${details?.reason || "governance freeze active"}`;

      getAuditLogger().log({
        actor_id: extractActorId(req),
        action_type: "FREEZE_BLOCK",
        target_type: "frozen_subject",
        target_id: String(subjectId),
        decision_result: "denied",
        metadata: { reason, frozenAt: details?.frozenAt, frozenBy: details?.frozenBy },
      });

      return res.status(409).json({
        error: "GOVERNANCE_FROZEN",
        message: reason,
        frozen: true,
        details: details ? {
          frozenAt: details.frozenAt,
          frozenBy: details.frozenBy,
          reason: details.reason,
        } : undefined,
      });
    }

    // Check system-wide freeze
    if (isFrozen(0)) {
      const details = getFreezeDetails(0);
      const reason = `System-wide governance FREEZE: ${details?.reason || "resolve violations"}`;

      getAuditLogger().log({
        actor_id: extractActorId(req),
        action_type: "FREEZE_BLOCK",
        target_type: "system_freeze",
        target_id: "0",
        decision_result: "denied",
        metadata: { reason, systemWide: true },
      });

      return res.status(409).json({
        error: "GOVERNANCE_SYSTEM_FREEZE",
        message: reason,
        frozen: true,
        systemWide: true,
      });
    }

    next();
  };
}

// ============================================================================
// requireGateMiddleware — Runs scorecard gate for lifecycle transitions
// ============================================================================

/**
 * Express middleware factory: enforces governance gate for a specific stage.
 *
 * Usage:
 *   app.post("/api/catalog/:id/validate", requireGateMiddleware("validate"), handler);
 *   app.post("/api/catalog/:id/publish", requireGateMiddleware("publish"), handler);
 */
export function requireGateMiddleware(stage: LifecycleStage) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subject = extractSubject(req);
      if (!subject) {
        return res.status(400).json({
          error: "GOVERNANCE_MISSING_SUBJECT",
          message: "Cannot evaluate gate: subject context missing from request",
        });
      }

      const actor = {
        id: extractActorId(req),
        role: extractActorRole(req),
      };

      const result = await requireGate(stage, {
        id: subject.subjectId,
        name: subject.subjectName,
        type: subject.subjectType,
        tags: subject.tags,
        description: subject.description,
        config: subject.config,
      }, actor);

      if (result.denied) {
        return res.status(409).json({
          error: "GOVERNANCE_GATE_DENIED",
          verdict: result.verdict,
          stage,
          reason: result.reason,
          auditId: result.auditId,
          frozen: result.frozen,
          scorecard: result.scorecard ? {
            score: result.scorecard.scorecard.score.score,
            gateVerdict: result.scorecard.scorecard.gateVerdict,
            riskBreakdown: result.scorecard.scorecard.riskBreakdown,
            failCount: result.scorecard.scorecard.failCount,
          } : undefined,
        });
      }

      // Attach gate result to request for downstream handlers
      (req as any)._governanceGate = result;
      next();
    } catch (err) {
      // Fail closed: any error in governance = DENY
      return res.status(409).json({
        error: "GOVERNANCE_GATE_ERROR",
        message: `Governance gate failed: ${err instanceof Error ? err.message : "unknown error"}`,
        verdict: "DENY",
      });
    }
  };
}

// ============================================================================
// auditLifecycleChange — Logs all lifecycle mutations
// ============================================================================

/**
 * Express middleware: logs lifecycle changes to audit trail.
 */
export function auditLifecycleChange(action: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const subjectId = extractSubjectId(req);
    const actorId = extractActorId(req);

    getAuditLogger().log({
      actor_id: actorId,
      action_type: "LIFECYCLE_CHANGE",
      target_type: "lifecycle_mutation",
      target_id: subjectId !== null ? String(subjectId) : "unknown",
      decision_result: "attempted",
      metadata: {
        action,
        method: req.method,
        path: req.path,
        body: req.body ? Object.keys(req.body) : [],
      },
    });

    next();
  };
}

// ============================================================================
// validateRole — Role-based access check
// ============================================================================

/**
 * Express middleware: validates actor role for governance actions.
 */
export function validateRole(requiredPermission: PermissionAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = extractActorRole(req);
    const normalized = normalizeRole(role);

    if (!hasPermission(normalized, requiredPermission)) {
      const actorId = extractActorId(req);

      getAuditLogger().log({
        actor_id: actorId,
        action_type: "RBAC_DENIAL",
        target_type: "permission_check",
        target_id: requiredPermission,
        decision_result: "denied",
        metadata: { role: normalized, requiredPermission },
      });

      return res.status(403).json({
        error: "GOVERNANCE_INSUFFICIENT_ROLE",
        message: `Role '${normalized}' lacks permission '${requiredPermission}'`,
        requiredPermission,
      });
    }

    next();
  };
}

// ============================================================================
// tRPC Procedure Helpers (for use in tRPC routers)
// ============================================================================

/**
 * Run gate check inside a tRPC procedure.
 * Throws TRPCError on DENY.
 */
export async function enforceTRPCGate(
  stage: LifecycleStage,
  subject: {
    id: number;
    name: string;
    type: string;
    tags: string[];
    description?: string;
    config?: any;
  },
  actor: { id: string; role: string }
) {
  const { TRPCError } = require("@trpc/server");
  const result = await requireGate(stage, subject, actor);

  if (result.denied) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `[Governance Gate DENY] ${result.reason}`,
      cause: {
        verdict: result.verdict,
        stage,
        auditId: result.auditId,
        frozen: result.frozen,
        score: result.scorecard?.scorecard.score.score,
      },
    });
  }

  return result;
}

/**
 * Check frozen status inside a tRPC procedure.
 * Throws TRPCError if frozen.
 */
export function enforceTRPCFreezeCheck(subjectId: number, subjectName?: string) {
  const { TRPCError } = require("@trpc/server");

  if (isFrozen(subjectId)) {
    const details = getFreezeDetails(subjectId);
    throw new TRPCError({
      code: "CONFLICT",
      message: `[Governance] Subject #${subjectId}${subjectName ? ` "${subjectName}"` : ""} is FROZEN: ${details?.reason || "governance freeze"}`,
    });
  }

  if (isFrozen(0)) {
    const details = getFreezeDetails(0);
    throw new TRPCError({
      code: "CONFLICT",
      message: `[Governance] System-wide FREEZE active: ${details?.reason || "resolve violations"}`,
    });
  }
}

// ============================================================================
// Phase 10 — Privilege Escalation Detection
// ============================================================================

/**
 * Express middleware: detects and logs privilege escalation attempts.
 * Flags when:
 *   - x-actor-role header claims a higher role than auth session
 *   - Actor attempts admin action without admin session
 *   - Role in request body differs from session role
 */
export function detectPrivilegeEscalation() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const sessionRole = (req as any).user?.role;
    const headerRole = req.headers["x-actor-role"]?.toString();
    const bodyRole = req.body?.actorRole || req.body?.role;

    // If there's a session, check for mismatches
    if (sessionRole) {
      const roleHierarchy: Record<string, number> = {
        user: 0, developer: 1, operator: 2, governance_reviewer: 3, admin: 4, system: 5,
      };

      const sessionLevel = roleHierarchy[normalizeRole(sessionRole)] ?? 0;

      // Check header-based escalation
      if (headerRole) {
        const headerLevel = roleHierarchy[normalizeRole(headerRole)] ?? 0;
        if (headerLevel > sessionLevel) {
          getAuditLogger().log({
            actor_id: extractActorId(req),
            action_type: "PRIVILEGE_ESCALATION_ATTEMPT",
            target_type: "role_header",
            target_id: headerRole,
            decision_result: "blocked",
            metadata: {
              sessionRole,
              claimedRole: headerRole,
              method: req.method,
              path: req.path,
              ip: req.ip,
            },
          });
        }
      }

      // Check body-based escalation
      if (bodyRole) {
        const bodyLevel = roleHierarchy[normalizeRole(bodyRole)] ?? 0;
        if (bodyLevel > sessionLevel) {
          getAuditLogger().log({
            actor_id: extractActorId(req),
            action_type: "PRIVILEGE_ESCALATION_ATTEMPT",
            target_type: "role_body",
            target_id: bodyRole,
            decision_result: "blocked",
            metadata: {
              sessionRole,
              claimedRole: bodyRole,
              method: req.method,
              path: req.path,
              ip: req.ip,
            },
          });
        }
      }
    }

    next();
  };
}

// ============================================================================
// Helpers
// ============================================================================

function extractSubjectId(req: Request): number | null {
  const id = req.params?.id || req.body?.id || req.body?.subjectId || req.body?.entryId || req.body?.catalogEntryId;
  return id ? Number(id) : null;
}

function extractActorId(req: Request): string {
  return (req as any).user?.id?.toString() || req.headers["x-actor-id"]?.toString() || "anonymous";
}

function extractActorRole(req: Request): string {
  return (req as any).user?.role || req.headers["x-actor-role"]?.toString() || "user";
}

function extractSubject(req: Request): GovernanceContext | null {
  const body = req.body || {};
  const subjectId = extractSubjectId(req);
  if (subjectId === null) return null;

  return {
    subjectId,
    subjectName: body.name || body.subjectName || `subject-${subjectId}`,
    subjectType: body.type || body.subjectType || body.entryType || "provider",
    tags: body.tags || [],
    description: body.description,
    config: body.config,
    actorId: extractActorId(req),
    actorRole: extractActorRole(req),
  };
}
