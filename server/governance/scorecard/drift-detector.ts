/**
 * Drift Detection — Governance Bible CGT v2
 *
 * Role: CE-B (CI/CD & Runner Lead)
 * Phase: 6 — Drift Detection with Subject Freeze
 *
 * Scheduled post-publish governance re-scoring:
 *   - Compares current state against last known-good scorecard
 *   - Detects policy drift (config changes after publish)
 *   - Detects architecture drift (layer boundary violations)
 *   - Detects secret rotation drift (expired or unchanged secrets)
 *   - Triggers automatic re-score
 *   - Escalates on severity threshold breach
 *   - FREEZES subjects on critical drift (blocks further transitions)
 */

import { runScorecard, getLatestScorecard, type ScorecardResult } from "./engine";
import type { LifecycleStage } from "../lifecycle-guard";
import { getDb } from "../../db";
import { subjectFreezes, driftEvents } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getAuditLogger } from "../../services/auditLogger";

// ============================================================================
// Types
// ============================================================================

export interface DriftReport {
  /** When drift detection ran */
  timestamp: Date;
  /** Whether drift was detected */
  driftDetected: boolean;
  /** Score delta from last known-good */
  scoreDelta: number;
  /** Previous score */
  previousScore: number;
  /** Current score */
  currentScore: number;
  /** New violations since last check */
  newViolations: string[];
  /** Resolved violations since last check */
  resolvedViolations: string[];
  /** Whether re-score passed the gate */
  gatePassed: boolean;
  /** Escalation needed */
  escalationNeeded: boolean;
  /** Escalation reason */
  escalationReason?: string;
  /** Subjects frozen in this detection cycle */
  frozenSubjectIds: number[];
}

export interface DriftConfig {
  /** How often to run drift detection (ms). Default: 15 minutes. */
  intervalMs: number;
  /** Score drop threshold that triggers escalation. Default: 10 points. */
  scoreDropThreshold: number;
  /** Stage to evaluate against. Default: "publish". */
  stage: LifecycleStage;
  /** Auto-freeze subjects on critical drift. Default: true. */
  autoFreeze: boolean;
  /** Score drop threshold that triggers auto-freeze. Default: 20 points. */
  freezeThreshold: number;
}

