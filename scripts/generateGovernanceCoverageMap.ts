/**
 * Governance Coverage Map — Unified Platform Governance v1
 *
 * Scans ALL server mutation entrypoints and asserts that each uses
 * governedProcedure (which calls requireGovernedAction under the hood).
 *
 * Output: governance-coverage.json
 * Exit code: 0 = all covered, 1 = gaps found
 *
 * Usage:
 *   npx tsx scripts/generateGovernanceCoverageMap.ts
 *
 * CI integration:
 *   Add as a step in the CI pipeline. Fails if any mutation bypasses governance.
 */

import * as fs from "fs";
import * as path from "path";

interface CoverageEntry {
  file: string;
  line: number;
  procedureName: string;
  procedureType: "governedProcedure" | "governedAdminProcedure" | "protectedProcedure" | "adminProcedure" | "publicProcedure" | "unknown";
  governed: boolean;
}

interface CoverageReport {
  timestamp: string;
  totalMutations: number;
  governedMutations: number;
  ungovernedMutations: number;
  coveragePercent: number;
  allCovered: boolean;
  entries: CoverageEntry[];
  violations: string[];
}

// Allowed ungoverned mutations (explicit exceptions with justification)
const ALLOWED_UNGOVERNED = new Set([
  // auth.logout is a public procedure — no user context available
  "auth.logout",
]);

function scanFile(filePath: string, relPath: string): CoverageEntry[] {
  const entries: CoverageEntry[] = [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect .mutation( patterns
    if (!line.includes(".mutation(")) continue;

    // Look backwards to find the procedure type
    let procedureType: CoverageEntry["procedureType"] = "unknown";
    let procedureName = "unknown";

    // Check current line and up to 5 lines above for procedure declaration
    for (let j = i; j >= Math.max(0, i - 5); j--) {
      const checkLine = lines[j];

      if (checkLine.includes("governedAdminProcedure")) {
        procedureType = "governedAdminProcedure";
      } else if (checkLine.includes("governedProcedure")) {
        procedureType = "governedProcedure";
      } else if (checkLine.includes("adminProcedure")) {
        procedureType = "adminProcedure";
      } else if (checkLine.includes("protectedProcedure")) {
        procedureType = "protectedProcedure";
      } else if (checkLine.includes("publicProcedure")) {
        procedureType = "publicProcedure";
      }

      // Extract procedure name (e.g., "create:", "delete:", etc.)
      const nameMatch = checkLine.match(/^\s*(\w+)\s*:/);
      if (nameMatch && procedureName === "unknown") {
        procedureName = nameMatch[1];
      }

      if (procedureType !== "unknown") break;
    }

    const governed =
      procedureType === "governedProcedure" ||
      procedureType === "governedAdminProcedure";

    entries.push({
      file: relPath,
      line: i + 1,
      procedureName,
      procedureType,
      governed,
    });
  }

  return entries;
}

function generateCoverageMap(rootDir: string): CoverageReport {
  const entries: CoverageEntry[] = [];

  // Directories to scan
  const scanDirs = [
    "server",
  ];

  function walkDir(dir: string) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (item === "node_modules" || item === "dist" || item === "__tests__") continue;
        walkDir(fullPath);
      } else if (
        item.endsWith(".ts") &&
        !item.endsWith(".test.ts") &&
        !item.endsWith(".d.ts") &&
        !item.endsWith(".spec.ts")
      ) {
        const relPath = path.relative(rootDir, fullPath);
        const fileEntries = scanFile(fullPath, relPath);
        entries.push(...fileEntries);
      }
    }
  }

  for (const dir of scanDirs) {
    const fullDir = path.join(rootDir, dir);
    if (fs.existsSync(fullDir)) {
      walkDir(fullDir);
    }
  }

  // Filter out allowed ungoverned mutations
  const violations = entries
    .filter((e) => !e.governed && !ALLOWED_UNGOVERNED.has(e.procedureName))
    .map((e) => `UNGOVERNED: ${e.file}:${e.line} — ${e.procedureName} (${e.procedureType})`);

  const totalMutations = entries.length;
  const governedMutations = entries.filter((e) => e.governed).length;
  const ungovernedMutations = violations.length;
  const coveragePercent =
    totalMutations > 0
      ? Math.round((governedMutations / totalMutations) * 100)
      : 100;

  return {
    timestamp: new Date().toISOString(),
    totalMutations,
    governedMutations,
    ungovernedMutations,
    coveragePercent,
    allCovered: violations.length === 0,
    entries,
    violations,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

const rootDir = path.resolve(__dirname, "..");
const report = generateCoverageMap(rootDir);

// Write report
const outputPath = path.join(rootDir, "governance-coverage.json");
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

// Console output
console.log("\n══════════════════════════════════════════════════════════════");
console.log("  GOVERNANCE COVERAGE MAP — Unified Platform Governance v1");
console.log("══════════════════════════════════════════════════════════════\n");
console.log(`  Total mutations:     ${report.totalMutations}`);
console.log(`  Governed mutations:  ${report.governedMutations}`);
console.log(`  Ungoverned:          ${report.ungovernedMutations}`);
console.log(`  Coverage:            ${report.coveragePercent}%`);
console.log(`  Status:              ${report.allCovered ? "✓ ALL COVERED" : "✗ GAPS FOUND"}`);

if (report.violations.length > 0) {
  console.log("\n  Violations:");
  for (const v of report.violations) {
    console.log(`    ${v}`);
  }
  console.log("");
  process.exit(1);
} else {
  console.log("\n  All mutations are governed. No bypass detected.\n");
  process.exit(0);
}
