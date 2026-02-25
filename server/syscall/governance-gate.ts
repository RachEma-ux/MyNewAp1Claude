/**
 * Syscall Governance Gate — Deny-by-default policy enforcement
 *
 * Every syscall passes through this gate BEFORE adapter execution.
 * If the gate returns deny, the adapter is never called.
 *
 * Checks (in order):
 *   1. Action exists in adapter registry
 *   2. Operator is allowed to request this action
 *   3. Autonomy level is sufficient
 *   4. Branch restrictions (git actions)
 *   5. Path restrictions (fs actions)
 *   6. Read-only enforcement for auditor/governance operators
 */

import type {
  Syscall,
  SyscallAction,
  OperatorName,
  AutonomyLevel,
  GovernanceDecision,
  GovernanceVerdict,
} from "@shared/operator-types";
import { OPERATOR_CAPABILITIES } from "@shared/operator-types";
import { getAdapter } from "./adapters";

// ============================================================================
// Restricted patterns
// ============================================================================

const PROTECTED_BRANCHES = ["main", "master", "production", "release"];

const PROTECTED_PATHS = [
  ".env",
  ".github/workflows/",
  "drizzle/",
  "node_modules/",
  "dist/",
];

// ============================================================================
// Gate evaluation
// ============================================================================

export function evaluateSyscallGate(
  syscall: Syscall,
  syscallIndex: number,
  operator: OperatorName,
  autonomyLevel: AutonomyLevel,
): GovernanceDecision {
  const now = new Date().toISOString();
  const base: Omit<GovernanceDecision, "verdict" | "reason"> = {
    policyRef: "syscall-governance-gate-v1",
    evaluatedAt: now,
    syscallIndex,
    action: syscall.action,
  };

  // 1. Action must have a registered adapter
  const adapter = getAdapter(syscall.action);
  if (!adapter) {
    return { ...base, verdict: "deny", reason: `Unknown action: ${syscall.action}` };
  }

  // 2. Operator capability check
  const capability = OPERATOR_CAPABILITIES[operator];
  if (!capability) {
    return { ...base, verdict: "deny", reason: `Unknown operator: ${operator}` };
  }

  if (capability.deniedActions.includes(syscall.action)) {
    return {
      ...base,
      verdict: "deny",
      reason: `Operator "${operator}" is denied action "${syscall.action}" by capability matrix`,
    };
  }

  if (!capability.allowedActions.includes(syscall.action)) {
    return {
      ...base,
      verdict: "deny",
      reason: `Operator "${operator}" is not allowed action "${syscall.action}" — not in allowedActions`,
    };
  }

  // 3. Autonomy level check
  const requiredLevel = Math.max(
    adapter.requiredAutonomyLevel,
    syscall.requiredAutonomyLevel,
  );

  if (autonomyLevel < requiredLevel) {
    return {
      ...base,
      verdict: "deny",
      reason: `Autonomy level ${autonomyLevel} insufficient for "${syscall.action}" (requires ${requiredLevel})`,
    };
  }

  if (autonomyLevel > capability.maxAutonomyLevel) {
    return {
      ...base,
      verdict: "deny",
      reason: `Operator "${operator}" max autonomy is ${capability.maxAutonomyLevel}, but level ${autonomyLevel} was requested`,
    };
  }

  // 4. Branch restrictions for git actions
  if (syscall.action.startsWith("git.")) {
    const branch = (syscall.args as Record<string, unknown>).branch as string | undefined;
    const head = (syscall.args as Record<string, unknown>).head as string | undefined;
    const targetBranch = branch || head;

    if (targetBranch && PROTECTED_BRANCHES.includes(targetBranch) && autonomyLevel < 5) {
      // Allow pushing TO protected branches only at autonomy level 5
      if (syscall.action === "git.push" || syscall.action === "git.commit") {
        return {
          ...base,
          verdict: "deny",
          reason: `Direct ${syscall.action} to protected branch "${targetBranch}" requires autonomy level 5`,
        };
      }
    }
  }

  // 5. Path restrictions for fs actions
  if (syscall.action.startsWith("fs.") && syscall.action !== "fs.read") {
    const filePath = (syscall.args as Record<string, unknown>).path as string | undefined;
    if (filePath) {
      for (const restricted of PROTECTED_PATHS) {
        if (filePath.startsWith(restricted) || filePath === restricted.replace(/\/$/, "")) {
          return {
            ...base,
            verdict: "deny",
            reason: `Write to protected path "${restricted}" is forbidden`,
          };
        }
      }
    }
  }

  // 6. Passed all checks
  return { ...base, verdict: "allow", reason: "All governance checks passed" };
}
