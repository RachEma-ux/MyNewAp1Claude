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