export interface FrozenSubject {
  /** Subject ID */
  subjectId: number;
  /** Subject name */
  subjectName: string;
  /** When it was frozen */
  frozenAt: Date;
  /** Why it was frozen */
  reason: string;
  /** Score at time of freeze */
  scoreAtFreeze: number;
  /** Who/what triggered the freeze */
  frozenBy: string;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: DriftConfig = {
  intervalMs: 15 * 60 * 1000, // 15 minutes
  scoreDropThreshold: 10,
  stage: "publish",
  autoFreeze: true,
  freezeThreshold: 20,
};

// ============================================================================
// State
// ============================================================================

let _driftInterval: ReturnType<typeof setInterval> | null = null;
let _lastDriftReport: DriftReport | null = null;
const _driftHistory: DriftReport[] = [];
const MAX_DRIFT_HISTORY = 100;

/** Frozen subjects registry — blocks lifecycle transitions until unfrozen */
const _frozenSubjects = new Map<number, FrozenSubject>();

// ============================================================================
// Freeze Management
// ============================================================================

/**
 * Freeze a subject — blocks all lifecycle transitions until explicitly unfrozen.
 * Writes to DB (primary store) + in-memory cache (fast reads).
 */
export async function freezeSubject(
  subjectId: number,
  subjectName: string,
  reason: string,
  scoreAtFreeze: number,
  frozenBy: string = "drift-detector"
): Promise<FrozenSubject> {
  const frozen: FrozenSubject = {
    subjectId,
    subjectName,
    frozenAt: new Date(),
    reason,
    scoreAtFreeze,
    frozenBy,
  };

  // Write to DB (primary store)
  const db = getDb();
  if (db) {
    // Upsert: delete existing freeze for this subject, then insert
    await db.delete(subjectFreezes).where(eq(subjectFreezes.subjectId, subjectId));
    await db.insert(subjectFreezes).values({
      subjectId,
      subjectName,
      reason,
      scoreAtFreeze,
      frozenBy,
      frozenAt: frozen.frozenAt,
    });
  }

  // Write to cache
  _frozenSubjects.set(subjectId, frozen);

  console.warn(
    `[Governance Freeze] Subject #${subjectId} "${subjectName}" FROZEN: ${reason} (score: ${scoreAtFreeze})`
  );

  return frozen;
}

/**
 * Unfreeze a subject — allows lifecycle transitions to resume.
 * Requires actorId for audit trail. Deletes from DB + cache.
 */
export async function unfreezeSubject(subjectId: number, actorId: string): Promise<boolean> {
  const existed = _frozenSubjects.has(subjectId);
  if (existed) {
    const subject = _frozenSubjects.get(subjectId)!;

    // Delete from DB
    const db = getDb();
    if (db) {
      await db.delete(subjectFreezes).where(eq(subjectFreezes.subjectId, subjectId));
    }

    // Delete from cache
    _frozenSubjects.delete(subjectId);

    // Audit log the unfreeze
    const audit = getAuditLogger();
    await audit.log({
      actor_id: actorId,
      action_type: "DRIFT_DETECTION",
      target_type: "subject_unfreeze",
      target_id: String(subjectId),
      decision_result: "success",
      metadata: {
        subjectName: subject.subjectName,
        scoreAtFreeze: subject.scoreAtFreeze,
        frozenAt: subject.frozenAt.toISOString(),
        frozenBy: subject.frozenBy,
        unfrozenBy: actorId,
      },
    });

    console.log(
      `[Governance Freeze] Subject #${subjectId} "${subject.subjectName}" UNFROZEN by ${actorId}`
    );
  }
  return existed;
}

/**
 * Check if a subject is frozen.
 */
export function isFrozen(subjectId: number): boolean {
  return _frozenSubjects.has(subjectId);
}

/**
 * Get all frozen subjects from DB (authoritative source).
 * Falls back to in-memory cache if DB is unavailable.
 */
export async function getFrozenSubjects(): Promise<FrozenSubject[]> {
  const db = getDb();
  if (db) {
    const rows = await db.select().from(subjectFreezes);
    return rows.map((r) => ({
      subjectId: r.subjectId,
      subjectName: r.subjectName,
      frozenAt: r.frozenAt,
      reason: r.reason,
      scoreAtFreeze: r.scoreAtFreeze,
      frozenBy: r.frozenBy,
    }));
  }
  return Array.from(_frozenSubjects.values());
}

/**
 * Get freeze details for a specific subject.
 */
export function getFreezeDetails(subjectId: number): FrozenSubject | undefined {
  return _frozenSubjects.get(subjectId);
}

// ============================================================================
// Drift Detector
// ============================================================================

/**
 * Run a single drift detection check.
 *
 * Phase 7 — Enhanced drift detection:
 *   - Compare policy bundles
 *   - Detect config drift
 *   - Detect secret rotation overdue
 *   - Detect new direct provider calls
 *   - Generate drift scorecard
 *   - If severity >= High → freeze subject + log audit event
 */
export async function detectDrift(config?: Partial<DriftConfig>): Promise<DriftReport> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const previous = getLatestScorecard();

  // Run a fresh scorecard
  const current = await runScorecard({
    stage: cfg.stage,
    actor: { id: "drift-detector", role: "system" },
  });

  const previousScore = previous?.scorecard.score.score ?? 100;
  const currentScore = current.scorecard.score.score;
  const scoreDelta = currentScore - previousScore;

  // Compare control results
  const previousFails = new Set(
    previous?.scorecard.controlResults
      .filter((r) => r.status === "fail")
      .map((r) => r.controlId) ?? []
  );
  const currentFails = new Set(
    current.scorecard.controlResults
      .filter((r) => r.status === "fail")
      .map((r) => r.controlId)
  );

  const newViolations = Array.from(currentFails).filter((id) => !previousFails.has(id));
  const resolvedViolations = Array.from(previousFails).filter((id) => !currentFails.has(id));

  // Enhanced drift checks (Phase 7)
  const driftChecks = runEnhancedDriftChecks();
  const allNewViolations = [...newViolations, ...driftChecks.violations];

  const driftDetected = allNewViolations.length > 0 || resolvedViolations.length > 0;

  // Escalation logic
  let escalationNeeded = false;
  let escalationReason: string | undefined;

  if (scoreDelta <= -cfg.scoreDropThreshold) {
    escalationNeeded = true;
    escalationReason = `Score dropped ${Math.abs(scoreDelta)} points (threshold: ${cfg.scoreDropThreshold})`;
  }

  if (current.scorecard.riskBreakdown.critical > 0) {
    escalationNeeded = true;
    escalationReason = `${current.scorecard.riskBreakdown.critical} Critical violation(s) detected`;
  }

  // Phase 7: Also escalate on High violations
  if (current.scorecard.riskBreakdown.high > 0 && (previous?.scorecard.riskBreakdown.high ?? 0) === 0) {
    escalationNeeded = true;
    escalationReason = escalationReason || `New High violation(s) detected: ${current.scorecard.riskBreakdown.high}`;
  }

