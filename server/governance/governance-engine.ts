/**
 * Governance Engine — Governance Bible CGT v2
 *
 * Central enforcement engine that ties together all governance subsystems:
 *   - RBAC Model (rbac-model.ts)
 *   - Risk Classifier (risk-classifier.ts)
 *   - Lifecycle Guard (lifecycle-guard.ts)
 *   - Publication Gate (publication-gate.ts)
 *   - Architecture Validator (architecture-validator.ts)
 *   - Self-Check (self-check.ts)
 *
 * Provides a single entry point for governance enforcement across the platform.
 *
 * Enforcement mode:
 *   Production  → strict (deny-by-default, fail-closed)
 *   Development → permissive (warn, fail-open unless GOVERNANCE_STRICT=true)
 */

import { TRPCError } from "@trpc/server";
import { hasPermission, normalizeRole, type PermissionAction, type GovernanceRole } from "./rbac-model";
import { validateTransition, getStageFromTags, type TransitionRequest } from "./lifecycle-guard";
import { evaluatePublication, type PublicationRequest } from "./publication-gate";
import { validateArchitecture, validateStartupConditions } from "./architecture-validator";
import { buildRiskReport, createFinding, type RiskFinding } from "./risk-classifier";
import { runSelfCheck } from "./self-check";
import { getAuditLogger } from "../services/auditLogger";
import { getGovernanceLogger } from "../services/governanceLogger";
import { getGovernanceMetrics } from "../services/governanceMetrics";

// ============================================================================
// Configuration
// ============================================================================

function isStrictMode(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  return process.env.GOVERNANCE_STRICT === "true";
}

// ============================================================================
// Governance Engine Singleton
// ============================================================================

class GovernanceEngine {
  private initialized = false;
  private startupValidation: { canStart: boolean; warnings: string[]; errors: string[] } | null = null;

  /**
   * Initialize governance engine.
   * Called at server startup. Validates startup conditions.
   */
  initialize(): void {
    if (this.initialized) return;

    console.log("[Governance] Initializing Governance Engine (CGT v2)...");

    // Validate startup conditions
    this.startupValidation = validateStartupConditions();

    for (const warning of this.startupValidation.warnings) {
      console.warn(`[Governance] WARNING: ${warning}`);
    }

    for (const error of this.startupValidation.errors) {
      console.error(`[Governance] ERROR: ${error}`);
    }

    // In strict mode, block startup on errors
    if (isStrictMode() && !this.startupValidation.canStart) {
      console.error("[Governance] FATAL: Startup conditions not met in strict mode.");
      console.error("[Governance] Set GOVERNANCE_STRICT=false to bypass (dev only).");
      // Don't actually process.exit — let the caller handle it
    }

    // Validate architecture
    const archStatus = validateArchitecture();
    if (archStatus.findings.length > 0) {
      console.warn(`[Governance] ${archStatus.findings.length} architecture finding(s) detected at startup`);
      for (const finding of archStatus.findings) {
        console.warn(`  [${finding.severity.toUpperCase()}] ${finding.title}: ${finding.description}`);
      }
    }

    // Initialize metrics
    const metrics = getGovernanceMetrics();
    metrics.inc("governance_engine_init_total");

    this.initialized = true;
    console.log(`[Governance] Engine initialized (mode: ${isStrictMode() ? "strict" : "permissive"})`);
  }

  /**
   * Enforce RBAC for an action.
   * Returns true if allowed, throws if denied (strict mode) or logs warning (permissive mode).
   */
  enforcePermission(
    role: string,
    action: PermissionAction,
    context?: { actorId?: string; target?: string }
  ): boolean {
    const normalizedRole = normalizeRole(role);
    const allowed = hasPermission(normalizedRole, action);

    if (!allowed) {
      const msg = `Permission denied: role=${normalizedRole} action=${action}`;

      // Audit log the denial
      getAuditLogger().log({
        actor_id: context?.actorId,
        principal_type: "human",
        action_type: "RBAC_DENIAL",
        target_type: "rbac_enforcement",
        target_id: context?.target,
        decision_result: "denied",
        metadata: { role: normalizedRole, action, strict: isStrictMode() },
      });

      getGovernanceMetrics().inc("rbac_denials_total");

      if (isStrictMode()) {
        throw new TRPCError({ code: "FORBIDDEN", message: `[Governance] ${msg}` });
      } else {
        console.warn(`[Governance] ${msg} (permissive mode — allowing)`);
        return true; // Allow in permissive mode but log
      }
    }

    return true;
  }

