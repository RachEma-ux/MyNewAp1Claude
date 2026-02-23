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
 *   - Governance metrics
 *   - Scorecard engine (run, latest, history, catalog, packs)
 *   - GovernedSubject validation
 *   - Drift detection (detect, status, toggle, history, freeze)
 *   - Evidence verification
 *
 * HTTP Semantics:
 *   - 200: scorecard passed, transition allowed
 *   - 409: scorecard blocked, transition denied (gate FAIL)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getCatalogEntryById, getEntryClassifications } from "../db/catalog";
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
  evaluateStageReview,
  executeStageTransition,
} from "./stage-review";
import {
  hasPermission,
  getPermissions,
  GOVERNANCE_ROLES,
  PERMISSION_ACTIONS,
  normalizeRole,
  type PermissionAction,
} from "./rbac-model";
import { lintCatalog } from "./catalog-lint";
import { generateGateCoverage } from "./gate-coverage";
import { runHardeningCheck } from "./production-hardening";
import { getArtifactStore } from "./artifact-store";
import {
  buildRiskReport,
  createFinding,
  getSeverityAction,
  type RiskCategory,
} from "./risk-classifier";
import { getGovernanceMetrics } from "../services/governanceMetrics";
import { getGovernanceLogger } from "../services/governanceLogger";
import { getAuditLogger } from "../services/auditLogger";
import {
  runScorecard,
  getLatestScorecard,
  getScorecardHistory,
  CONTROL_CATALOG,
  getActiveControls,
  getControlsByPack,
  getAllRunners,
  verifyBundleIntegrity,
  detectDrift,
  getLastDriftReport,
  getDriftHistory,
  isDriftDetectionActive,
  startDriftDetection,
  stopDriftDetection,
  getFrozenSubjects,
  unfreezeSubject,
  isFrozen,
  validateSubject,
  SUBJECT_TYPES,
  resolvePacks,
  getAvailablePacks,
} from "./scorecard";

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
      return await evaluatePublication({
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
        fromStage: z.enum(["submit", "register", "validate", "publish", "catalog", "mutate"]),
        toStage: z.enum(["submit", "register", "validate", "publish", "catalog", "mutate"]),
      })
    )
    .query(async ({ input, ctx }) => {
      return await validateTransition({
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
        targetStage: z.enum(["submit", "register", "validate", "publish", "catalog", "mutate"]),
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

  // ── Scorecard Engine ──────────────────────────────────────────────────

  /**
   * Run the governance scorecard for a given lifecycle stage.
   * Returns score (0–100), gate status, risk breakdown, control results, and evidence bundle.
   *
   * HTTP semantics:
   *   - Returns result with httpStatus 200 on pass
   *   - Throws TRPC CONFLICT (409) on blocked transition
   *
   * Accepts either legacy `entry` format or new `subject` (GovernedSubject) format.
   */
  scorecardRun: adminProcedure
    .input(
      z.object({
        stage: z.enum(["submit", "register", "validate", "publish", "catalog", "mutate"]),
        subject: z.object({
          id: z.number(),
          name: z.string(),
          type: z.enum(["provider", "llm", "model", "agent", "bot", "system"]),
          tags: z.array(z.string()),
          description: z.string().optional(),
          config: z.any().optional(),
          metadata: z.record(z.string(), z.any()).optional(),
        }).optional(),
        entry: z.object({
          id: z.number(),
          name: z.string(),
          type: z.string(),
          tags: z.array(z.string()),
          description: z.string().optional(),
          config: z.any().optional(),
        }).optional(),
        stageOnly: z.boolean().optional(),
        commitRef: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Check freeze status
      const subjectId = input.subject?.id ?? input.entry?.id;
      if (subjectId != null && isFrozen(subjectId)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Subject #${subjectId} is FROZEN — all transitions blocked until unfrozen. Run drift detection or contact governance admin.`,
        });
      }

      // Check system-wide freeze
      if (isFrozen(0)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "System-wide governance FREEZE active — all transitions blocked. Resolve drift violations first.",
        });
      }

      const result = await runScorecard({
        stage: input.stage,
        subject: input.subject as any,
        entry: input.entry,
        actor: { id: String(ctx.user.id), role: ctx.user.role || "admin" },
        stageOnly: input.stageOnly,
        commitRef: input.commitRef,
      });

      // 409 semantics: throw CONFLICT on blocked transition
      if (result.blocked) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Stage gate FAIL for ${input.stage}: ${result.scorecard.gateStatus.reason}`,
          cause: result,
        });
      }

      return result;
    }),

  /**
   * Run scorecard without 409 enforcement (read-only mode for UI display).
   * Always returns the full result regardless of gate status.
   */
  scorecardPreview: protectedProcedure
    .input(
      z.object({
        stage: z.enum(["submit", "register", "validate", "publish", "catalog", "mutate"]),
        subject: z.object({
          id: z.number(),
          name: z.string(),
          type: z.enum(["provider", "llm", "model", "agent", "bot", "system"]),
          tags: z.array(z.string()),
          description: z.string().optional(),
          config: z.any().optional(),
          metadata: z.record(z.string(), z.any()).optional(),
        }).optional(),
        entry: z.object({
          id: z.number(),
          name: z.string(),
          type: z.string(),
          tags: z.array(z.string()),
          description: z.string().optional(),
          config: z.any().optional(),
        }).optional(),
        stageOnly: z.boolean().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      return await runScorecard({
        stage: input.stage,
        subject: input.subject as any,
        entry: input.entry,
        actor: { id: String(ctx.user.id), role: ctx.user.role || "user" },
        stageOnly: input.stageOnly,
      });
    }),

  /**
   * Get the latest scorecard result (cached).
   */
  scorecardLatest: protectedProcedure.query(async () => {
    return getLatestScorecard();
  }),

  /**
   * Get scorecard history.
   */
  scorecardHistory: protectedProcedure.query(async () => {
    return getScorecardHistory();
  }),

  /**
   * Get the control catalog (all defined controls).
   */
  controlCatalog: protectedProcedure.query(async () => {
    return {
      controls: CONTROL_CATALOG,
      activeControls: getActiveControls(),
      runners: getAllRunners().map((r) => ({ id: r.id, name: r.name })),
      subjectTypes: [...SUBJECT_TYPES],
      availablePacks: getAvailablePacks(),
    };
  }),

  /**
   * Get controls for a specific pack.
   */
  controlsByPack: protectedProcedure
    .input(z.object({ pack: z.string() }))
    .query(async ({ input }) => {
      return getControlsByPack(input.pack as any);
    }),

  /**
   * Verify evidence bundle integrity.
   */
  verifyEvidence: protectedProcedure
    .input(z.object({ bundle: z.any() }))
    .query(async ({ input }) => {
      const valid = verifyBundleIntegrity(input.bundle);
      return { valid, bundleId: input.bundle?.bundleId };
    }),

  // ── GovernedSubject Validation ────────────────────────────────────────

  /**
   * Validate a GovernedSubject contract before scorecard evaluation.
   */
  validateSubject: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string(),
      type: z.string(),
      tags: z.array(z.string()),
      description: z.string().optional(),
      config: z.any().optional(),
      metadata: z.record(z.string(), z.any()).optional(),
    }))
    .query(async ({ input }) => {
      return validateSubject(input);
    }),

  /**
   * Resolve packs for a subject type.
   */
  resolvePacks: protectedProcedure
    .input(z.object({
      subjectType: z.enum(["provider", "llm", "model", "agent", "bot", "system"]),
      stage: z.enum(["submit", "register", "validate", "publish", "catalog", "mutate"]).optional(),
    }))
    .query(async ({ input }) => {
      const resolution = resolvePacks(input.subjectType, input.stage);
      return {
        ...resolution,
        controls: resolution.controls.map((c) => ({
          id: c.id,
          name: c.name,
          pack: c.pack,
          severity: c.severity,
          domain: c.domain,
        })),
      };
    }),

  // ── Stage Review (Per-Stage Checklist) ──────────────────────────────

  /**
   * Preview stage review checklist status for a catalog entry.
   * Read-only — no side effects. Returns all checklist items with pass/fail.
   */
  stageReview: protectedProcedure
    .input(
      z.object({
        entryId: z.number(),
        targetStage: z.enum(["submit", "register", "validate", "publish", "catalog", "mutate"]),
      })
    )
    .query(async ({ input, ctx }) => {
      const { targetStage, entryId } = input;
      // Always fetch fresh entry + classifications from DB to avoid stale client cache
      const entry = await getCatalogEntryById(entryId);
      if (!entry) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });
      }
      const classifications = await getEntryClassifications(entryId);
      return evaluateStageReview(
        {
          id: entry.id,
          name: entry.name,
          entryType: entry.entryType,
          tags: (entry.tags as string[]) || [],
          description: entry.description || undefined,
          config: entry.config || undefined,
          reviewState: (entry as any).reviewState || undefined,
          status: entry.status || undefined,
          validationStatus: (entry as any).validationStatus || undefined,
          classifications: classifications.map(c => c.label),
        },
        targetStage,
        { id: String(ctx.user.id), role: ctx.user.role || "user" }
      );
    }),

  /**
   * Execute a governed stage transition.
   * Runs stage review + lifecycle guard + publication gate (for publish).
   * Returns 409 CONFLICT if blocked. On success, returns new tags.
   * Uses protectedProcedure — RBAC is enforced within the stage review checklist.
   */
  stageTransition: protectedProcedure
    .input(
      z.object({
        entryId: z.number(),
        targetStage: z.enum(["submit", "register", "validate", "publish", "catalog", "mutate"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { targetStage, entryId } = input;
      // Always fetch fresh entry + classifications from DB
      const dbEntry = await getCatalogEntryById(entryId);
      if (!dbEntry) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });
      }
      const classifications = await getEntryClassifications(entryId);
      const entry = {
        id: dbEntry.id,
        name: dbEntry.name,
        entryType: dbEntry.entryType,
        tags: (dbEntry.tags as string[]) || [],
        description: dbEntry.description || undefined,
        config: dbEntry.config || undefined,
        reviewState: (dbEntry as any).reviewState || undefined,
        status: dbEntry.status || undefined,
        validationStatus: (dbEntry as any).validationStatus || undefined,
        classifications: classifications.map(c => c.label),
      };
      const actor = { id: String(ctx.user.id), role: ctx.user.role || "admin" };

      // Check freeze status
      if (isFrozen(entryId)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Subject #${entryId} is FROZEN — all transitions blocked until unfrozen.`,
        });
      }
      if (isFrozen(0)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "System-wide governance FREEZE active — all transitions blocked.",
        });
      }

      const result = await executeStageTransition(entry, targetStage, actor);

      if (!result.allowed) {
        throw new TRPCError({
          code: "CONFLICT",
          message: result.reason,
          cause: {
            stageReview: result.stageReview,
            transitionResult: result.transitionResult,
            publicationDecision: result.publicationDecision,
          },
        });
      }

      return {
        allowed: true,
        newTags: result.newTags,
        stageReview: result.stageReview,
        reason: result.reason,
      };
    }),

  // ── Drift Detection ──────────────────────────────────────────────────

  /**
   * Trigger a manual drift detection check.
   */
  driftDetect: adminProcedure.query(async () => {
    return detectDrift();
  }),

  /**
   * Get the latest drift report.
   */
  driftLatest: protectedProcedure.query(async () => {
    return getLastDriftReport();
  }),

  /**
   * Get drift detection history.
   */
  driftHistory: protectedProcedure.query(async () => {
    return getDriftHistory();
  }),

  /**
   * Get drift detection status.
   */
  driftStatus: protectedProcedure.query(async () => {
    const frozen = await getFrozenSubjects();
    return {
      active: isDriftDetectionActive(),
      frozenSubjects: frozen,
      frozenCount: frozen.length,
    };
  }),

  /**
   * Start/stop drift detection.
   */
  driftToggle: adminProcedure
    .input(z.object({
      active: z.boolean(),
      intervalMs: z.number().optional(),
      autoFreeze: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.active) {
        startDriftDetection({
          intervalMs: input.intervalMs,
          autoFreeze: input.autoFreeze,
        });
      } else {
        stopDriftDetection();
      }

      const audit = getAuditLogger();
      audit.log({
        actor_id: String(ctx.user.id),
        action_type: "DRIFT_DETECTION",
        target_type: "drift_toggle",
        target_id: "system",
        decision_result: "success",
        metadata: { active: input.active, intervalMs: input.intervalMs, autoFreeze: input.autoFreeze },
      });

      return { active: isDriftDetectionActive() };
    }),

  // ── Freeze Management ──────────────────────────────────────────────

  /**
   * Get all frozen subjects.
   */
  frozenSubjects: protectedProcedure.query(async () => {
    return getFrozenSubjects();
  }),

  /**
   * Unfreeze a subject (admin only).
   */
  unfreezeSubject: adminProcedure
    .input(z.object({ subjectId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const unfrozen = await unfreezeSubject(input.subjectId, String(ctx.user.id));
      return { unfrozen, subjectId: input.subjectId };
    }),

  /**
   * Check if a specific subject is frozen.
   */
  isFrozen: protectedProcedure
    .input(z.object({ subjectId: z.number() }))
    .query(async ({ input }) => {
      return { frozen: isFrozen(input.subjectId), subjectId: input.subjectId };
    }),

  // ── Production Lockdown Endpoints (Phase 8–10) ─────────────────────

  /**
   * Run catalog lint — validates control catalog quality.
   */
  catalogLint: adminProcedure.query(async () => {
    return lintCatalog();
  }),

  /**
   * Generate gate coverage map — scans routers for enforcement gaps.
   */
  gateCoverage: adminProcedure.query(async () => {
    return generateGateCoverage();
  }),

  /**
   * Run production hardening check — validates security controls.
   */
  hardeningCheck: adminProcedure.query(async () => {
    return runHardeningCheck();
  }),

  // ── Unified Audit Trail ────────────────────────────────────────────

  /**
   * Query unified audit trail with optional filters.
   */
  auditTrail: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(500).optional(),
      actionType: z.string().optional(),
      targetType: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const engine = getGovernanceEngine();
      engine.enforcePermission(
        ctx.user.role || "user",
        "audit.read",
        { actorId: String(ctx.user.id) }
      );

      const auditLogger = getAuditLogger();
      let events = auditLogger.getRecent(input?.limit || 100);

      if (input?.actionType) {
        events = events.filter(e => e.action_type === input.actionType);
      }
      if (input?.targetType) {
        events = events.filter(e => e.target_type === input.targetType);
      }

      return { events, total: events.length };
    }),

  // ── Evidence Vault ─────────────────────────────────────────────────

  /**
   * List all stored evidence artifacts.
   */
  artifactList: protectedProcedure.query(async ({ ctx }) => {
    const engine = getGovernanceEngine();
    engine.enforcePermission(ctx.user.role || "user", "audit.read", { actorId: String(ctx.user.id) });
    const store = getArtifactStore();
    const hashes = await store.list();
    return { artifacts: hashes, count: hashes.length };
  }),

  /**
   * Verify integrity of a stored artifact by SHA-256 hash.
   */
  artifactVerify: protectedProcedure
    .input(z.object({ sha256: z.string().length(64) }))
    .query(async ({ input, ctx }) => {
      const engine = getGovernanceEngine();
      engine.enforcePermission(ctx.user.role || "user", "audit.read", { actorId: String(ctx.user.id) });
      const store = getArtifactStore();
      const valid = await store.verify(input.sha256);
      const exists = await store.exists(input.sha256);
      return { sha256: input.sha256, exists, valid };
    }),

  /**
   * Get metadata for a stored artifact by SHA-256 hash.
   */
  artifactMetadata: protectedProcedure
    .input(z.object({ sha256: z.string().length(64) }))
    .query(async ({ input, ctx }) => {
      const engine = getGovernanceEngine();
      engine.enforcePermission(ctx.user.role || "user", "audit.read", { actorId: String(ctx.user.id) });
      const store = getArtifactStore();
      const exists = await store.exists(input.sha256);
      return { sha256: input.sha256, exists };
    }),
});
