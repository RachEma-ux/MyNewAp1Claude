/**
 * AI Agent Studio — Governance Adapter
 *
 * Computes governance verdict (pass / warning / blocked) for an agent draft
 * based on its policy, tools, and required gates.
 *
 * This is the adapter to platform governance — it does NOT bypass platform
 * gates. Mutations like publish go through `governedProcedure` which calls
 * `requireGovernedAction()` at the platform level. This service evaluates the
 * AI Agent Studio's *internal* readiness for governance, then surfaces the
 * verdict in the UI so users see issues before triggering platform gates.
 */

import * as repo from "../repository";
import type { AgsGovernanceVerdict } from "../shared/constants";

export interface GovernanceVerdictResult {
  verdict: AgsGovernanceVerdict;
  reasons: GovernanceReason[];
  riskScore: number;
  policySummary: PolicySummary;
}

export interface GovernanceReason {
  severity: "info" | "warning" | "blocker";
  rule: string;
  message: string;
}

export interface PolicySummary {
  blockedActions: string[];
  approvalRequired: boolean;
  budgetCeiling: number | null;
  auditRequired: boolean;
  killSwitchEnabled: boolean;
  freezeRules: string[];
  confidenceThreshold: number | null;
}

export async function evaluateGovernance(agentId: number): Promise<GovernanceVerdictResult> {
  const draft = await repo.getCurrentDraft(agentId);
  if (!draft) {
    return {
      verdict: "blocked",
      reasons: [{ severity: "blocker", rule: "draft.exists", message: "No current draft" }],
      riskScore: 100,
      policySummary: emptyPolicySummary(),
    };
  }

  const policy = (draft.governancePolicy ?? {}) as Record<string, any>;
  const tools = await repo.listToolBindings(draft.id);
  const reasons: GovernanceReason[] = [];
  let risk = 0;

  // ── Policy completeness ──
  const summary: PolicySummary = {
    blockedActions: Array.isArray(policy.blockedActions) ? policy.blockedActions : [],
    approvalRequired: Boolean(policy.approvalRequired),
    budgetCeiling: typeof policy.budgetCeiling === "number" ? policy.budgetCeiling : null,
    auditRequired: Boolean(policy.auditRequired),
    killSwitchEnabled: Boolean(policy.killSwitchEnabled),
    freezeRules: Array.isArray(policy.freezeRules) ? policy.freezeRules : [],
    confidenceThreshold:
      typeof policy.confidenceThreshold === "number" ? policy.confidenceThreshold : null,
  };

  if (!summary.auditRequired) {
    reasons.push({
      severity: "warning",
      rule: "policy.audit",
      message: "Audit logging is not required by policy",
    });
    risk += 10;
  }
  if (!summary.killSwitchEnabled) {
    reasons.push({
      severity: "warning",
      rule: "policy.killSwitch",
      message: "Kill switch is not enabled",
    });
    risk += 5;
  }
  if (summary.budgetCeiling === null) {
    reasons.push({
      severity: "warning",
      rule: "policy.budget",
      message: "No budget ceiling configured",
    });
    risk += 10;
  }

  // ── Tool risk ──
  for (const t of tools) {
    const allowed = (t.allowedActions ?? []) as string[];
    const destructive = allowed.filter((a) => /delete|drop|destroy|wipe|erase/i.test(a));
    if (destructive.length > 0 && !t.requiresApproval) {
      reasons.push({
        severity: "blocker",
        rule: "tool.destructive_no_approval",
        message: `Tool '${t.toolName}' permits destructive action without approval`,
      });
      risk += 40;
    } else if (destructive.length > 0) {
      reasons.push({
        severity: "warning",
        rule: "tool.destructive",
        message: `Tool '${t.toolName}' permits destructive action — approval required`,
      });
      risk += 5;
    }
    if (!t.auditRequired) {
      reasons.push({
        severity: "warning",
        rule: "tool.audit",
        message: `Tool '${t.toolName}' is not audit-required`,
      });
      risk += 5;
    }
  }

  // ── Memory + privacy risks ──
  const memory = await repo.listMemoryConfigs(draft.id);
  const persistentEnabled = memory.find(
    (m) => m.memoryType === "persistent" && m.enabled
  );
  if (persistentEnabled && !persistentEnabled.retentionDays) {
    reasons.push({
      severity: "warning",
      rule: "memory.retention",
      message: "Persistent memory enabled without retention",
    });
    risk += 10;
  }

  // ── Verdict ──
  const hasBlocker = reasons.some((r) => r.severity === "blocker");
  const hasWarning = reasons.some((r) => r.severity === "warning");
  const verdict: AgsGovernanceVerdict = hasBlocker
    ? "blocked"
    : hasWarning
      ? "warning"
      : "pass";

  return {
    verdict,
    reasons,
    riskScore: Math.min(100, risk),
    policySummary: summary,
  };
}

function emptyPolicySummary(): PolicySummary {
  return {
    blockedActions: [],
    approvalRequired: false,
    budgetCeiling: null,
    auditRequired: false,
    killSwitchEnabled: false,
    freezeRules: [],
    confidenceThreshold: null,
  };
}
