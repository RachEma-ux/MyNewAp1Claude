#!/usr/bin/env tsx
/**
 * check:wiring-inventory
 *
 * Static check that the Application Wiring Inventory builder runs
 * without side effects, every KNOWN module appears, every required
 * area gets a status, and the markdown report can be rendered. Also
 * refreshes docs/architecture/modularity/MODULE_WIRING_REPORT.md.
 *
 * Exits 0 unless a structural invariant fails. Soft findings (missing
 * docs, partial wires) are reported but don't fail — the matrix is
 * the canonical view; this check is about the machinery itself.
 */
import { writeFileSync } from "fs";
import { join } from "path";
import {
  buildWiringMatrix,
  renderApplicationWiringReport,
  DEFAULT_MATRIX_COLUMNS,
  type WiringArea,
} from "../server/platform/wiring";
import { KNOWN_MODULES } from "../server/platform/modules/wiring-inventory";

interface Finding {
  severity: "blocker" | "high" | "medium" | "low";
  message: string;
}

function main() {
  const findings: Finding[] = [];
  const matrix = buildWiringMatrix();

  // 1. Every KNOWN module is present in the matrix.
  const present = new Set(matrix.modules.map((m) => m.moduleKey));
  for (const km of KNOWN_MODULES) {
    if (!present.has(km.key)) {
      findings.push({
        severity: "blocker",
        message: `Module '${km.key}' missing from inventory`,
      });
    }
  }

  // 2. Every module row has every column.
  for (const mod of matrix.modules) {
    for (const col of DEFAULT_MATRIX_COLUMNS) {
      if (!mod.areas.find((a) => a.area === col)) {
        findings.push({
          severity: "high",
          message: `Module '${mod.moduleKey}' missing area '${col}'`,
        });
      }
    }
  }

  // 3. Every module has a numeric readiness score.
  for (const mod of matrix.modules) {
    if (typeof mod.readinessScore !== "number" || Number.isNaN(mod.readinessScore)) {
      findings.push({
        severity: "blocker",
        message: `Module '${mod.moduleKey}' readinessScore not a number`,
      });
    }
  }

  // 4. Render the report — failure here is a structural bug.
  let report;
  try {
    report = renderApplicationWiringReport(matrix);
  } catch (err) {
    findings.push({
      severity: "blocker",
      message: `renderApplicationWiringReport threw: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // 5. Write the report to disk for review.
  if (report) {
    const target = join(
      process.cwd(),
      "docs",
      "architecture",
      "modularity",
      "MODULE_WIRING_REPORT.md",
    );
    try {
      writeFileSync(target, report.markdown, "utf8");
    } catch (err) {
      findings.push({
        severity: "low",
        message: `Could not write report: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // ---- Output ----
  console.log("Application Wiring Inventory");
  console.log("============================");
  console.log(`Modules:           ${matrix.modules.length}`);
  console.log(`Fully wired:       ${matrix.summary.fullyWiredCount}`);
  console.log(`Mostly / partial:  ${matrix.summary.mostlyWiredCount + matrix.summary.partialCount}`);
  console.log(`Declared-only:     ${matrix.summary.declaredOnlyCount}`);
  console.log(`Blocked:           ${matrix.summary.blockedCount}`);
  console.log(`Avg readiness:     ${matrix.summary.averageReadinessScore}`);
  console.log(`Missing required:  ${matrix.summary.missingRequiredWires}`);
  console.log("");

  // List per-module readiness for quick reading.
  for (const mod of matrix.modules) {
    const blockers = mod.blockers.length ? ` blockers=${mod.blockers.length}` : "";
    const warns = mod.warnings.length ? ` warnings=${mod.warnings.length}` : "";
    console.log(
      `  ${pad(mod.moduleKey, 24)} ${pad(mod.readinessStatus, 18)} ${pad(String(mod.readinessScore), 4)}${blockers}${warns}`,
    );
  }
  console.log("");

  const blockers = findings.filter((f) => f.severity === "blocker");
  const high = findings.filter((f) => f.severity === "high");
  if (findings.length === 0) {
    console.log("Inventory machinery healthy.");
    process.exit(0);
  }
  console.log("Findings:");
  for (const f of findings) {
    console.log(`  [${f.severity.padEnd(7)}] ${f.message}`);
  }
  if (blockers.length > 0 || high.length > 0) process.exit(1);
  process.exit(0);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

main();
