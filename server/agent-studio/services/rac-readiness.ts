/**
 * RAC P10 — Export-time readiness verdict (D-TOOL-4 + D-SBX-2).
 *
 * Pure scorer. Maps an agent's tool risk-class set + the live sandbox
 * health snapshot onto the three-state ladder declared in
 * `RacReadinessStatus`:
 *
 *   - `"ready"`     — read-only tools only, OR code_execution +
 *                     healthy sandbox.
 *   - `"degraded"`  — agent uses side-effecting / governance-sensitive
 *                     classes (write / external_side_effect /
 *                     destructive / governance_sensitive /
 *                     credential_sensitive). Export still proceeds; the
 *                     wizard surfaces the warning so reviewers add
 *                     approval policies before the catalog row goes hot.
 *   - `"blocked"`   — hard-block. Two triggers per the plan §10:
 *                       (a) any `quarantined` tool (D-TOOL-1 default-deny);
 *                       (b) `code_execution` without a healthy sandbox
 *                           (D-SBX-2 prerequisite).
 *
 * The function is intentionally LOOKUP-FREE — callers (export-catalog
 * `buildExportCandidate`) inject the resolved risk-class list and the
 * sandbox health snapshot. That keeps unit tests pure (D-SBX-4: no
 * mocking the sandbox) and lets the readiness gate run inside any
 * pipeline that already knows the agent's tool list.
 */

import type { ToolRiskClass } from "./cag/types";
import type {
  AgentStudioRacReadinessSnapshot,
  AgentStudioSandboxHealthSnapshot,
} from "../shared/export-candidate";

/**
 * Reason codes produced by the matrix walk. Stable strings — UI tooltips
 * and audit diffs key off these. Add new codes only when adding a new
 * matrix row; never repurpose.
 */
export type RacReadinessReasonCode =
  | "sandbox_required"
  | "sandbox_unhealthy"
  | "quarantined_tool"
  | "write_requires_approval"
  | "external_side_effect_requires_approval"
  | "destructive_requires_approval"
  | "governance_sensitive_requires_approval"
  | "credential_sensitive_requires_secret_path";

export interface ComputeRacReadinessInput {
  /**
   * Risk classes of every tool bound to the agent's published draft.
   * Duplicates are tolerated — the function dedupes internally.
   */
  toolRiskClasses: ReadonlyArray<ToolRiskClass>;
  /**
   * Live sandbox health snapshot. `null` when no impl is registered
   * (treated as `code_execution`-blocking per D-SBX-2). Pass the
   * result of `getToolSandbox().health()` (or null when the registry
   * threw `SandboxUnavailableError`).
   */
  sandboxHealth: AgentStudioSandboxHealthSnapshot | null;
  /** When the snapshot was taken; defaults to `new Date()`. */
  computedAt?: Date;
}

const SIDE_EFFECT_REASON_BY_CLASS: ReadonlyMap<
  ToolRiskClass,
  RacReadinessReasonCode
> = new Map([
  ["write", "write_requires_approval"],
  ["external_side_effect", "external_side_effect_requires_approval"],
  ["destructive", "destructive_requires_approval"],
  ["governance_sensitive", "governance_sensitive_requires_approval"],
  ["credential_sensitive", "credential_sensitive_requires_secret_path"],
]);

/**
 * D-TOOL-4 ladder applied to a candidate's full tool list. Returns the
 * status, the ordered reasons, the compact `toolRisk` summary the UI
 * renders, and the sandbox health snapshot the verdict was computed
 * against (so the audit log shows the exact health observation that
 * drove `blocked` vs. `ready`).
 */
export function computeRacReadiness(
  input: ComputeRacReadinessInput,
): AgentStudioRacReadinessSnapshot {
  const set = new Set<ToolRiskClass>(input.toolRiskClasses);
  const classes = [...set].sort();
  const toolRisk = {
    hasReadOnly: set.has("read_only"),
    hasRisky:
      set.has("write") ||
      set.has("external_side_effect") ||
      set.has("destructive") ||
      set.has("governance_sensitive") ||
      set.has("credential_sensitive"),
    hasCodeExecution: set.has("code_execution"),
    hasQuarantined: set.has("quarantined"),
    classes,
  };
  const computedAt = (input.computedAt ?? new Date()).toISOString();

  // ── Hard-block path (D-TOOL-4 row 5 + D-SBX-2). Stable order:
  //    quarantined first, then code_execution prerequisite.
  const blockReasons: RacReadinessReasonCode[] = [];
  if (toolRisk.hasQuarantined) blockReasons.push("quarantined_tool");
  if (toolRisk.hasCodeExecution) {
    if (input.sandboxHealth == null) {
      blockReasons.push("sandbox_required");
    } else if (!input.sandboxHealth.ok) {
      blockReasons.push("sandbox_unhealthy");
    }
  }
  if (blockReasons.length > 0) {
    return {
      status: "blocked",
      reasons: blockReasons,
      toolRisk,
      sandboxHealth: input.sandboxHealth,
      computedAt,
    };
  }

  // ── Degraded path. Walk in the same enum order every time so audit
  //    diffs are stable.
  const degradedReasons: RacReadinessReasonCode[] = [];
  for (const cls of [
    "write",
    "external_side_effect",
    "destructive",
    "governance_sensitive",
    "credential_sensitive",
  ] as const) {
    if (set.has(cls)) {
      const r = SIDE_EFFECT_REASON_BY_CLASS.get(cls);
      if (r) degradedReasons.push(r);
    }
  }
  if (degradedReasons.length > 0) {
    return {
      status: "degraded",
      reasons: degradedReasons,
      toolRisk,
      sandboxHealth: input.sandboxHealth,
      computedAt,
    };
  }

  // ── Ready path. read_only-only, or code_execution + healthy sandbox.
  return {
    status: "ready",
    reasons: [],
    toolRisk,
    sandboxHealth: input.sandboxHealth,
    computedAt,
  };
}

/**
 * Convenience wrapper: probe the live sandbox and return the snapshot
 * shape `computeRacReadiness` consumes. Returns `null` when no impl is
 * registered (the registry sentinel — treated as hard-block precondition
 * by the matrix). Errors thrown by `health()` itself bubble up; callers
 * should catch and treat as `null` if they want a soft path.
 *
 * Lives here (not in `services/sandbox/`) so the sandbox barrel stays
 * call-site-free and the dispatcher's invariants don't shift under it.
 */
export async function probeSandboxForExport(): Promise<AgentStudioSandboxHealthSnapshot | null> {
  const { getToolSandbox, SandboxUnavailableError } = await import("./sandbox");
  let impl;
  try {
    impl = getToolSandbox();
  } catch (e) {
    if (e instanceof SandboxUnavailableError) return null;
    throw e;
  }
  const h = await impl.health();
  return { ok: h.ok, impl: h.impl };
}
