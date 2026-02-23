/**
 * Probe: Evidence Vault Integrity
 *
 * Validates:
 * - Evidence is content-addressed (SHA-256)
 * - Evidence has verify-on-read function
 * - No Math.random() in evidence generation
 * - Evidence is linked to governance runs
 */

import * as fs from "fs";
import * as path from "path";
import type { ProbeResult, Finding } from "../index";

export function probeEvidenceVault(rootDir: string): ProbeResult {
  const findings: Finding[] = [];

  const evidencePath = path.join(rootDir, "server/governance/scorecard/evidence.ts");
  if (!fs.existsSync(evidencePath)) {
    findings.push({
      severity: "critical",
      title: "Evidence module not found",
      file: "server/governance/scorecard/evidence.ts",
      line: 0,
      detail: "Evidence bundle system does not exist",
    });
    return { probeId: "P06", probeName: "Evidence Vault Integrity", status: "FAIL", findings, summary: "Evidence module missing" };
  }

  const content = fs.readFileSync(evidencePath, "utf-8");
  const lines = content.split("\n");

  // 1. Check SHA-256 usage
  if (!content.includes("sha256")) {
    findings.push({
      severity: "critical",
      title: "Evidence not content-addressed with SHA-256",
      file: "server/governance/scorecard/evidence.ts",
      line: 0,
      detail: "Evidence bundles must use SHA-256 for integrity hashing",
    });
  }

  if (!content.includes("createHash")) {
    findings.push({
      severity: "critical",
      title: "No createHash import — integrity hash may be fake",
      file: "server/governance/scorecard/evidence.ts",
      line: 0,
      detail: "Must use crypto.createHash for real SHA-256 hashing",
    });
  }

  // 2. Check verify function exists
  if (!content.includes("verifyBundleIntegrity")) {
    findings.push({
      severity: "critical",
      title: "verifyBundleIntegrity function missing",
      file: "server/governance/scorecard/evidence.ts",
      line: 0,
      detail: "Must have a verify-on-read function that recomputes and compares hash",
    });
  }

  // 3. Check for Math.random() — must not exist in evidence paths
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Math.random()")) {
      findings.push({
        severity: "critical",
        title: "Math.random() found in evidence module",
        file: "server/governance/scorecard/evidence.ts",
        line: i + 1,
        detail: "Evidence IDs must be deterministic — Math.random() is non-reproducible",
      });
    }
  }

  // 4. Check integrityHash field exists in EvidenceBundle type
  if (!content.includes("integrityHash")) {
    findings.push({
      severity: "high",
      title: "EvidenceBundle missing integrityHash field",
      file: "server/governance/scorecard/evidence.ts",
      line: 0,
      detail: "Bundle type must include integrityHash for tamper detection",
    });
  }

  // 5. Check evidence linkage (bundleId in scorecard/gate results)
  const gatePath = path.join(rootDir, "server/governance/requireGate.ts");
  if (fs.existsSync(gatePath)) {
    const gateContent = fs.readFileSync(gatePath, "utf-8");
    if (!gateContent.includes("evidenceBundleId") && !gateContent.includes("evidence.bundleId")) {
      findings.push({
        severity: "medium",
        title: "Evidence not linked in requireGate audit",
        file: "server/governance/requireGate.ts",
        line: 0,
        detail: "Gate audit events should include evidenceBundleId for traceability",
      });
    }
  }

  // 6. Check for persistent evidence storage
  // Evidence should be stored in DB or file system, not just returned
  if (!content.includes("insert") && !content.includes("writeFile") && !content.includes("persist")) {
    findings.push({
      severity: "medium",
      title: "Evidence bundles have no persistent storage",
      file: "server/governance/scorecard/evidence.ts",
      line: 0,
      detail: "Evidence is generated and returned but not persisted to DB or filesystem. Bundles are ephemeral.",
    });
  }

  const status = findings.some((f) => f.severity === "critical") ? "FAIL" : findings.length > 0 ? "WARN" : "PASS";

  return {
    probeId: "P06",
    probeName: "Evidence Vault Integrity",
    status,
    findings,
    summary: `SHA-256: ${content.includes("sha256") ? "yes" : "NO"}. Verify: ${content.includes("verifyBundleIntegrity") ? "yes" : "NO"}. Math.random: ${!content.includes("Math.random()") ? "clean" : "FOUND"}. ${findings.length} finding(s).`,
  };
}