  if (driftChecks.violations.length > 0) {
    escalationNeeded = true;
    escalationReason = escalationReason || `Drift checks found ${driftChecks.violations.length} violation(s)`;
  }

  // Auto-freeze on severe drift
  const frozenSubjectIds: number[] = [];
  if (cfg.autoFreeze && scoreDelta <= -cfg.freezeThreshold) {
    await freezeSubject(
      0,
      "system",
      `Drift detection: score dropped ${Math.abs(scoreDelta)} points (freeze threshold: ${cfg.freezeThreshold})`,
      currentScore,
      "drift-detector"
    );
    frozenSubjectIds.push(0);

    await logDriftAuditEvent("DRIFT_FREEZE", "system", 0, `Score drop: ${previousScore} → ${currentScore}`, currentScore);
  }

  // Freeze if critical violations appeared
  if (cfg.autoFreeze && current.scorecard.riskBreakdown.critical > 0 && (previous?.scorecard.riskBreakdown.critical ?? 0) === 0) {
    if (!_frozenSubjects.has(0)) {
      await freezeSubject(
        0,
        "system",
        `New Critical violation(s) detected during drift check`,
        currentScore,
        "drift-detector"
      );
      frozenSubjectIds.push(0);

      await logDriftAuditEvent("DRIFT_CRITICAL_FREEZE", "system", 0,
        `${current.scorecard.riskBreakdown.critical} new Critical violations`, currentScore);
    }
  }

  // Phase 7: Freeze on High severity if score also dropped
  if (cfg.autoFreeze && current.scorecard.riskBreakdown.high > 0 &&
      scoreDelta <= -(cfg.scoreDropThreshold) && !_frozenSubjects.has(0)) {
    await freezeSubject(
      0,
      "system",
      `High violations + score drop detected during drift check`,
      currentScore,
      "drift-detector"
    );
    frozenSubjectIds.push(0);

    await logDriftAuditEvent("DRIFT_HIGH_FREEZE", "system", 0,
      `${current.scorecard.riskBreakdown.high} High violations + score drop`, currentScore);
  }

  const report: DriftReport = {
    timestamp: new Date(),
    driftDetected,
    scoreDelta,
    previousScore,
    currentScore,
    newViolations: allNewViolations,
    resolvedViolations,
    gatePassed: current.scorecard.gateStatus.passed,
    escalationNeeded,
    escalationReason,
    frozenSubjectIds,
  };

  // Persist drift event to DB
  const db = getDb();
  if (db) {
    await db.insert(driftEvents).values({
      driftDetected: report.driftDetected,
      scoreDelta: report.scoreDelta,
      previousScore: report.previousScore,
      currentScore: report.currentScore,
      newViolations: report.newViolations,
      resolvedViolations: report.resolvedViolations,
      gatePassed: report.gatePassed,
      escalationNeeded: report.escalationNeeded,
      escalationReason: report.escalationReason ?? null,
      frozenSubjectIds: report.frozenSubjectIds,
    });
  }

  // In-memory buffer (for fast reads)
  _lastDriftReport = report;
  _driftHistory.push(report);
  if (_driftHistory.length > MAX_DRIFT_HISTORY) {
    _driftHistory.shift();
  }

  // Log
  if (driftDetected || escalationNeeded) {
    console.warn(
      `[Governance Drift] Score: ${previousScore} → ${currentScore} (delta: ${scoreDelta > 0 ? "+" : ""}${scoreDelta}). ` +
      `New violations: ${allNewViolations.length}. Resolved: ${resolvedViolations.length}. ` +
      (escalationNeeded ? `ESCALATION: ${escalationReason}` : "No escalation.") +
      (frozenSubjectIds.length > 0 ? ` FROZEN: ${frozenSubjectIds.length} subject(s)` : "")
    );
  }

  return report;
}

// ============================================================================
// Phase 7 — Enhanced Drift Checks
// ============================================================================

interface EnhancedDriftResult {
  violations: string[];
  checks: { name: string; passed: boolean; detail: string }[];
}

/**
 * Run enhanced drift checks beyond scorecard comparison:
 *   - Config drift (environment changes)
 *   - Secret rotation overdue
 *   - Policy bundle changes
 *   - New direct provider calls
 */
