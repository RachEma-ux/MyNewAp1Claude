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

// ── Phase 19a: per-call MCP governance ─────────────────────────────────────
//
// `evaluateGovernance` (above) is the static draft-readiness check fired
// at publish time and from the studio UI. The two functions below are
// the per-call MCP governance hooks called by the dispatcher around
// every `tools/call` invocation. They are intentionally lightweight —
// the dispatcher path runs on every MCP tool call so deep policy
// evaluation lives elsewhere.
//
// The contract: pre-invoke can return `deny` to short-circuit the call,
// post-invoke is informational (allow or warn — the call already ran).
// Both consult the agent's `governancePolicy` blob from the draft.

export interface EvaluateMcpPreInvokeInput {
  agentDraftId: number;
  toolName: string;        // "mcp__server__tool"
  serverName: string;
  remoteToolName: string;
  args: Record<string, unknown>;
  source: string;
}

export interface EvaluateMcpPreInvokeResult {
  verdict: "allow" | "deny" | "warn";
  reason?: string;
}

export interface EvaluateMcpPostInvokeInput {
  agentDraftId: number;
  toolName: string;
  serverName: string;
  remoteToolName: string;
  durationMs: number;
  ok: boolean;
  result?: unknown;
  errorMessage?: string;
}

export interface EvaluateMcpPostInvokeResult {
  verdict: "allow" | "warn";
  reason?: string;
}

/**
 * Pre-invoke check. Called by the MCP dispatcher BEFORE `conn.callTool`.
 * Reads the draft's `governancePolicy.blockedActions` list and returns
 * `deny` if the toolName matches an entry. Otherwise `allow`.
 *
 * The matching is substring-based (case-insensitive) — `blockedActions`
 * is a free-form string list configured by the user, not a regex grammar.
 * If the user wants regex matching they can wrap the policy engine.
 *
 * SYSTEM_DRAFT_ID (-1) → always returns `allow` (system calls bypass
 * governance, matching the legacy `mcpManager.callMcpTool` semantics).
 */
export async function evaluateMcpPreInvoke(
  input: EvaluateMcpPreInvokeInput
): Promise<EvaluateMcpPreInvokeResult> {
  if (input.agentDraftId === -1) {
    return { verdict: "allow" };
  }

  let draft;
  try {
    // Look up the draft directly by id rather than by agentId — the
    // dispatcher already has the draftId so we don't need to round-trip.
    draft = await repo.getDraftById(input.agentDraftId);
  } catch (e) {
    // DB read failure → fail closed
    return {
      verdict: "deny",
      reason: `Failed to load governance policy: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!draft) {
    return {
      verdict: "deny",
      reason: `Agent draft ${input.agentDraftId} not found`,
    };
  }

  const policy = (draft.governancePolicy ?? {}) as Record<string, unknown>;
  const blocked = Array.isArray(policy.blockedActions)
    ? (policy.blockedActions as string[])
    : [];
  const lowerTool = input.toolName.toLowerCase();
  const lowerRemote = input.remoteToolName.toLowerCase();
  const hit = blocked.find((b) => {
    const lb = b.toLowerCase();
    return lowerTool.includes(lb) || lowerRemote.includes(lb);
  });
  if (hit) {
    return {
      verdict: "deny",
      reason: `Blocked by governance policy: matches blockedActions entry "${hit}"`,
    };
  }

  // Optional: warn if the policy requires audit but the dispatcher path
  // is being used outside a runtime run (no audit row will be written).
  // The dispatcher itself handles this cleanly; this is just a hint.
  return { verdict: "allow" };
}

/**
 * Post-invoke check. Called by the MCP dispatcher AFTER `conn.callTool`
 * returns (success or failure). Today this is mostly informational —
 * future work can layer per-call cost tracking, latency SLAs, etc.
 *
 * Returns `warn` for slow calls (>10s) so the audit row reflects them
 * even when the call succeeded. Returns `allow` otherwise.
 */
export async function evaluateMcpPostInvoke(
  input: EvaluateMcpPostInvokeInput
): Promise<EvaluateMcpPostInvokeResult> {
  if (input.agentDraftId === -1) {
    return { verdict: "allow" };
  }
  if (input.durationMs > 10_000) {
    return {
      verdict: "warn",
      reason: `Slow MCP call: ${input.durationMs}ms exceeds 10s threshold`,
    };
  }
  if (!input.ok) {
    return {
      verdict: "warn",
      reason: input.errorMessage ?? "MCP tool call failed",
    };
  }
  return { verdict: "allow" };
}
