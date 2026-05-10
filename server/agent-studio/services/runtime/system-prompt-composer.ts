/**
 * System Prompt Composer — RAC P1C (D-PRM-1).
 *
 * The single function in the codebase that produces the final system
 * prompt sent to Model Access. `chat-stream.ts`, `services/chat.ts`,
 * `services/test-run-binding.ts` MUST all call this — direct string
 * concatenation of agent fields with CAG output anywhere else is a
 * P1E boundary violation.
 *
 * Section order is FIXED (D-PRM-2):
 *   1. identity
 *   2. mission
 *   3. agent-policy
 *   4. capability-pack   (CAG, optional)
 *   5. retrieval-evidence (RAC P5, placeholder until P5)
 *   6. runtime-policy
 *
 * Modes (D-PRM-6):
 *   - disabled       : sections 4 + 5 omitted; output equals legacy concat
 *                      ("system_instructions\n\nrole_instructions" or fallback)
 *                      — golden-tested for byte equivalence.
 *   - safe_degraded  : sections 4 + 5 included when present; missing pack
 *                      records a warning and proceeds (default for chat).
 *   - strict         : missing pack throws CagRequiredError; caller emits
 *                      the SSE `cag_required` error code.
 *
 * Token budget (D-PRM-3):
 *   - TOTAL_SYSTEM_PROMPT_TOKENS = 6144 hard cap.
 *   - Per-section soft caps with truncation order: drop low-relevance
 *     evidence chunks → truncate evidence → truncate capability-pack →
 *     truncate agent-policy → never touch identity/mission/runtime-policy.
 *
 * Cache key (D-PRM-5): SHA-256 of
 *   identity.text || mission.text || agent-policy.text ||
 *   capability-pack.contentHash || runtime-policy.versionTag
 *   — `retrieval-evidence` deliberately excluded.
 */

import { hashJsonStable, estimateTokens } from "../cag";
import type { SystemPromptSection } from "../cag";
// M7-c8 (cycle-8 audit closure §M7-c8): orchestration-error registry.
// CagRequiredError now extends OrchestrationError so the chat flows
// can switch on a typed code with TS exhaustiveness checking. See
// runtime/orchestration-error.ts for the full rationale.
import { OrchestrationError } from "./orchestration-error";

export const TOTAL_SYSTEM_PROMPT_TOKENS = 6144;

export const SECTION_BUDGETS = Object.freeze({
  identity: 256,
  mission: 512,
  "agent-policy": 1024,
  "capability-pack": 2048,
  "retrieval-evidence": 1536,
  "runtime-policy": 256,
} as const);

/** Versioned text for the runtime-policy section. Bump versionTag when text changes. */
const RUNTIME_POLICY = Object.freeze({
  versionTag: "v1",
  text: [
    "## Runtime Policy",
    "- Governance dispatcher receipts are final. If the dispatcher rejects an action, do not retry through another path.",
    "- Capability presence is not execution permission. Approval-required tools need explicit per-call approval.",
    "- Retrieval evidence may be stale; cite sources when available and refuse to fabricate citations.",
    "- If tool availability conflicts with runtime policy, follow runtime policy.",
    "- Workspace isolation: never reference resources from another workspace.",
  ].join("\n"),
});

export type ComposerMode = "disabled" | "safe_degraded" | "strict";

/**
 * Thrown by `composeSystemPrompt` when `mode === "strict"` and
 * `capabilityPack === null`. The chat flows + SSE mapper pattern-match
 * on `instanceof OrchestrationError` (M7-c8 — the registry base) and
 * then `switch (err.code)` for the per-class branch. The
 * `.code` field is `as const` so TypeScript narrows it to the literal
 * `"cag_required"` in switch branches.
 *
 * Both surfaces are pinned:
 *   - M5-c8 (system-prompt-composer.test.ts) covers the throw site +
 *     property shape (.code, .name, message, pre-throw guarantee).
 *   - M7-c8 (m7-c8-orchestration-error-registry.test.ts) covers the
 *     base-class extension + the chat-flow switch shape.
 */
export class CagRequiredError extends OrchestrationError {
  readonly code = "cag_required" as const;
  constructor(message = "CAG capability pack required but missing") {
    super(message);
    this.name = "CagRequiredError";
  }
}

export interface SystemPromptInput {
  mode: ComposerMode;
  /** From `ags_agent_drafts`. */
  draft: {
    name: string | null;
    role: string | null;
    scope: string | null;
    mission: string | null;
    systemInstructions: string | null;
    roleInstructions: string | null;
    policyInstructions: string | null;
    successCriteria: string | null;
    escalationRules: string | null;
  };
  /** Pre-rendered by the CAG resolver (P1C). Null when unavailable. */
  capabilityPack: SystemPromptSection | null;
  /** Pre-rendered by the RAC assembler (P5). Always null until P5 lands. */
  retrievalEvidence: SystemPromptSection | null;
}

