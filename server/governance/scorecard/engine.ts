/**
 * Scorecard Engine — Governance Bible CGT v2
 *
 * Role: CE-A (Engine & Backend Lead)
 * Phase: 2 — Engine Core
 *
 * Central orchestrator that:
 *   1. Validates the GovernedSubject contract
 *   2. Resolves packs (base + type)
 *   3. Loads applicable controls
 *   4. Runs all control runners
 *   5. Aggregates results into a weighted score
 *   6. Evaluates the stage gate
 *   7. Generates an immutable evidence bundle
 *   8. Returns the full scorecard (or 409 on blocked transition)
 *
 * Enforcement:
 *   - Missing base pack = FAIL
 *   - Missing type pack = FAIL validate
 *   - Invalid subject = FAIL before scoring
 *   - Gate FAIL on any Critical/High at validate+
 */

import {
  getActiveControls,
  getControlsForStage,
  type ControlDefinition,
} from "./control-catalog";
import { resolvePacks, type PackResolution } from "./pack-resolver";
import {
  validateSubject,
  type GovernedSubject,
  type SubjectType,
} from "./governed-subject";
import { getRunner, type RunnerContext, type ControlResult } from "./runner";
import { aggregateResults, type AggregatedScorecard } from "./aggregator";
import { generateEvidenceBundle, type EvidenceBundle } from "./evidence";
import type { LifecycleStage } from "../lifecycle-guard";
import { toUserSafeGovernanceDetail } from "../../../shared/error-presentation";

// ============================================================================
// Types
// ============================================================================

export interface ScorecardRequest {
  /** Target lifecycle stage for gate evaluation */
  stage: LifecycleStage;
  /** GovernedSubject being evaluated (optional for system-wide checks) */
  subject?: GovernedSubject;
  /** Legacy: entry format (auto-converted to subject) */
  entry?: {
    id: number;
    name: string;
    type: string;
    tags: string[];
    description?: string;
    config?: any;
  };
  /** Actor triggering the scorecard */
  actor?: {
    id: string;
    role: string;
  };
  /** Git commit ref (auto-detected if not provided) */
  commitRef?: string;
  /** Only run controls for the specified stage (vs. all controls) */
  stageOnly?: boolean;
}

export interface ScorecardResult {
  /** Aggregated scorecard with scores, gate status, and results */
  scorecard: AggregatedScorecard;
  /** Immutable evidence bundle */
  evidence: EvidenceBundle;
  /** Controls that were evaluated */
  controlsEvaluated: number;
  /** Runners that were invoked */
  runnersInvoked: string[];
  /** Pack resolution details */
  packResolution: PackResolution | null;
  /** Subject validation result */
  subjectValidation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } | null;
  /** Whether this is a 409 (blocked transition) */
  blocked: boolean;
  /** HTTP status code to return (200 or 409) */
  httpStatus: 200 | 409;
}

// ============================================================================
// In-Memory Scorecard Store
// ============================================================================

const _scorecardHistory: ScorecardResult[] = [];
const MAX_HISTORY = 50;

export function getScorecardHistory(): ScorecardResult[] {
  return [..._scorecardHistory];
}

export function getLatestScorecard(): ScorecardResult | null {
  return _scorecardHistory.length > 0
    ? _scorecardHistory[_scorecardHistory.length - 1]
    : null;
}

// ============================================================================
// Engine
// ============================================================================

/**
 * Run the full governance scorecard.
 *
 * Steps:
 *   1. Normalize subject (convert legacy entry format if needed)
 *   2. Validate subject contract
 *   3. Resolve packs
 *   4. Build runner context
 *   5. Execute each runner
 *   6. Aggregate results
 *   7. Generate evidence bundle
 *   8. Determine HTTP status (200 or 409)
 *   9. Store in history
 */