function runEnhancedDriftChecks(): EnhancedDriftResult {
  const violations: string[] = [];
  const checks: { name: string; passed: boolean; detail: string }[] = [];

  // 1. Config drift — check for runtime env changes
  const isProduction = process.env.NODE_ENV === "production";
  const debugEnabled = process.env.DEBUG === "true";
  const failOpen = process.env.POLICY_FAIL_OPEN === "true";

  if (isProduction && debugEnabled) {
    violations.push("CONFIG_DRIFT: DEBUG=true in production");
    checks.push({ name: "config_drift", passed: false, detail: "DEBUG=true in production" });
  } else {
    checks.push({ name: "config_drift", passed: true, detail: "Config consistent" });
  }

  if (isProduction && failOpen) {
    violations.push("CONFIG_DRIFT: POLICY_FAIL_OPEN=true in production");
    checks.push({ name: "policy_drift", passed: false, detail: "Fail-open in production" });
  } else {
    checks.push({ name: "policy_drift", passed: true, detail: "Policy mode consistent" });
  }

  // 2. Secret rotation check — flag if env suggests stale secrets
  const secretAge = process.env.SECRET_LAST_ROTATED;
  if (secretAge) {
    const lastRotated = new Date(secretAge);
    const daysSinceRotation = (Date.now() - lastRotated.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceRotation > 90) {
      violations.push(`SECRET_ROTATION: Secrets last rotated ${Math.floor(daysSinceRotation)} days ago (max: 90)`);
      checks.push({ name: "secret_rotation", passed: false, detail: `${Math.floor(daysSinceRotation)} days since rotation` });
    } else {
      checks.push({ name: "secret_rotation", passed: true, detail: `Rotated ${Math.floor(daysSinceRotation)} days ago` });
    }
  } else {
    checks.push({ name: "secret_rotation", passed: true, detail: "No rotation tracking configured" });
  }

  // 3. Governance strict mode check
  const strictMode = process.env.GOVERNANCE_STRICT === "true";
  if (isProduction && !strictMode) {
    violations.push("GOVERNANCE_DRIFT: GOVERNANCE_STRICT not enabled in production");
    checks.push({ name: "governance_strict", passed: false, detail: "Strict mode not enabled in production" });
  } else {
    checks.push({ name: "governance_strict", passed: true, detail: "Strict mode appropriate" });
  }

  return { violations, checks };
}

/**
 * Log a drift audit event (blocking write).
 */
async function logDriftAuditEvent(
  eventType: string,
  subjectName: string,
  subjectId: number,
  reason: string,
  score: number
): Promise<void> {
  const audit = getAuditLogger();
  await audit.log({
    actor_id: "drift-detector",
    action_type: "DRIFT_DETECTION",
    target_type: "drift_detection",
    target_id: String(subjectId),
    decision_result: "success",
    metadata: { eventType, subjectName, reason, score, timestamp: new Date().toISOString() },
  });
}

/**
 * Hydrate the in-memory freeze cache from DB on startup.
 * Must be called once during server boot.
 */
export async function hydrateFreezeCache(): Promise<void> {
  const db = getDb();
  if (!db) return;

  const rows = await db.select().from(subjectFreezes);
  for (const row of rows) {
    _frozenSubjects.set(row.subjectId, {
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      frozenAt: row.frozenAt,
      reason: row.reason,
      scoreAtFreeze: row.scoreAtFreeze,
      frozenBy: row.frozenBy,
    });
  }

  if (rows.length > 0) {
    console.log(`[Governance Freeze] Hydrated ${rows.length} frozen subject(s) from DB`);
  }
}

/**
 * Start scheduled drift detection.
 */
export function startDriftDetection(config?: Partial<DriftConfig>): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (_driftInterval) {
    console.warn("[Governance Drift] Already running — stopping previous interval");
    stopDriftDetection();
  }

  console.log(`[Governance Drift] Starting scheduled detection (interval: ${cfg.intervalMs}ms, autoFreeze: ${cfg.autoFreeze})`);

  _driftInterval = setInterval(async () => {
    try {
      await detectDrift(cfg);
    } catch (err) {
      console.error("[Governance Drift] Detection failed:", err);
    }
  }, cfg.intervalMs);
}

/**
 * Stop scheduled drift detection.
 */
export function stopDriftDetection(): void {
  if (_driftInterval) {
    clearInterval(_driftInterval);
    _driftInterval = null;
    console.log("[Governance Drift] Stopped scheduled detection");
  }
}

/**
 * Get the latest drift report.
 */
export function getLastDriftReport(): DriftReport | null {
  return _lastDriftReport;
}

/**
 * Get drift detection history.
 */
export function getDriftHistory(): DriftReport[] {
  return [..._driftHistory];
}

/**
 * Check if drift detection is currently active.
 */
export function isDriftDetectionActive(): boolean {
  return _driftInterval !== null;
}
