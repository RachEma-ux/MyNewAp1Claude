/**
 * Probe: Audit Trail Integrity
 *
 * Validates:
 * - AuditLogger exists and has required event fields
 * - Audit log includes actor_id, action_type, target_type, decision_result, timestamp
 * - Audit persistence is not silently dropped
 * - requireGate always produces audit events
 */

import * as fs from "fs";
import * as path from "path";
import type { ProbeResult, Finding } from "../index";

const REQUIRED_AUDIT_FIELDS = [
  "event_id",
  "timestamp",
  "actor_id",
  "action_type",
  "target_type",
  "decision_result",
];

export function probeAuditTrail(rootDir: string): ProbeResult {
  const findings: Finding[] = [];

  // 1. Check AuditLogger exists
  const auditPath = path.join(rootDir, "server/services/auditLogger.ts");
  if (!fs.existsSync(auditPath)) {
    findings.push({
      severity: "critical",
      title: "AuditLogger not found",
      file: "server/services/auditLogger.ts",
      line: 0,
      detail: "Audit logger module does not exist",
    });
    return { probeId: "P05", probeName: "Audit Trail Integrity", status: "FAIL", findings, summary: "AuditLogger missing" };
  }

  const auditContent = fs.readFileSync(auditPath, "utf-8");

  // 2. Check required fields in AuditEvent interface
  for (const field of REQUIRED_AUDIT_FIELDS) {
    if (!auditContent.includes(field)) {
      findings.push({
        severity: "high",
        title: `Audit event missing field: ${field}`,
        file: "server/services/auditLogger.ts",
        line: 0,
        detail: `AuditEvent interface must include ${field}`,
      });
    }
  }

  // 3. Check for fire-and-forget persistence
  if (auditContent.includes(".catch(")) {
    const lines = auditContent.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(".catch(") && lines[i + 1]?.includes("console.error")) {
        findings.push({
          severity: "medium",
          title: "Audit persistence is fire-and-forget",
          file: "server/services/auditLogger.ts",
          line: i + 1,
          detail: "DB write failure is caught and logged but does not block the mutation. Governance audit events should await persistence.",
          attack: "Exhaust DB connections → audit writes fail silently → mutations proceed without audit trail",
          expected: "Audit write failure blocks mutation",
          actual: "Mutation proceeds, error logged to console only",
        });
        break;
      }
    }
  }

  // 4. Check requireGate produces audit events
  const gatePath = path.join(rootDir, "server/governance/requireGate.ts");
  if (fs.existsSync(gatePath)) {
    const gateContent = fs.readFileSync(gatePath, "utf-8");
    const auditLogCalls = (gateContent.match(/audit\.log\(/g) || []).length;
    if (auditLogCalls < 3) {
      findings.push({
        severity: "high",
        title: `requireGate has only ${auditLogCalls} audit.log() calls`,
        file: "server/governance/requireGate.ts",
        line: 0,
        detail: "requireGate must audit: (1) subject freeze, (2) system freeze, (3) scorecard result. Need at least 3 audit points.",
      });
    }

    // Verify audit includes actor_id
    if (!gateContent.includes("actor_id: actor.id")) {
      findings.push({
        severity: "high",
        title: "requireGate audit may not include actor_id",
        file: "server/governance/requireGate.ts",
        line: 0,
        detail: "Every audit event in requireGate must attribute to the requesting actor",
      });
    }
  }

  // 5. Check for principalType field (human/ai/system)
  if (!auditContent.includes("principalType") && !auditContent.includes("principal_type")) {
    findings.push({
      severity: "low",
      title: "Audit lacks principalType field",
      file: "server/services/auditLogger.ts",
      line: 0,
      detail: "AuditEvent should distinguish human vs AI vs system principals",
    });
  }

  const status = findings.some((f) => f.severity === "critical") ? "FAIL" : findings.length > 0 ? "WARN" : "PASS";

  return {
    probeId: "P05",
    probeName: "Audit Trail Integrity",
    status,
    findings,
    summary: `Audit logger: exists. Fields: ${REQUIRED_AUDIT_FIELDS.length - findings.filter(f => f.title.includes("missing field")).length}/${REQUIRED_AUDIT_FIELDS.length}. ${findings.length} finding(s).`,
  };
}