export interface ComposedSection {
  id:
    | "identity"
    | "mission"
    | "agent-policy"
    | "capability-pack"
    | "retrieval-evidence"
    | "runtime-policy";
  text: string;
  tokenEstimate: number;
}

export interface TruncationRecord {
  section: ComposedSection["id"];
  originalTokens: number;
  retainedTokens: number;
  reason: string;
}

export interface ComposedSystemPrompt {
  /** The single string sent to Model Access. */
  text: string;
  /** Each contributing section, in fixed order. */
  sections: ComposedSection[];
  tokenEstimate: number;
  truncations: TruncationRecord[];
  /**
   * L3-c8 (cycle-8 audit closure §L3-c8) — known-limitation marker.
   *
   * Composer warnings accumulator. UNBOUNDED in size by design —
   * each section can push warnings (CAG validator findings, render
   * truncations, missing-pack notices), and the trace row write
   * carries the full array. In practice typical compositions emit
   * <10 warnings, so this hasn't surfaced as a real issue.
   *
   * If it ever does (operator reports composer warnings dominating
   * trace row size on certain agents), fold into a cycle-7-style
   * ceiling: cap at MAX_COMPOSER_WARNINGS (e.g. 50), record a
   * truncation flag, surface "warnings truncated" in operator UI.
   * Pure documentation for now — no enforcement layer.
   *
   * Mirrors L2-c8's perSourceLatencyMs known-limitation marker.
   * Lockstep: pinned by tests/agent-studio/l1-l4-c8-doc-bundle.test.ts.
   */
  warnings: string[];
  /** D-PRM-5 cache key — excludes retrieval-evidence. */
  cacheKey: string;
}

/**
 * Compose the final system prompt. Pure function: I/O happens in the
 * resolver (CAG) and assembler (RAC) before they hand sections in here.
 */
export function composeSystemPrompt(input: SystemPromptInput): ComposedSystemPrompt {
  if (input.mode === "strict" && input.capabilityPack === null) {
    throw new CagRequiredError();
  }

  const warnings: string[] = [];
  const truncations: TruncationRecord[] = [];
  const sections: ComposedSection[] = [];

  // ── Mode: disabled — preserve byte-equivalent legacy output ─────────
  // Legacy concat: [systemInstructions, roleInstructions]
  //   .filter(non-empty).join("\n\n") || "You are a helpful assistant."
  // We MUST emit exactly that string when mode=disabled (golden test).
  if (input.mode === "disabled") {
    const legacy = legacyPrompt(input.draft);
    return {
      text: legacy,
      sections: [
        { id: "identity", text: legacy, tokenEstimate: estimateTokens(legacy) },
      ],
      tokenEstimate: estimateTokens(legacy),
      truncations: [],
      warnings: [],
      cacheKey: hashJsonStable({ legacy }),
    };
  }

  // ── 1. identity (always present) ────────────────────────────────────
  const identityText = renderIdentity(input.draft);
  sections.push({
    id: "identity",
    text: identityText,
    tokenEstimate: estimateTokens(identityText),
  });

  // ── 2. mission (present iff non-empty) ──────────────────────────────
  if (input.draft.mission && input.draft.mission.trim().length > 0) {
    const missionText = `## Mission\n${input.draft.mission.trim()}`;
    sections.push({
      id: "mission",
      text: missionText,
      tokenEstimate: estimateTokens(missionText),
    });
  }

  // ── 3. agent-policy (present iff any source non-empty) ──────────────
  const agentPolicyText = renderAgentPolicy(input.draft);
  if (agentPolicyText.length > 0) {
    sections.push({
      id: "agent-policy",
      text: agentPolicyText,
      tokenEstimate: estimateTokens(agentPolicyText),
    });
  }

  // ── 4. capability-pack (CAG, optional) ──────────────────────────────
  if (input.capabilityPack) {
    sections.push({
      id: "capability-pack",
      text: input.capabilityPack.text,
      tokenEstimate: input.capabilityPack.tokenEstimate,
    });
    for (const w of input.capabilityPack.warnings) warnings.push(`cag: ${w}`);
  } else if (input.mode === "safe_degraded") {
    warnings.push("cag: no capability pack available; proceeding without it");
  }

  // ── 5. retrieval-evidence (RAC P5, placeholder until P5) ────────────
  if (input.retrievalEvidence) {
    sections.push({
      id: "retrieval-evidence",
      text: input.retrievalEvidence.text,
      tokenEstimate: input.retrievalEvidence.tokenEstimate,
    });
    for (const w of input.retrievalEvidence.warnings) warnings.push(`rac: ${w}`);
  }

  // ── 6. runtime-policy (always last) ─────────────────────────────────
  sections.push({
    id: "runtime-policy",
    text: RUNTIME_POLICY.text,
    tokenEstimate: estimateTokens(RUNTIME_POLICY.text),
  });

  // ── Total budget enforcement (D-PRM-3 §3) ───────────────────────────
  enforceBudget(sections, truncations, warnings);

  const text = sections.map((s) => s.text).join("\n\n");
  const tokenEstimate = sections.reduce((sum, s) => sum + s.tokenEstimate, 0);

  // ── D-PRM-5 cache key (excludes retrieval-evidence) ─────────────────
  const cacheKey = hashJsonStable({
    identity: sections.find((s) => s.id === "identity")?.text ?? "",
    mission: sections.find((s) => s.id === "mission")?.text ?? "",
    "agent-policy": sections.find((s) => s.id === "agent-policy")?.text ?? "",
    "capability-pack": input.capabilityPack?.contentHash ?? null,
    "runtime-policy": RUNTIME_POLICY.versionTag,
  });

  return { text, sections, tokenEstimate, truncations, warnings, cacheKey };
}

