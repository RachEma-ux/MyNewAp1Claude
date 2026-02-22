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
        action_type: "ADMIN_ROLE_CHANGE" as any,
        target_type: "rbac_enforcement",
        target_id: context?.target,
        decision_result: "denied",
        metadata: { role: normalizedRole, action, strict: isStrictMode() },
      });

      getGovernanceMetrics().inc("rbac_denials_total");

      if (isStrictMode()) {
        throw new Error(`[Governance] ${msg}`);
      } else {
        console.warn(`[Governance] ${msg} (permissive mode — allowing)`);
        return true; // Allow in permissive mode but log
      }
    }

    return true;
  }

  /**
   * Validate and enforce a lifecycle transition.
   */
  enforceLifecycleTransition(req: TransitionRequest) {
    const result = validateTransition(req);

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
   * Evaluate publication gate.
   */
  evaluatePublicationGate(req: PublicationRequest) {
    const decision = evaluatePublication(req);

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
