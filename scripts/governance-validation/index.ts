#!/usr/bin/env npx tsx
/**
 * Governance Enforcement Validation Harness
 *
 * Deterministic verifier that proves non-bypassable enforcement.
 * Runs locally + in CI. Exit code non-zero on any violation.
 *
 * Usage:
 *   npx tsx scripts/governance-validation/index.ts
 *   npx tsx scripts/governance-validation/index.ts --json
 *   npx tsx scripts/governance-validation/index.ts --ci
 */

import * as path from "path";
import { fileURLToPath } from "url";
import { loadCoverageMap, type CoverageEntry } from "./loadCoverageMap";
import { probeMutationGovernance } from "./probes/probeMutationGovernance";
import { probeFreezeBlock } from "./probes/probeFreezeBlock";
import { probeTransportDeny } from "./probes/probeTransportDeny";
import { probeAuditTrail } from "./probes/probeAuditTrail";
import { probeEvidenceVault } from "./probes/probeEvidenceVault";
import { probePrincipalAttribution } from "./probes/probePrincipalAttribution";
import { probeContractRoutes } from "./probes/probeContractRoutes";
import { probePlaceholderLogic } from "./probes/probePlaceholderLogic";
import { jsonReporter } from "./reporters/jsonReporter";
import { mdReporter } from "./reporters/mdReporter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

export interface ProbeResult {
  probeId: string;
  probeName: string;
  status: "PASS" | "FAIL" | "WARN";
  findings: Finding[];
  summary: string;
}

export interface Finding {
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  file: string;
  line: number;
  detail: string;
  attack?: string;
  expected?: string;
  actual?: string;
}

export interface ValidationReport {
  timestamp: string;
  version: "1.0";
  rootDir: string;
  probes: ProbeResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warned: number;
    criticalFindings: number;
    highFindings: number;
  };
  verdict: "PASS" | "FAIL";
}

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const ciMode = args.includes("--ci");

  if (!jsonMode) {
    console.log("══════════════════════════════════════════════════════════");
    console.log("  GOVERNANCE ENFORCEMENT VALIDATION HARNESS");
    console.log("══════════════════════════════════════════════════════════\n");
  }

  // Load coverage map (optional — probes work without it)
  let coverageEntries: CoverageEntry[] = [];
  try {
    coverageEntries = loadCoverageMap(ROOT);
  } catch {
    if (!jsonMode) console.log("[INFO] No coverage map found — probes will scan source directly\n");
  }

  // Run all probes
  const probes: ProbeResult[] = [];

  probes.push(probeContractRoutes(ROOT));
  probes.push(probeMutationGovernance(ROOT, coverageEntries));
  probes.push(probeFreezeBlock(ROOT));
  probes.push(probeTransportDeny(ROOT));
  probes.push(probeAuditTrail(ROOT));
  probes.push(probeEvidenceVault(ROOT));
  probes.push(probePrincipalAttribution(ROOT));
  probes.push(probePlaceholderLogic(ROOT));

  // Compute summary
  const allFindings = probes.flatMap((p) => p.findings);
  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    version: "1.0",
    rootDir: ROOT,
    probes,
    summary: {
      total: probes.length,
      passed: probes.filter((p) => p.status === "PASS").length,
      failed: probes.filter((p) => p.status === "FAIL").length,
      warned: probes.filter((p) => p.status === "WARN").length,
      criticalFindings: allFindings.filter((f) => f.severity === "critical").length,
      highFindings: allFindings.filter((f) => f.severity === "high").length,
    },
    verdict: probes.some((p) => p.status === "FAIL") ? "FAIL" : "PASS",
  };

  // Output
  const artifactDir = path.join(ROOT, "artifacts/governance/reports/validation");
  const fs = await import("fs");
  fs.mkdirSync(artifactDir, { recursive: true });

  const jsonPath = path.join(artifactDir, "validation-report.json");
  const mdPath = path.join(artifactDir, "validation-report.md");

  fs.writeFileSync(jsonPath, jsonReporter(report));
  fs.writeFileSync(mdPath, mdReporter(report));

  if (jsonMode) {
    console.log(jsonReporter(report));
  } else {
    // Console output
    for (const probe of probes) {
      const icon = probe.status === "PASS" ? "✓" : probe.status === "FAIL" ? "✗" : "⚠";
      console.log(`  [${icon}] ${probe.probeId}: ${probe.probeName} — ${probe.status}`);
      if (probe.findings.length > 0 && probe.status !== "PASS") {
        for (const f of probe.findings.slice(0, 5)) {
          console.log(`      ${f.severity.toUpperCase()}: ${f.title} (${f.file}:${f.line})`);
        }
        if (probe.findings.length > 5) {
          console.log(`      ... and ${probe.findings.length - 5} more`);
        }
      }
      console.log(`      ${probe.summary}\n`);
    }

    console.log("══════════════════════════════════════════════════════════");
    console.log(`  VERDICT: ${report.verdict}`);
    console.log(`  Probes: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.warned} warned`);
    console.log(`  Critical: ${report.summary.criticalFindings} | High: ${report.summary.highFindings}`);
    console.log(`  Report: ${jsonPath}`);
    console.log("══════════════════════════════════════════════════════════");
  }

  if (report.verdict === "FAIL") {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Validation harness failed:", err);
  process.exit(2);
});