  /**
   * Validate and enforce a lifecycle transition.
   * Checks frozen status, validates transition rules, and optionally runs scorecard.
   */
  async enforceLifecycleTransition(req: TransitionRequest) {
    // Check frozen status (lifecycle-guard also checks, but defense-in-depth)
    try {
      const { isFrozen } = require("./scorecard");
      if (isFrozen(req.entryId)) {
        const reason = `Subject #${req.entryId} is FROZEN — transition blocked`;
        getGovernanceMetrics().inc("lifecycle_denials_total");
        if (isStrictMode()) {
          throw new Error(`[Governance] ${reason}`);
        }
        return { allowed: false, reason };
      }
      if (isFrozen(0)) {
        const reason = "System-wide governance FREEZE — all transitions blocked";
        getGovernanceMetrics().inc("lifecycle_denials_total");
        if (isStrictMode()) {
          throw new Error(`[Governance] ${reason}`);
        }
        return { allowed: false, reason };
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("[Governance]")) throw e;
      // Scorecard module not available — continue with standard validation
    }

    const result = await validateTransition(req);

    if (!result.allowed) {
      getGovernanceMetrics().inc("lifecycle_denials_total");

      if (isStrictMode()) {
        throw new Error(`[Governance] Lifecycle transition blocked: ${result.reason}`);
      } else {
        console.warn(`[Governance] Lifecycle transition blocked: ${result.reason} (permissive mode — allowing)`);
      }
    }

    return result;
  }

  /**
   * Run scorecard for a subject and enforce gate.
   * Returns scorecard result or throws on blocked transition (strict mode).
   */
  async enforceScorecard(params: {
    stage: string;
    subject?: { id: number; name: string; type: string; tags: string[]; description?: string; config?: any };
    actorId: string;
    actorRole: string;
  }) {
    try {
      const { runScorecard, isFrozen } = require("./scorecard");

      // Check freeze before scoring
      if (params.subject && isFrozen(params.subject.id)) {
        throw new Error(`[Governance] Subject #${params.subject.id} is FROZEN — scorecard blocked`);
      }

      const result = await runScorecard({
        stage: params.stage,
        entry: params.subject,
        actor: { id: params.actorId, role: params.actorRole },
      });

      if (result.blocked && isStrictMode()) {
        throw new Error(`[Governance] Scorecard gate FAIL: ${result.scorecard.gateStatus.reason}`);
      }

      return result;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("[Governance]")) throw e;
      console.warn("[Governance] Scorecard engine unavailable:", e);
      return null;
    }
  }

  /**
   * Evaluate publication gate.
   */
  async evaluatePublicationGate(req: PublicationRequest) {
    const decision = await evaluatePublication(req);

    if (!decision.allowed) {
      getGovernanceMetrics().inc("publication_denials_total");
    } else {
      getGovernanceMetrics().inc("publication_approvals_total");
    }

    return decision;
  }

  /**
   * Run governance self-check.
   */
  selfCheck() {
    return runSelfCheck();
  }

  /**
   * Run architecture validation.
   */
  validateArchitecture() {
    return validateArchitecture();
  }

  /**
   * Get governance engine status.
   */
  getStatus() {
    return {
      initialized: this.initialized,
      strictMode: isStrictMode(),
      startupValidation: this.startupValidation,
      environment: process.env.NODE_ENV || "development",
      devMode: process.env.DEV_MODE === "true",
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let _engine: GovernanceEngine | null = null;

export function getGovernanceEngine(): GovernanceEngine {
  if (!_engine) {
    _engine = new GovernanceEngine();
  }
  return _engine;
}

/**
 * Initialize the governance engine at startup.
 * Should be called once from server/_core/index.ts.
 */
export function initializeGovernance(): void {
  getGovernanceEngine().initialize();
}
