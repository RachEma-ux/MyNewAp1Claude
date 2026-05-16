/**
 * `summarizeProposedToolCalls` — stable-shape row-state aggregator
 * over `ProposedToolCall[]` (T-G.61).
 *
 * Companion to the per-risk-level metadata canonization shipped at
 * T-G.48 (PROPOSED_TOOL_CALL_RISK_LEVEL_METADATA). Instantiates the
 * registry-plus-row-state aggregator pair pattern (lesson 30 of the
 * V1+ session memory) on the proposed-tool-call surface — this is
 * the first instantiation on a RUNTIME-touching surface (vs the
 * first 5 which were configuration / registry / persisted-state
 * surfaces).
 *
 * Use case: agentRun traces accumulate a flight of ProposedToolCall
 * records during a single chat turn. The trace dashboard needs
 * "this turn fired 4 tools — 1 low / 2 medium / 1 high — 1 required
 * approval — 3 used evidence chunks — 4 servers" at a glance.
 *
 * Stable-shape guarantees:
 *   - `byRiskLevel[level]` zero-filled across the 4 closed values.
 *   - `byMcpServerId` is sparse (open-ended string axis).
 *   - `distinctMcpServerCount` counts unique server ids.
 *   - All evidence-cited gauges return integers + 1-decimal percents;
 *     0-on-empty (no NaN).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 *   - The aggregator examines flight metadata only — does NOT
 *     dispatch the calls.
 */

import {
  PROPOSED_TOOL_CALL_RISK_LEVELS,
  type ProposedToolCall,
  type ProposedToolCallRiskLevel,
} from "./proposed-tool-call.js";

export interface ProposedToolCallListSummary {
  readonly total: number;
  /** Per-risk-level count, zero-filled across the closed taxonomy. */
  readonly byRiskLevel: Readonly<
    Record<ProposedToolCallRiskLevel, number>
  >;
  /** Per-mcpServerId count. Sparse — only servers that appear in the
   *  input show up. */
  readonly byMcpServerId: Readonly<Record<string, number>>;
  /** Distinct mcpServerId values across the input. */
  readonly distinctMcpServerCount: number;
  /** Calls with `requiresApproval === true`. */
  readonly requiresApprovalCount: number;
  /** `requiresApprovalCount / total * 100`, rounded to 1 decimal.
   *  0 on empty input. */
  readonly requiresApprovalPercent: number;
  /** Calls with at least one `evidenceChunkIds` entry — anti-
   *  hallucination signal. */
  readonly withEvidenceCount: number;
  /** Calls with at least one `knowledgeUnitIds` entry. */
  readonly withKnowledgeUnitCount: number;
  /** Calls with at least one `cagBlockIds` entry. */
  readonly withCagBlockCount: number;
  /** Calls that supplied a `schemaHash` claim (vs leaving the
   *  validator to compute it). */
  readonly withSchemaHashCount: number;
}

function roundPercent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function summarizeProposedToolCalls(
  calls: readonly ProposedToolCall[],
): ProposedToolCallListSummary {
  const byRiskLevel: Record<string, number> = {};
  for (const level of PROPOSED_TOOL_CALL_RISK_LEVELS) byRiskLevel[level] = 0;
  const byMcpServerId: Record<string, number> = {};

  let requiresApprovalCount = 0;
  let withEvidenceCount = 0;
  let withKnowledgeUnitCount = 0;
  let withCagBlockCount = 0;
  let withSchemaHashCount = 0;

  for (const c of calls) {
    byRiskLevel[c.riskLevel] = (byRiskLevel[c.riskLevel] ?? 0) + 1;
    byMcpServerId[c.mcpServerId] =
      (byMcpServerId[c.mcpServerId] ?? 0) + 1;
    if (c.requiresApproval) requiresApprovalCount += 1;
    if (c.evidenceChunkIds.length > 0) withEvidenceCount += 1;
    if (
      c.knowledgeUnitIds !== undefined &&
      c.knowledgeUnitIds.length > 0
    ) {
      withKnowledgeUnitCount += 1;
    }
    if (c.cagBlockIds !== undefined && c.cagBlockIds.length > 0) {
      withCagBlockCount += 1;
    }
    if (c.schemaHash !== undefined && c.schemaHash.length > 0) {
      withSchemaHashCount += 1;
    }
  }

  const total = calls.length;
  return {
    total,
    byRiskLevel: byRiskLevel as Readonly<
      Record<ProposedToolCallRiskLevel, number>
    >,
    byMcpServerId,
    distinctMcpServerCount: Object.keys(byMcpServerId).length,
    requiresApprovalCount,
    requiresApprovalPercent: roundPercent(requiresApprovalCount, total),
    withEvidenceCount,
    withKnowledgeUnitCount,
    withCagBlockCount,
    withSchemaHashCount,
  };
}