// ── Helpers ───────────────────────────────────────────────────────────

function legacyPrompt(draft: SystemPromptInput["draft"]): string {
  return (
    [draft.systemInstructions, draft.roleInstructions]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join("\n\n") || "You are a helpful assistant."
  );
}

function renderIdentity(draft: SystemPromptInput["draft"]): string {
  const lines: string[] = [];
  lines.push("## Identity");
  lines.push(
    `You are ${draft.name?.trim() || "an AI assistant"}` +
      (draft.role?.trim() ? `, ${draft.role.trim()}.` : "."),
  );
  if (draft.scope?.trim()) lines.push(`Scope: ${draft.scope.trim()}`);
  return lines.join("\n");
}

function renderAgentPolicy(draft: SystemPromptInput["draft"]): string {
  const parts: string[] = [];
  if (draft.policyInstructions?.trim()) {
    parts.push(`## Policy\n${draft.policyInstructions.trim()}`);
  }
  if (draft.systemInstructions?.trim()) {
    parts.push(`## System Instructions\n${draft.systemInstructions.trim()}`);
  }
  if (draft.roleInstructions?.trim()) {
    parts.push(`## Role Instructions\n${draft.roleInstructions.trim()}`);
  }
  if (draft.successCriteria?.trim()) {
    parts.push(`## Success Criteria\n${draft.successCriteria.trim()}`);
  }
  if (draft.escalationRules?.trim()) {
    parts.push(`## Escalation Rules\n${draft.escalationRules.trim()}`);
  }
  return parts.join("\n\n");
}

/**
 * Enforce TOTAL_SYSTEM_PROMPT_TOKENS. Truncation order per D-PRM-3 §3:
 *   3. truncate retrieval-evidence
 *   4. truncate capability-pack
 *   5. truncate agent-policy
 * Never touches identity, mission, runtime-policy.
 */
function enforceBudget(
  sections: ComposedSection[],
  truncations: TruncationRecord[],
  warnings: string[],
): void {
  const totalTokens = () => sections.reduce((sum, s) => sum + s.tokenEstimate, 0);
  const truncOrder: ComposedSection["id"][] = [
    "retrieval-evidence",
    "capability-pack",
    "agent-policy",
  ];

  for (const id of truncOrder) {
    if (totalTokens() <= TOTAL_SYSTEM_PROMPT_TOKENS) return;
    const idx = sections.findIndex((s) => s.id === id);
    if (idx < 0) continue;

    const overflow = totalTokens() - TOTAL_SYSTEM_PROMPT_TOKENS;
    const orig = sections[idx];
    const targetTokens = Math.max(orig.tokenEstimate - overflow, 64);
    const targetChars = targetTokens * 4;
    if (orig.text.length <= targetChars) continue;

    const truncated = `${orig.text.slice(0, targetChars - 60)}\n\n[truncated to fit budget]`;
    const newTokens = estimateTokens(truncated);
    truncations.push({
      section: id,
      originalTokens: orig.tokenEstimate,
      retainedTokens: newTokens,
      reason: `total prompt over ${TOTAL_SYSTEM_PROMPT_TOKENS}-token budget`,
    });
    sections[idx] = { ...orig, text: truncated, tokenEstimate: newTokens };
    warnings.push(
      `composer: truncated ${id} from ${orig.tokenEstimate} to ${newTokens} tokens`,
    );
  }

  if (totalTokens() > TOTAL_SYSTEM_PROMPT_TOKENS) {
    warnings.push(
      `composer: prompt remains over budget after truncation (${totalTokens()} > ${TOTAL_SYSTEM_PROMPT_TOKENS}); identity+mission+runtime-policy are non-droppable`,
    );
  }
}
