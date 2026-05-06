/**
 * CAG skill ↔ tool mapper — RAC P1B.
 *
 * Pure function. Given an agent's draft skills and the set of MCP tools
 * the agent has access to, produce the {skills, tools} sub-shape that
 * the builder writes into `CapabilityPackContent`.
 *
 * Phase 1B is intentionally narrow: the mapper does NOT compute "this
 * skill needs these tools" cross-references. Skills declare what they do
 * (manifest); tools declare what they do (registry); the LLM reads both.
 * Cross-referencing arrives later only if traces show models can't pick
 * the right tool from a list.
 */

import type { CapabilityPackContent } from "./types";
import type { ClassifiedTool } from "./risk-classifier";

/** Minimal skill shape the mapper needs — works for both draft + catalog skills. */
export interface SkillRef {
  id: number;
  name: string;
  description?: string | null;
}

/**
 * Tool with the server context the renderer surfaces (so the agent knows
 * which MCP server provides each tool, useful when names collide).
 */
export interface ToolWithServer extends ClassifiedTool {
  serverId: number;
  serverName: string;
}

/**
 * Project skills + tools to the pack content shape. Truncates skill
 * descriptions to one line at the renderer's discretion (mapper just
 * passes them through trimmed).
 */
export function mapSkillsAndTools(
  skills: SkillRef[],
  tools: ToolWithServer[],
): Pick<CapabilityPackContent, "skills" | "tools"> {
  return {
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      summary: oneLineSummary(s.description ?? ""),
    })),
    tools: tools.map((t) => ({
      name: t.name,
      serverId: t.serverId,
      serverName: t.serverName,
      summary: t.summary,
      riskClass: t.riskClass,
      approvalRequired: t.approvalRequired,
      sandboxRequired: t.sandboxRequired,
    })),
  };
}

function oneLineSummary(text: string): string {
  return text.trim().split(/\r?\n/)[0]?.slice(0, 240) ?? "";
}
