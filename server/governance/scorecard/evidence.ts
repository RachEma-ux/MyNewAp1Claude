/**
 * Evidence Bundle System — Governance Bible CGT v2
 *
 * Generates immutable evidence bundles for scorecard runs:
 *   - JSON artifact with all control results
 *   - SHA-256 hash for integrity verification
 *   - Timestamped, commit-referenced output
 *   - Structured for CI artifact upload
 */

import { createHash } from "crypto";
import type { AggregatedScorecard } from "./aggregator";
import { getDb } from "../../db";
import { evidenceBundles } from "../../../drizzle/schema";

// ============================================================================
// Types
// ============================================================================

export interface EvidenceBundle {
  /** Unique bundle ID */
  bundleId: string;
  /** Bundle version */
  version: "1.0";
  /** When the scorecard ran */
  timestamp: string;
  /** Git commit reference */
  commitRef: string;
  /** Who triggered the scorecard */
  triggeredBy: string;
  /** Target lifecycle stage */
  stage: string;
  /** Overall score */
  score: number;
  /** Gate pass/fail */
  gatePassed: boolean;
  /** Gate reason */
  gateReason: string;
  /** Risk breakdown */
  risk: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  /** Individual control results */
  controls: Array<{
    controlId: string;
    status: "pass" | "fail" | "skip";
    severity: string;
    details: string;
    evidence: {
      check: string;
      finding: string;
      targets: string[];
    };
    remediation: string;
  }>;
  /** Summary counts */
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  /** SHA-256 hash of the bundle content (excluding the hash itself) */
  integrityHash: string;
}

// ============================================================================
// Bundle Generator
// ============================================================================

/**
 * Generate an evidence bundle from an aggregated scorecard.
 */
export function generateEvidenceBundle(
  scorecard: AggregatedScorecard,
  commitRef: string,
  triggeredBy: string,
  stage: string
): EvidenceBundle {
  const timestamp = new Date().toISOString();
  const hash = createHash("sha256").update(`${timestamp}-${stage}-${triggeredBy}`).digest("hex").slice(0, 8);
  const bundleId = `EVB-${Date.now()}-${hash}`;

  // Build control results for bundle
  const controls = scorecard.controlResults.map((r) => ({
    controlId: r.controlId,
    status: r.status,
    severity: r.severity,
    details: r.details,
    evidence: {
      check: r.evidence.check,
      finding: r.evidence.finding,
      targets: r.evidence.targets,
    },
    remediation: r.remediation,
  }));

  // Build bundle without hash
  const bundleData = {
    bundleId,
    version: "1.0" as const,
    timestamp,
    commitRef,
    triggeredBy,
    stage,
    score: scorecard.score.score,
    gatePassed: scorecard.gateStatus.passed,
    gateReason: scorecard.gateStatus.reason,
    risk: scorecard.riskBreakdown,
    controls,
    summary: {
      total: scorecard.controlResults.length,
      passed: scorecard.passCount,
      failed: scorecard.failCount,
      skipped: scorecard.skipCount,
    },
  };

  // Compute integrity hash
  const integrityHash = computeHash(bundleData);

  return {
    ...bundleData,
    integrityHash,
  };
}

/**
 * Verify evidence bundle integrity.
 */
export function verifyBundleIntegrity(bundle: EvidenceBundle): boolean {
  const { integrityHash, ...rest } = bundle;
  const computed = computeHash(rest);
  return computed === integrityHash;
}

/**
 * Compute SHA-256 hash of an object.
 */
function computeHash(data: any): string {
  const json = JSON.stringify(data, null, 0); // deterministic serialization
  return createHash("sha256").update(json).digest("hex");
}

/**
 * Persist an evidence bundle to the database (content-addressed).
 * Blocking write — failure propagates to caller.
 */
export async function persistEvidenceBundle(bundle: EvidenceBundle): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db.insert(evidenceBundles).values({
    bundleId: bundle.bundleId,
    version: bundle.version,
    stage: bundle.stage,
    score: bundle.score,
    gatePassed: bundle.gatePassed,
    gateReason: bundle.gateReason,
    triggeredBy: bundle.triggeredBy,
    commitRef: bundle.commitRef,
    integrityHash: bundle.integrityHash,
    bundleData: bundle as unknown as Record<string, unknown>,
  });
}

/**
 * Format evidence bundle as a compact summary string for PR comments.
 */
export function formatBundleSummary(bundle: EvidenceBundle): string {
  const lines: string[] = [
    `## Governance Scorecard — ${bundle.stage.toUpperCase()} Gate`,
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Score | **${bundle.score}/100** |`,
    `| Gate | ${bundle.gatePassed ? "PASS" : "**FAIL**"} |`,
    `| Critical | ${bundle.risk.critical} |`,
    `| High | ${bundle.risk.high} |`,
    `| Medium | ${bundle.risk.medium} |`,
    `| Low | ${bundle.risk.low} |`,
    `| Controls | ${bundle.summary.passed}/${bundle.summary.total} passed |`,
    "",
  ];

  if (!bundle.gatePassed) {
    lines.push(`### Gate Blocked`);
    lines.push(`> ${bundle.gateReason}`);
    lines.push("");

    const failures = bundle.controls.filter((c) => c.status === "fail");
    if (failures.length > 0) {
      lines.push(`### Failing Controls`);
      for (const f of failures) {
        lines.push(`- **${f.controlId}** [${f.severity.toUpperCase()}]: ${f.details}`);
        lines.push(`  - Remediation: ${f.remediation}`);
      }
    }
  }

  lines.push("");
  lines.push(`---`);
  lines.push(`Bundle: \`${bundle.bundleId}\` | Commit: \`${bundle.commitRef.slice(0, 7)}\` | ${bundle.timestamp}`);

  return lines.join("\n");
}
