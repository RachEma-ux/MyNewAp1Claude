/**
 * CAG risk classifier — RAC P1B (per D-TOOL-1, D-TOOL-2, D-TOOL-5).
 *
 * READ-ONLY classifier. Reads `riskClass` from the MCP tool's manifest;
 * MUST NOT derive it from heuristics on the description string. If the
 * manifest doesn't carry a class yet (the MCP types change is a separate
 * landing), tools fall through to the provisional mapping for the five
 * built-in tools (D-TOOL-6) — every other tool defaults to `quarantined`.
 *
 * Quarantined-until-classified is the deliberate default-deny posture
 * (D-TOOL-1). Quarantined tools are rejected by the builder.
 *
 * P1E boundary check enforces: no file under `services/cag/` writes or
 * recomputes `riskClass`. This file only READS.
 *
 * ── M3-c5 (cycle-5 audit closure §M3-c5) — quarantine layering ──────
 *
 * `readRiskClass()` resolves a tool's `riskClass` via THREE ordered
 * derivation paths (precedence top-down):
 *
 *   1. **Manifest read** — `tool.riskClass` is present on the live
 *      MCP tool object (D-TOOL-1; the manifest is authoritative).
 *      Returns the manifest value verbatim.
 *
 *   2. **Builtin fallback** — `BUILTIN_RISK_CLASS[tool.name]` matches
 *      one of the five provisional built-ins (D-TOOL-6: calculator,
 *      current_time, text_analysis, json_parser, url_parser). Returns
 *      `"read_only"` for those names.
 *
 *   3. **Default-deny "quarantined"** — neither of the above. Returns
 *      `"quarantined"` so the builder rejects the tool, the dispatcher
 *      validator gate (`proposed-tool-call.ts`) refuses, and the pack
 *      does not embed it (`isPackable` excludes `quarantined`).
 *
 * Two readers, two truths:
 *
 *   - **Live read (validator gate, dispatcher, builder):** every call
 *     site invokes `readRiskClass(liveTool)` against the in-memory
 *     MCP registry snapshot — the answer reflects the manifest as of
 *     RIGHT NOW. This is the path that gates dispatch.
 *
 *   - **Mirror snapshot (`agsMcpToolKnowledge.riskClass`):** the
 *     `tool-knowledge-sync.ts` mirror writer calls `readRiskClass()`
 *     at SYNC TIME and persists the result to the column. Operator UI
 *     reads this column — so the operator sees "what we observed at
 *     last sync", not "what dispatch would compute now".
 *
 *   - **Resulting layering invariant:** mirror `riskClass` is a
 *     stale-snapshot projection; the live read is authoritative. If
 *     a tool's manifest changes between syncs (or a built-in is added
 *     to a server's registry), the mirror lags. The dispatcher path
 *     is correct; operator UI may show `quarantined=false` for a tool
 *     that dispatch refuses (or vice versa) until the next sync.
 *
 *   - **No fourth derivation path exists.** `risk-classifier.ts` does
 *     NOT compute a SHA-256 of the canonical schema (the cycle-5
 *     audit pre-write flagged this as a third triplication site;
 *     verification confirmed only `tool-knowledge-sync.ts` and
 *     `proposed-tool-call.ts` hash schemas — see §M1-c5). The CAG
 *     side reads `tool.riskClass` directly via this module, never
 *     re-derives the schema hash.
 *
 * Lockstep test: `tests/agent-studio/risk-classifier-layering.test.ts`
 * asserts the doc-block enumerates all 3 derivation paths + names the
 * mirror-vs-live distinction. A future PR that drops a path (or adds
 * a fourth) without updating this comment fails the lockstep.
 */

import type { McpTool } from "../mcp/types";
import type { ToolRiskClass } from "./types";

/**
 * Provisional class table for the five built-in tools (D-TOOL-6).
 * Removed once `McpToolManifestEntry.riskClass` lands and tools self-declare.
 */
const BUILTIN_RISK_CLASS: Readonly<Record<string, ToolRiskClass>> = Object.freeze({
  calculator: "read_only",
  current_time: "read_only",
  text_analysis: "read_only",
  json_parser: "read_only",
  url_parser: "read_only",
});

/**
 * Tool extended with classifier-resolved badges. Builder consumes this.
 */
export interface ClassifiedTool {
  name: string;
  /** One-sentence summary from the manifest description, trimmed. Empty if absent. */
  summary: string;
  riskClass: ToolRiskClass;
  approvalRequired: boolean;
  sandboxRequired: boolean;
}

/**
 * Resolve a tool's `riskClass`. Reads from the manifest if present,
 * else falls back to the built-in table, else returns `"quarantined"`.
 */
export function readRiskClass(
  tool: McpTool & { riskClass?: ToolRiskClass },
): ToolRiskClass {
  if (tool.riskClass) return tool.riskClass;
  return BUILTIN_RISK_CLASS[tool.name] ?? "quarantined";
}

/**
 * Classify a tool into the structure the builder writes into the pack.
 *
 * - `approvalRequired` is true for any class with side effects or governance
 *   weight (`write` / `external_side_effect` / `destructive` /
 *   `governance_sensitive` / `credential_sensitive`).
 * - `sandboxRequired` is true iff `riskClass = code_execution` (D-TOOL-4).
 */
export function classifyTool(
  tool: McpTool & {
    riskClass?: ToolRiskClass;
    approvalRequired?: boolean;
  },
): ClassifiedTool {
  const riskClass = readRiskClass(tool);
  const summary = (tool.description ?? "").trim().split(/\r?\n/)[0] ?? "";

  const approvalRequired = tool.approvalRequired ??
    (riskClass === "write" ||
      riskClass === "external_side_effect" ||
      riskClass === "destructive" ||
      riskClass === "governance_sensitive" ||
      riskClass === "credential_sensitive");

  const sandboxRequired = riskClass === "code_execution";

  return {
    name: tool.name,
    summary,
    riskClass,
    approvalRequired,
    sandboxRequired,
  };
}

/**
 * True iff the tool is safe to embed in a CAG pack. `quarantined` and
 * `credential_sensitive` are excluded — quarantined per D-TOOL-1 default-deny,
 * credential-sensitive per D-TOOL-3 (CAG MUST NOT carry credential surface).
 */
export function isPackable(tool: ClassifiedTool): boolean {
  return tool.riskClass !== "quarantined" && tool.riskClass !== "credential_sensitive";
}
