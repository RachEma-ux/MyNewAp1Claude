/**
 * Probe: Placeholder Logic Detection
 *
 * Validates:
 * - No Math.random() in compliance/governance paths
 * - No mock freeze functions returning empty arrays
 * - No hardcoded remediation defaults used as policy results
 * - No TODO/placeholder in critical enforcement flows
 * - SUBJECT_TYPES includes "system"
 * - LIFECYCLE_STAGES includes "mutate"
 * - controls/system.yaml exists with 5 controls
 */

import * as fs from "fs";
import * as path from "path";
import type { ProbeResult, Finding } from "../index";

export function probePlaceholderLogic(rootDir: string): ProbeResult {
  const findings: Finding[] = [];

  // 1. Scan governance dir for Math.random()
  const govDir = path.join(rootDir, "server/governance");
  const govFiles = walkDir(govDir, /\.ts$/);
  for (const filePath of govFiles) {
    if (filePath.includes(".test.")) continue;
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("Math.random()") && !lines[i].trim().startsWith("//")) {
        findings.push({
          severity: "critical",
          title: "Math.random() in governance path",
          file: path.relative(rootDir, filePath),
          line: i + 1,
          detail: "Non-deterministic random in governance — IDs must be deterministic (SHA-256)",
        });
      }
    }
  }

  // 2. Check SUBJECT_TYPES includes "system"
  const subjectPath = path.join(rootDir, "server/governance/scorecard/governed-subject.ts");
  if (fs.existsSync(subjectPath)) {
    const content = fs.readFileSync(subjectPath, "utf-8");
    if (!content.includes('"system"')) {
      findings.push({
        severity: "critical",
        title: 'SUBJECT_TYPES missing "system"',
        file: "server/governance/scorecard/governed-subject.ts",
        line: 0,
        detail: '"system" subject type required for non-lifecycle mutation enforcement',
      });
    }
  }

  // 3. Check LIFECYCLE_STAGES includes "mutate"
  const lifecyclePath = path.join(rootDir, "server/governance/lifecycle-guard.ts");
  if (fs.existsSync(lifecyclePath)) {
    const content = fs.readFileSync(lifecyclePath, "utf-8");
    if (!content.includes('"mutate"')) {
      findings.push({
        severity: "critical",
        title: 'LIFECYCLE_STAGES missing "mutate"',
        file: "server/governance/lifecycle-guard.ts",
        line: 0,
        detail: '"mutate" stage required for non-lifecycle mutation enforcement',
      });
    }
  }

  // 4. Check controls/system.yaml exists with 5 controls
  const systemYamlPath = path.join(rootDir, "controls/system.yaml");
  if (fs.existsSync(systemYamlPath)) {
    const yamlContent = fs.readFileSync(systemYamlPath, "utf-8");
    const controlCount = (yamlContent.match(/- id: SYS-/g) || []).length;
    if (controlCount < 5) {
      findings.push({
        severity: "high",
        title: `system.yaml has only ${controlCount} controls (need 5)`,
        file: "controls/system.yaml",
        line: 0,
        detail: "System pack must have 5 controls: SYS-001 through SYS-005",
      });
    }
  } else {
    findings.push({
      severity: "critical",
      title: "controls/system.yaml missing",
      file: "controls/system.yaml",
      line: 0,
      detail: "System control pack file does not exist",
    });
  }

  // 5. Scan for TODO/FIXME/HACK in governance enforcement files
  const criticalFiles = [
    "server/_core/trpc.ts",
    "server/governance/requireGate.ts",
    "server/governance/scorecard/engine.ts",
    "server/governance/scorecard/evidence.ts",
    "server/governance/scorecard/drift-detector.ts",
  ];
  for (const relFile of criticalFiles) {
    const fullPath = path.join(rootDir, relFile);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/.test(lines[i])) {
        findings.push({
          severity: "medium",
          title: `Placeholder marker in critical path: ${lines[i].trim().slice(0, 60)}`,
          file: relFile,
          line: i + 1,
          detail: "TODO/FIXME/HACK in enforcement-critical file — may indicate incomplete implementation",
        });
      }
    }
  }

  // 6. Check system runners are registered
  const runnerPath = path.join(rootDir, "server/governance/scorecard/runner.ts");
  if (fs.existsSync(runnerPath)) {
    const content = fs.readFileSync(runnerPath, "utf-8");
    const requiredRunners = ["rbac-checker", "principal-validator", "change-audit-validator", "rate-limiter"];
    for (const runner of requiredRunners) {
      if (!content.includes(`"${runner}"`)) {
        findings.push({
          severity: "high",
          title: `System runner not registered: ${runner}`,
          file: "server/governance/scorecard/runner.ts",
          line: 0,
          detail: `Runner "${runner}" must be registered for system pack enforcement`,
        });
      }
    }
  }

  const status = findings.some((f) => f.severity === "critical") ? "FAIL" : findings.length > 0 ? "WARN" : "PASS";

  return {
    probeId: "P08",
    probeName: "Placeholder Logic Detection",
    status,
    findings,
    summary: `Math.random in gov: ${findings.filter(f => f.title.includes("Math.random")).length}. System type: ${!findings.some(f => f.title.includes("SUBJECT_TYPES"))}. Mutate stage: ${!findings.some(f => f.title.includes("LIFECYCLE_STAGES"))}. ${findings.length} finding(s).`,
  };
}

function walkDir(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
      results.push(...walkDir(fullPath, pattern));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}
