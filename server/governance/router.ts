/**
 * Governance Router — Governance Bible CGT v2
 *
 * tRPC endpoints for governance operations:
 *   - Self-check (runtime governance health)
 *   - Architecture validation
 *   - Risk classification
 *   - Publication gate evaluation
 *   - Lifecycle transition validation
 *   - RBAC info
 *   - Drift detection trigger
 *   - Governance metrics
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getGovernanceEngine } from "./governance-engine";
import { runSelfCheck } from "./self-check";
import { validateArchitecture } from "./architecture-validator";
import { evaluatePublication } from "./publication-gate";
import {
  validateTransition,
  getStageFromTags,
  canTransitionFromTags,
  LIFECYCLE_STAGES,
} from "./lifecycle-guard";
import {
  hasPermission,
  getPermissions,
  GOVERNANCE_ROLES,
  PERMISSION_ACTIONS,
  normalizeRole,
  type PermissionAction,
} from "./rbac-model";
import {
  buildRiskReport,
  createFinding,
  getSeverityAction,
  type RiskCategory,
} from "./risk-classifier";
import { getGovernanceMetrics } from "../services/governanceMetrics";
import { getGovernanceLogger } from "../services/governanceLogger";
import { getAuditLogger } from "../services/auditLogger";

export const governanceRouter = router({
  // ── Self-Check ──────────────────────────────────────────────────────
  /**
   * Runtime governance health check.
   * Returns compliance status, check results, risk report, metrics.
   */
  selfCheck: protectedProcedure.query(async ({ ctx }) => {
    const engine = getGovernanceEngine();
    engine.enforcePermission(
      ctx.user.role || "user",
      "governance.self_check",
      { actorId: String(ctx.user.id) }
    );

    return runSelfCheck();
  }),

  // ── Architecture Validation ─────────────────────────────────────────
  /**
   * Validate current architecture compliance.
   */
  validateArchitecture: adminProcedure.query(async () => {
    return validateArchitecture();
  }),

  // ── Engine Status ───────────────────────────────────────────────────
  /**
   * Get governance engine status.
   */
  status: protectedProcedure.query(async () => {
    const engine = getGovernanceEngine();
    return engine.getStatus();
  }),

  // ── Publication Gate ────────────────────────────────────────────────
  /**
   * Evaluate whether an entry can be published.
   * Implements Triple Validation Rule.
   */
  evaluatePublication: adminProcedure
    .input(
      z.object({
        entryId: z.number(),
        entryName: z.string(),
        entryType: z.string(),
        tags: z.array(z.string()),
        description: z.string().optional(),
        config: z.any().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      return evaluatePublication({
        ...input,
        actorId: String(ctx.user.id),
        actorRole: ctx.user.role || "admin",
      });
    }),

  // ── Lifecycle Transition ────────────────────────────────────────────
  /**
   * Validate a lifecycle transition before executing it.
   */
  validateTransition: protectedProcedure
    .input(
      z.object({
        entryId: z.number(),
        entryName: z.string(),
        fromStage: z.enum(["submit", "register", "validate", "publish", "catalog"]),
        toStage: z.enum(["submit", "register", "validate", "publish", "catalog"]),
      })
    )
    .query(async ({ input, ctx }) => {
      return validateTransition({
        ...input,
        actorId: String(ctx.user.id),
        actorRole: ctx.user.role || "user",
      });
    }),

  /**
   * Get current lifecycle stage from tags.
   */
  getStageFromTags: protectedProcedure
    .input(z.object({ tags: z.array(z.string()) }))
    .query(async ({ input }) => {
      const stage = getStageFromTags(input.tags);
      return { stage, stages: LIFECYCLE_STAGES };
    }),

  /**
   * Check if a transition is valid from current tags.
   */
  canTransition: protectedProcedure
    .input(
      z.object({
        tags: z.array(z.string()),
        targetStage: z.enum(["submit", "register", "validate", "publish", "catalog"]),
      })
    )
    .query(async ({ input }) => {
      return canTransitionFromTags(input.tags, input.targetStage);
    }),

  // ── RBAC ────────────────────────────────────────────────────────────
  /**
   * Check if current user has a specific permission.
   */
  checkPermission: protectedProcedure
    .input(z.object({ action: z.string() }))
    .query(async ({ input, ctx }) => {
      const role = normalizeRole(ctx.user.role || "user");
      const allowed = hasPermission(role, input.action as PermissionAction);
      return { role, action: input.action, allowed };
    }),

  /**
   * Get all permissions for current user's role.
   */
  myPermissions: protectedProcedure.query(async ({ ctx }) => {
    const role = normalizeRole(ctx.user.role || "user");
    return {
      role,
      permissions: getPermissions(role),
      allRoles: [...GOVERNANCE_ROLES],
      allActions: [...PERMISSION_ACTIONS],
    };
  }),

  // ── Risk Classification ─────────────────────────────────────────────
  /**
   * Classify a risk finding and get severity action.
   */
  classifyRisk: protectedProcedure
    .input(
      z.object({
        category: z.string(),
        title: z.string(),
        description: z.string(),
        target: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const finding = createFinding(
        input.category as RiskCategory,
        input.title,
        input.description,
        input.target
      );
      return {
        finding,
        action: getSeverityAction(finding.severity),
      };
    }),

  // ── Metrics ─────────────────────────────────────────────────────────
  /**
   * Get governance metrics (Prometheus format).
   */
  metrics: adminProcedure.query(async () => {
    const metrics = getGovernanceMetrics();
    return {
      json: metrics.toJSON(),
      prometheus: metrics.export(),
    };
  }),

  // ── Audit Logs ──────────────────────────────────────────────────────
  /**
   * Get recent governance audit logs.
   */
  auditLogs: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(500).optional() }))
    .query(async ({ input, ctx }) => {
      const engine = getGovernanceEngine();
      engine.enforcePermission(
        ctx.user.role || "user",
        "audit.read",
        { actorId: String(ctx.user.id) }
      );

      const logger = getGovernanceLogger();
      const logs = await logger.getRecentLogsFromDb(input.limit || 100);
      return logs;
    }),

  /**
   * Get recent unified audit events.
   */
  auditEvents: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(500).optional() }))
    .query(async ({ input, ctx }) => {
      const engine = getGovernanceEngine();
      engine.enforcePermission(
        ctx.user.role || "user",
        "audit.read",
        { actorId: String(ctx.user.id) }
      );

      const auditLogger = getAuditLogger();
      return auditLogger.getRecent(input.limit || 50);
    }),
});
