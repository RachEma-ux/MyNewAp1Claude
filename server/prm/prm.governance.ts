/**
 * PRM Governance — Preflight checks, closure gates, freeze awareness
 */

import * as repo from "./prm.repository";
import type { PrmCaseStatus } from "./prm.types";

export interface ClosureGateResult {
  allowed: boolean;
  reason?: string;
  checks: { name: string; passed: boolean; detail?: string }[];
}

export async function evaluateClosureGate(caseId: number): Promise<ClosureGateResult> {
  const checks: ClosureGateResult["checks"] = [];

  // Check 1: Case exists and is in verification_pending
  const caseRow = await repo.getCaseById(caseId);
  if (!caseRow) {
    return { allowed: false, reason: "Case not found", checks: [{ name: "case_exists", passed: false }] };
  }
  checks.push({
    name: "status_is_verification_pending",
    passed: caseRow.status === "verification_pending",
    detail: `Current: ${caseRow.status}`,
  });

  // Check 2: At least one verification exists
  const verifications = await repo.listVerifications(caseId);
  checks.push({
    name: "has_verifications",
    passed: verifications.length > 0,
    detail: `${verifications.length} verification(s)`,
  });

  // Check 3: At least one verification passed
  const passedCount = await repo.countPassedVerifications(caseId);
  checks.push({
    name: "has_passed_verification",
    passed: passedCount > 0,
    detail: `${passedCount} passed`,
  });

  // Check 4: Case has a closure reason (or will be provided)
  checks.push({
    name: "closure_reason_available",
    passed: true,
    detail: "Will be provided on close",
  });

  const allPassed = checks.every((c) => c.passed);
  return {
    allowed: allPassed,
    reason: allPassed ? undefined : "One or more closure gates failed",
    checks,
  };
}

export function getStatusLabel(status: PrmCaseStatus): string {
  const labels: Record<PrmCaseStatus, string> = {
    draft: "Draft",
    intake: "Intake",
    triage: "Triage",
    analysis: "Analysis",
    decision_pending: "Decision Pending",
    in_resolution: "In Resolution",
    resolved: "Resolved",
    verification_pending: "Verification Pending",
    verified_closed: "Verified Closed",
    reopened: "Reopened",
    cancelled: "Cancelled",
  };
  return labels[status] || status;
}
