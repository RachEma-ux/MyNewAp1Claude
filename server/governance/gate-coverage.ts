/**
 * Gate Coverage Map — Governance Bible CGT v2
 *
 * Phase 6 — Gate Coverage Verification
 * Role: CE-B (CI/CD & Runners Owner)
 *
 * Scans the Express/tRPC router layer to:
 *   1. Detect all lifecycle-mutation endpoints
 *   2. Verify each has requireGate attached
 *   3. Generate gate.coverage.json
 *   4. Fail CI if enforcement is missing
 *
 * Coverage requirements:
 *   - register → requireGate("register")
 *   - validate → requireGate("validate")
 *   - publish  → requireGate("publish")
 *   - Every lifecycle mutation must be gated
 *   - No ungated paths allowed
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Types
// ============================================================================

export interface GateCoverageEntry {
  /** Endpoint path or procedure name */
  endpoint: string;
  /** HTTP method or tRPC type */
  method: string;
  /** Lifecycle stage this endpoint mutates */
  stage: string;
  /** Whether requireGate is attached */
  gated: boolean;
  /** Whether blockIfFrozen is attached */
  freezeChecked: boolean;
  /** Source file */
  sourceFile: string;
  /** Line number (approximate) */
  line?: number;
}

export interface GateCoverageReport {
  /** When the scan ran */
  timestamp: string;
  /** Git commit ref */
  commitRef: string;
  /** Total lifecycle endpoints found */
  totalEndpoints: number;
  /** Endpoints with gate enforcement */
  gatedEndpoints: number;
  /** Endpoints missing gate enforcement */
  ungatedEndpoints: number;
  /** Coverage percentage */
  coveragePercent: number;
  /** Whether all endpoints are covered */
  allCovered: boolean;
  /** Individual endpoint entries */
  entries: GateCoverageEntry[];
  /** Violations (ungated endpoints) */
  violations: string[];
}

// ============================================================================
// Lifecycle Patterns to Detect
// ============================================================================

const LIFECYCLE_PATTERNS = [
  // tRPC procedure patterns (in governance router)
  { pattern: /scorecardRun|runScorecard/i, stage: "validate", method: "mutation" },
  { pattern: /lifecycle.*transition|transition.*lifecycle/i, stage: "validate", method: "mutation" },
  { pattern: /publish|publication/i, stage: "publish", method: "mutation" },
  { pattern: /register/i, stage: "register", method: "mutation" },
  { pattern: /validate.*stage|stage.*validate/i, stage: "validate", method: "mutation" },
  { pattern: /promote|advance.*stage/i, stage: "validate", method: "mutation" },

  // Express endpoint patterns
  { pattern: /\/register/i, stage: "register", method: "POST" },
  { pattern: /\/validate/i, stage: "validate", method: "POST" },
  { pattern: /\/publish/i, stage: "publish", method: "POST" },
  { pattern: /\/promote/i, stage: "validate", method: "POST" },
];

// Gate enforcement patterns to look for
const GATE_PATTERNS = [
  /requireGate/,
  /enforceTRPCGate/,
  /requireGateMiddleware/,
  /enforceScorecard/,
  /enforceLifecycleTransition/,
];

const FREEZE_PATTERNS = [
  /blockIfFrozen/,
  /enforceTRPCFreezeCheck/,
  /isFrozen/,
  /checkFrozen/,
];

// ============================================================================
// Scanner
// ============================================================================

/**
 * Scan source files for lifecycle endpoints and verify gate enforcement.
 */
export function generateGateCoverage(projectRoot?: string): GateCoverageReport {
  const root = projectRoot || process.cwd();
  const entries: GateCoverageEntry[] = [];

  // Files to scan for lifecycle endpoints
  const filesToScan = [
    "server/governance/router.ts",
    "server/governance/stage-review.ts",
    "server/routers.ts",
  ];

  // Also scan routers directory
  const routersDir = path.join(root, "server/routers");
  try {
    if (fs.existsSync(routersDir)) {
      const routerFiles = fs.readdirSync(routersDir)
        .filter((f) => f.endsWith(".ts"))
        .map((f) => `server/routers/${f}`);
      filesToScan.push(...routerFiles);
    }
  } catch { /* ignore */ }

  for (const relPath of filesToScan) {
    const fullPath = path.join(root, relPath);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const { pattern, stage, method } of LIFECYCLE_PATTERNS) {
          if (pattern.test(line)) {
            // Look in surrounding context (50 lines) for gate enforcement
            const context = lines.slice(Math.max(0, i - 10), i + 50).join("\n");

            const gated = GATE_PATTERNS.some((p) => p.test(context));
            const freezeChecked = FREEZE_PATTERNS.some((p) => p.test(context));

            // Avoid duplicate entries
            const endpoint = line.trim().slice(0, 80);
            const exists = entries.some((e) =>
              e.sourceFile === relPath && Math.abs((e.line || 0) - (i + 1)) < 5
            );
            if (exists) continue;

            entries.push({
              endpoint,
              method,
              stage,
              gated,
              freezeChecked,
              sourceFile: relPath,
              line: i + 1,
            });
          }
        }
      }
    } catch { /* skip unreadable files */ }
  }

  // Calculate coverage
  const totalEndpoints = entries.length;
  const gatedEndpoints = entries.filter((e) => e.gated).length;
  const ungatedEndpoints = entries.filter((e) => !e.gated).length;
  const coveragePercent = totalEndpoints > 0 ? Math.round((gatedEndpoints / totalEndpoints) * 100) : 100;
  const violations = entries.filter((e) => !e.gated).map((e) =>
    `UNGATED: ${e.sourceFile}:${e.line} — ${e.endpoint} (stage: ${e.stage})`
  );

  let commitRef = "unknown";
  try {
    const { execSync } = require("child_process");
    commitRef = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch { /* ignore */ }

  return {
    timestamp: new Date().toISOString(),
    commitRef,
    totalEndpoints,
    gatedEndpoints,
    ungatedEndpoints,
    coveragePercent,
    allCovered: ungatedEndpoints === 0,
    entries,
    violations,
  };
}

/**
 * Write gate coverage report to file.
 */
export function writeGateCoverageReport(outputPath?: string): GateCoverageReport {
  const report = generateGateCoverage();
  const out = outputPath || path.join(process.cwd(), "governance", "gate.coverage.json");

  try {
    const dir = path.dirname(out);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
  } catch {
    // Non-fatal: coverage report is informational
  }

  return report;
}

/**
 * Validate gate coverage — returns true if all endpoints are gated.
 * Used in CI to fail the build on missing enforcement.
 */
export function validateGateCoverage(): { passed: boolean; report: GateCoverageReport } {
  const report = generateGateCoverage();
  return {
    passed: report.allCovered,
    report,
  };
}
