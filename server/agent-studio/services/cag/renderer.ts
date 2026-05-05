/**
 * CAG renderer — RAC P1B.
 *
 * Converts a `CapabilityPackContent` to a `SystemPromptSection` (the
 * structure the P1C composer ingests). The renderer is the ONLY place
 * the capability section's prompt text is produced; downstream code
 * (composer, runtime) treats `text` as opaque.
 *
 * Rules (per RAC_EXECUTION_PLAN.md §2 P1B + RAC_PROMPT_COMPOSITION.md):
 *
 *   - MUST NOT include a mission line (D-PRM-4 Collision A — draft mission wins).
 *   - MUST emit per tool: (name, riskClass, summary, approval-required, sandbox-required) — D-TOOL-3.
 *   - MUST NOT emit raw input schema JSON or example invocations — D-TOOL-3.
 *   - MUST stay within CAG_MAX_PROMPT_TOKENS = 2048 (D-PRM-3).
 *   - MUST include the six MANDATORY_ASSERTIONS below — anchored to the
 *     same principles the composer's runtime-policy section asserts.
 *
 * Token estimation is the conventional `chars/4` proxy. P7 trace will
 * collect actuals once Model Access reports tokenized counts.
 */

import { hashJsonStable } from "./hashing";
import type { CapabilityPackContent, SystemPromptSection, ToolRiskClass } from "./types";

export const CAG_MAX_PROMPT_TOKENS = 2048;

/**
 * Six non-negotiable assertions the renderer ALWAYS emits at the bottom
 * of the capability-pack section. They restate, in the most-attended
 * position, the invariants the composer's runtime-policy section also
 * carries — redundancy is intentional per D-PRM-4 Collision C.
 *
 * Each assertion ties to a documented decision:
 *   1 → D-PRM-4 Collision B / D-TOOL-5  (capability ≠ permission)
 *   2 → D-TOOL-3                         (live schema authoritative)
 *   3 → D-TOOL-4 / D-SBX-3               (sandbox required for code_execution)
 *   4 → D-TOOL-3 (approval) / D-PRM-2 §6 (governance final)
 *   5 → D-PRM-2 §6 (cached capability not external truth)
 *   6 → repo workspace-isolation rule (CAG packs are workspace-scoped)
 */
export const MANDATORY_ASSERTIONS: ReadonlyArray<string> = Object.freeze([
  "Capability presence does not grant execution permission. The dispatcher decides whether each call succeeds.",
  "Tool argument shapes shown here are summaries. The dispatcher presents the authoritative input schema at call time; do not memorize argument forms.",
  "Tools marked sandbox-required (riskClass=code_execution) MUST be invoked only through the sandbox-wrapped dispatcher path.",
  "Tools marked approval-required MUST receive explicit approval before each invocation; prior approvals do not carry forward.",
  "This capability context is cached. For current external state use live tools or retrieval evidence; do not treat the cache as ground truth.",
  "Capability lists are workspace-scoped. Do not assume access to resources, agents, packs, or evidence from another workspace.",
]);

/**
 * Render a pack to its prompt section. Returns warnings in the section
 * (e.g. truncated tool list when over budget). Never throws on a valid
 * `CapabilityPackContent` — the validator (`validator.ts`) is where
 * shape rejection lives.
 */
export function renderCapabilityPack(content: CapabilityPackContent): SystemPromptSection {
  const warnings: string[] = [];

  const lines: string[] = [];

  // ── Identity (mission deliberately omitted, D-PRM-4 Collision A) ─────
  lines.push("## Capability Pack");
  lines.push(
    `Agent: ${content.identity.name}` +
      (content.identity.role ? ` — ${content.identity.role}` : ""),
  );
  if (content.identity.scope) {
    lines.push(`Scope: ${content.identity.scope}`);
  }
  lines.push("");

  // ── Skills ──────────────────────────────────────────────────────────
  if (content.skills.length > 0) {
    lines.push("### Skills");
    for (const s of content.skills) {
      lines.push(`- ${s.name}${s.summary ? `: ${s.summary}` : ""}`);
    }
    lines.push("");
  }

  // ── Tools ───────────────────────────────────────────────────────────
  if (content.tools.length > 0) {
    lines.push("### Tools");
    for (const t of content.tools) {
      lines.push(formatToolLine(t));
    }
    lines.push("");
  } else {
    lines.push("### Tools");
    lines.push("(none)");
    lines.push("");
  }

  // ── Mandatory assertions (always last, in attended position) ────────
  lines.push("### Capability Rules");
  for (const a of MANDATORY_ASSERTIONS) {
    lines.push(`- ${a}`);
  }

  let text = lines.join("\n");
  let tokenEstimate = estimateTokens(text);

  // Hard cap (D-PRM-3 §3 step 3). If over, drop tool lines from the end
  // and re-render. Mandatory assertions are non-droppable — if assertions
  // alone exceed budget, that's a configuration bug in MANDATORY_ASSERTIONS,
  // surface it as an unbounded warning.
  if (tokenEstimate > CAG_MAX_PROMPT_TOKENS) {
    const truncated = truncateToBudget(content, warnings);
    text = truncated.text;
    tokenEstimate = truncated.tokenEstimate;
  }

  return {
    id: "capability-pack",
    text,
    tokenEstimate,
    contentHash: hashJsonStable({ text }),
    warnings,
  };
}

