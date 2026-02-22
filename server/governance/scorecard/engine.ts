/**
 * Scorecard Engine — Governance Bible CGT v2
 *
 * Central orchestrator that:
 *   1. Loads the control catalog
 *   2. Runs all applicable control runners
 *   3. Aggregates results into a weighted score
 *   4. Evaluates the stage gate
 *   5. Generates an evidence bundle
 *   6. Returns the full scorecard
 *
 * Usage:
 *   import { runScorecard } from "./engine";
 *   const result = runScorecard({ stage: "validate", entry: {...} });
 */

import { getActiveControls, getControlsForStage, getMaxScore, type ControlDefinition } from "./control-catalog";
import { getRunner, type RunnerContext, type ControlResult } from "./runner";
import { aggregateResults, type AggregatedScorecard } from "./aggregator";
import { generateEvidenceBundle, type EvidenceBundle } from "./evidence";
import type { LifecycleStage } from "../lifecycle-guard";

// ============================================================================
// Types
// ============================================================================

export interface ScorecardRequest {
  /** Target lifecycle stage for gate evaluation */
  stage: LifecycleStage;
  /** Entry being evaluated (optional for system-wide checks) */
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
}

// ============================================================================
// In-Memory Scorecard Store (latest results for quick access)
// ============================================================================

const _scorecardHistory: ScorecardResult[] = [];
const MAX_HISTORY = 50;

export function getScorecardHistory(): ScorecardResult[] {
  return [..._scorecardHistory];
}

export function getLatestScorecard(): ScorecardResult | null {
  return _scorecardHistory.length > 0 ? _scorecardHistory[_scorecardHistory.length - 1] : null;
}

// ============================================================================
// Engine
// ============================================================================

/**
 * Run the full governance scorecard.
 *
 * Steps:
 *   1. Select applicable controls (all or stage-specific)
 *   2. Build runner context
 *   3. Execute each runner
 *   4. Aggregate results
 *   5. Generate evidence bundle
 *   6. Store in history
 *   7. Return result
 */
export function runScorecard(request: ScorecardRequest): ScorecardResult {
  // 1. Select controls
  const controls: ControlDefinition[] = request.stageOnly
    ? getControlsForStage(request.stage)
    : getActiveControls();

  // 2. Build runner context
  const ctx: RunnerContext = {
    entry: request.entry,
    actor: request.actor,
    currentStage: request.entry
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

  // 3. Execute runners
  const results: ControlResult[] = [];
  const runnersInvoked = new Set<string>();

  // Group controls by runner ID
  const controlsByRunner = new Map<string, ControlDefinition[]>();
  for (const control of controls) {
    const list = controlsByRunner.get(control.runnerId) || [];
    list.push(control);
    controlsByRunner.set(control.runnerId, list);
  }

  // Execute each runner
  for (const [runnerId, runnerControls] of controlsByRunner) {
    const runner = getRunner(runnerId);
    if (!runner) {
      // Missing runner — generate fail results for all its controls
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
      const runnerResults = runner.run(ctx, runnerControls);
      results.push(...runnerResults);
      runnersInvoked.add(runnerId);
    } catch (err) {
      // Runner crashed — fail all its controls
      for (const control of runnerControls) {
        results.push({
          controlId: control.id,
          runnerId,
          status: "fail",
          severity: control.severity,
          details: `Runner "${runnerId}" threw: ${err instanceof Error ? err.message : String(err)}`,
          evidence: {
            check: control.name,
            finding: "runner_error",
            targets: [runnerId],
            data: { error: err instanceof Error ? err.message : String(err) },
          },
          remediation: control.remediation,
          timestamp: new Date(),
        });
      }
    }
  }

  // 4. Aggregate results
  const scorecard = aggregateResults(results, controls, request.stage);

  // 5. Generate evidence bundle
  const evidence = generateEvidenceBundle(
    scorecard,
    ctx.commitRef || "unknown",
    request.actor?.id || "system",
    request.stage
  );

  // 6. Store in history
  const result: ScorecardResult = {
    scorecard,
    evidence,
    controlsEvaluated: controls.length,
    runnersInvoked: Array.from(runnersInvoked),
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