export async function runScorecard(
  request: ScorecardRequest
): Promise<ScorecardResult> {
  // 1. Normalize subject
  const subject =
    request.subject ||
    (request.entry ? entryToSubject(request.entry) : undefined);
  let packResolution: PackResolution | null = null;
  let subjectValidation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } | null = null;

  // 2. Select controls
  let controls: ControlDefinition[];

  if (subject) {
    // Validate subject contract
    subjectValidation = validateSubject(subject);

    if (subjectValidation.valid) {
      // Resolve packs for this subject type
      packResolution = resolvePacks(
        subject.type,
        request.stageOnly ? request.stage : undefined
      );

      if (packResolution.resolved) {
        controls = packResolution.controls;
      } else {
        // Pack resolution failed — use base controls only + inject pack failure
        controls =
          packResolution.baseControls.length > 0
            ? packResolution.baseControls
            : getActiveControls().filter(c => c.pack === "base");
      }
    } else {
      // Invalid subject — run base controls only
      controls = getActiveControls().filter(c => c.pack === "base");
    }
  } else {
    // No subject — system-wide check (base controls only)
    controls = request.stageOnly
      ? getControlsForStage(request.stage).filter(c => c.pack === "base")
      : getActiveControls().filter(c => c.pack === "base");
  }

  // 3. Build runner context
  const ctx: RunnerContext = {
    entry: subject
      ? {
          id: subject.id,
          name: subject.name,
          type: subject.type,
          tags: subject.tags,
          description: subject.description,
          config: subject.config,
        }
      : request.entry,
    actor: request.actor,
    currentStage: subject
      ? getStageFromEntryTags(subject.tags)
      : request.entry
        ? getStageFromEntryTags(request.entry.tags)
        : undefined,
    targetStage: request.stage,
    environment: {
      nodeEnv: process.env.NODE_ENV || "development",
      isProduction: process.env.NODE_ENV === "production",
      devMode: process.env.DEV_MODE === "true",
      governanceStrict: process.env.GOVERNANCE_STRICT === "true",
    },
    commitRef: request.commitRef || getCommitRef(),
  };

  // 4. Execute runners
  const results: ControlResult[] = [];
  const runnersInvoked = new Set<string>();

  // Inject pack resolution failure as a control result if needed
  if (packResolution && !packResolution.resolved) {
    results.push({
      controlId: "PACK-FAIL",
      runnerId: "pack-resolver",
      status: "fail",
      severity: "critical",
      details: packResolution.error || "Pack resolution failed",
      evidence: {
        check: "Pack resolution",
        finding: "pack_missing",
        targets: packResolution.missingPacks,
      },
      remediation: `Ensure both base and type pack controls exist for subject type '${subject?.type}'.`,
      timestamp: new Date(),
    });
  }

  // Inject subject validation failure if needed
  if (subjectValidation && !subjectValidation.valid) {
    results.push({
      controlId: "SUBJECT-FAIL",
      runnerId: "subject-validator",
      status: "fail",
      severity: "critical",
      details: `Subject validation failed: ${subjectValidation.errors.join("; ")}`,
      evidence: {
        check: "GovernedSubject contract",
        finding: "invalid_subject",
        targets: subjectValidation.errors,
      },
      remediation:
        "Fix subject contract violations before entering the scorecard pipeline.",
      timestamp: new Date(),
    });
  }

  // Group controls by runner ID
  const controlsByRunner = new Map<string, ControlDefinition[]>();
  for (const control of controls) {
    const list = controlsByRunner.get(control.runnerId) || [];
    list.push(control);
    controlsByRunner.set(control.runnerId, list);
  }

  // Execute each runner
  for (const [runnerId, runnerControls] of Array.from(controlsByRunner)) {
    const runner = getRunner(runnerId);
    if (!runner) {
      for (const control of runnerControls) {
        results.push({
          controlId: control.id,
          runnerId,
          status: "fail",
          severity: control.severity,
          details: `Runner "${runnerId}" not registered — control cannot be evaluated`,
          evidence: {
            check: control.name,
            finding: "runner_missing",
            targets: [runnerId],
          },
          remediation: control.remediation,
          timestamp: new Date(),
        });
      }
      continue;
    }

    try {
      const runnerResults = await runner.run(ctx, runnerControls);
      results.push(...runnerResults);
      runnersInvoked.add(runnerId);
    } catch (err) {
      const technicalDetails = err instanceof Error ? err.message : String(err);
      console.error(
        `[Governance][Scorecard] RUNNER_FAILURE | runner=${runnerId} ` +
          `subject_type=${subject?.type || "unknown"} subject_id=${subject?.id || 0} ` +
          `stage=${request.stage} error=${technicalDetails}`,
        err
      );

      for (const control of runnerControls) {
        results.push({
          controlId: control.id,
          runnerId,
          status: "fail",
          severity: control.severity,
          details: toUserSafeGovernanceDetail(technicalDetails),
          evidence: {
            check: control.name,
            finding: "runner_error",
            targets: [runnerId],
            data: { error: technicalDetails },
          },
          remediation: control.remediation,
          timestamp: new Date(),
        });
      }
    }
  }

  // 5. Aggregate results
  const scorecard = aggregateResults(results, controls, request.stage);

  // 6. Generate evidence bundle
  const evidence = generateEvidenceBundle(
    scorecard,
    ctx.commitRef || "unknown",
    request.actor?.id || "system",
    request.stage
  );

  // 7. Determine HTTP status: 409 if gate FAIL
  const blocked = !scorecard.gateStatus.passed;
  const httpStatus = blocked ? 409 : 200;

  // 8. Store in history
  const result: ScorecardResult = {
    scorecard,
    evidence,
    controlsEvaluated: controls.length,
    runnersInvoked: Array.from(runnersInvoked),
    packResolution,
    subjectValidation,
    blocked,
    httpStatus,
  };

  _scorecardHistory.push(result);
  if (_scorecardHistory.length > MAX_HISTORY) {
    _scorecardHistory.shift();
  }

  return result;
}

// ============================================================================
// Helpers
// ============================================================================

function entryToSubject(entry: {
  id: number;
  name: string;
  type: string;
  tags: string[];
  description?: string;
  config?: any;
}): GovernedSubject {
  return {
    id: entry.id,
    name: entry.name,
    type: entry.type as SubjectType,
    tags: entry.tags,
    description: entry.description,
    config: entry.config,
  };
}

function getStageFromEntryTags(tags: string[]): string {
  if (tags.includes("published")) return "publish";
  if (tags.includes("validated")) return "validate";
  if (tags.includes("registered")) return "register";
  if (tags.includes("candidate")) return "submit";
  return "submit";
}

function getCommitRef(): string {
  try {
    const { execSync } = require("child_process");
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}