function formatToolLine(t: CapabilityPackContent["tools"][number]): string {
  const badges: string[] = [`risk=${t.riskClass}`];
  if (t.approvalRequired) badges.push("approval-required");
  if (t.sandboxRequired) badges.push("sandbox-required");
  const summary = t.summary ? ` — ${t.summary}` : "";
  return `- ${t.serverName}::${t.name} (${badges.join(", ")})${summary}`;
}

/**
 * Conventional `Math.ceil(chars / 4)` proxy. Replaced by P7 actuals once
 * Model Access reports tokenized counts.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateToBudget(
  content: CapabilityPackContent,
  warnings: string[],
): { text: string; tokenEstimate: number } {
  // Re-render with progressively fewer tools until under budget. Skills
  // are kept (cheap, capability-defining); tool list is the variable cost.
  const baseLines: string[] = [];
  baseLines.push("## Capability Pack");
  baseLines.push(
    `Agent: ${content.identity.name}` +
      (content.identity.role ? ` — ${content.identity.role}` : ""),
  );
  if (content.identity.scope) baseLines.push(`Scope: ${content.identity.scope}`);
  baseLines.push("");
  if (content.skills.length > 0) {
    baseLines.push("### Skills");
    for (const s of content.skills) {
      baseLines.push(`- ${s.name}${s.summary ? `: ${s.summary}` : ""}`);
    }
    baseLines.push("");
  }

  const trailerLines: string[] = [""];
  trailerLines.push("### Capability Rules");
  for (const a of MANDATORY_ASSERTIONS) trailerLines.push(`- ${a}`);

  const sortedTools = sortToolsByPriority(content.tools);

  let kept = sortedTools.length;
  while (kept >= 0) {
    const toolsBlock: string[] = [];
    toolsBlock.push("### Tools");
    if (kept === 0) {
      toolsBlock.push("(truncated — exceeded budget)");
    } else {
      for (const t of sortedTools.slice(0, kept)) {
        toolsBlock.push(formatToolLine(t));
      }
      if (kept < sortedTools.length) {
        toolsBlock.push(`(... ${sortedTools.length - kept} more tool(s) omitted to fit token budget)`);
      }
    }
    const text = [...baseLines, ...toolsBlock, ...trailerLines].join("\n");
    const tokenEstimate = estimateTokens(text);
    if (tokenEstimate <= CAG_MAX_PROMPT_TOKENS) {
      if (kept < sortedTools.length) {
        warnings.push(
          `tools truncated to fit ${CAG_MAX_PROMPT_TOKENS}-token budget: kept ${kept}/${sortedTools.length}`,
        );
      }
      return { text, tokenEstimate };
    }
    kept--;
  }

  // Should be unreachable: skills + assertions alone shouldn't exceed
  // 2048 tokens (≈8KB). If they do, surface as warning and return as-is.
  const text = [...baseLines, ...trailerLines].join("\n");
  warnings.push(
    `capability pack exceeds ${CAG_MAX_PROMPT_TOKENS}-token budget even with all tools dropped`,
  );
  return { text, tokenEstimate: estimateTokens(text) };
}

/** Lower-risk first, so the highest-risk tools get dropped if anything must go. */
function sortToolsByPriority(
  tools: CapabilityPackContent["tools"],
): CapabilityPackContent["tools"] {
  const order: Record<ToolRiskClass, number> = {
    read_only: 0,
    write: 1,
    external_side_effect: 2,
    governance_sensitive: 3,
    destructive: 4,
    code_execution: 5,
    credential_sensitive: 6, // shouldn't appear, but rank anyway
    quarantined: 7,          // shouldn't appear
  };
  return [...tools].sort((a, b) => order[a.riskClass] - order[b.riskClass]);
}
