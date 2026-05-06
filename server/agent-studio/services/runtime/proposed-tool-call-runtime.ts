/**
 * Runtime ProposedToolCall validator wiring — Follow-up A1.
 *
 * Bridges the chat-stream / chat-service tool-call loop to the Phase 8
 * validator. Production tool-use responses don't yet carry a structured
 * envelope (rationale + evidence ids), so this helper builds the
 * envelope from what the runtime knows:
 *
 *   - `mcpServerId` and `toolName` from the dispatch path
 *   - `arguments` from the model's parsed tool-call args
 *   - `riskLevel` + `requiresApproval` derived from the manifest's
 *     riskClass via the locked D-APP-EXT-4 mapping (so gates 5/6
 *     are tautological — the model wouldn't fabricate the manifest)
 *   - `rationale` empty, `evidence*` empty (gates 3 trivially passes)
 *
 * The validator's still-active gates in this configuration are the
 * meaningful safety net for runtime that doesn't emit envelopes:
 *
 *   - Gate 1 — invented tool (caller named a tool the live registry
 *              doesn't have)
 *   - Gate 2 — argument schema (missing required params, unknown
 *              params, type mismatches)
 *   - Gate 7 — quarantined hard-block (D-TOOL-1 default-deny)
 *   - Gate 8 — sandbox prerequisite for code_execution (D-SBX-2)
 *
 * As tool-use envelopes evolve to carry rationale + evidence (later
 * follow-up), the same wire-up will start exercising gates 3 and 4
 * automatically — the helper accepts those fields when present.
 */

import type { McpTool } from "../mcp/types";
import {
  approvalRequiredFor,
  riskClassToRiskLevel,
  validateProposedToolCall,
  type ProposedToolCall,
  type ProposedToolCallValidationCode,
  type ProposedToolCallValidationResult,
  type ProposedToolCallValidatorContext,
} from "../mcp/proposed-tool-call";
import { readRiskClass } from "../cag/risk-classifier";

export interface RuntimeValidationInput {
  /** Canonical MCP server id (matches the agsMcpToolKnowledge mirror). */
  mcpServerId: string;
  /** Tool name as advertised by the registry. */
  toolName: string;
  /** Live snapshot of the tool from this server's registry snapshot. */
  liveTool: McpTool;
  /** Parsed arguments from the model's tool-call. */
  arguments: Record<string, unknown>;
  /** Optional model-provided rationale. Empty string when absent. */
  rationale?: string;
  /**
   * Optional evidence ids surfaced this turn. Empty when the model
   * doesn't emit a structured envelope yet.
   */
  evidenceChunkIds?: string[];
  knowledgeUnitIds?: number[];
  toolKnowledgeIds?: number[];
  cagBlockIds?: string[];
  /** Sandbox health probe; true when no probe is wired (dispatcher remains the source of truth). */
  sandboxHealthOk?: boolean;
}

/**
 * Result shape with rejection details flattened to top-level fields so
 * runtime callers (chat-stream / chat-service) can branch on `ok`
 * under `strictNullChecks: false` without TS losing the discrimination.
 */
export interface RuntimeValidationResult {
  ok: boolean;
  code: ProposedToolCallValidationCode | null;
  message: string | null;
  raw: ProposedToolCallValidationResult;
  call: ProposedToolCall;
}

/**
 * Build the runtime ProposedToolCall + validator context, then run the
 * validator. Returns the verdict; callers decide what to do with a
 * rejection (chat-stream emits a tool_end event; chat-service writes a
 * tool message and continues).
 */
export async function validateRuntimeToolCall(
  input: RuntimeValidationInput,
): Promise<RuntimeValidationResult> {
  const riskClass = readRiskClass(input.liveTool);
  const call: ProposedToolCall = {
    mcpServerId: input.mcpServerId,
    toolName: input.toolName,
    arguments: input.arguments,
    rationale: input.rationale ?? "",
    evidenceChunkIds: input.evidenceChunkIds ?? [],
    knowledgeUnitIds: input.knowledgeUnitIds,
    toolKnowledgeIds: input.toolKnowledgeIds,
    cagBlockIds: input.cagBlockIds,
    riskLevel: riskClassToRiskLevel(riskClass),
    requiresApproval: approvalRequiredFor(riskClass),
  };

  const ctx: ProposedToolCallValidatorContext = {
    resolveTool: async (serverId, name) =>
      serverId === input.mcpServerId && name === input.toolName
        ? input.liveTool
        : null,
    resolveRiskClass: () => riskClass,
    retrievalChunkIdSet: new Set(input.evidenceChunkIds ?? []),
    knowledgeUnitIdSet: new Set(input.knowledgeUnitIds ?? []),
    cagBlockIdSet: new Set(input.cagBlockIds ?? []),
    sandboxHealthOk: input.sandboxHealthOk ?? true,
  };

  const result = await validateProposedToolCall(call, ctx);
  if (result.ok) {
    return { ok: true, code: null, message: null, raw: result, call };
  }
  const failure = result as Extract<ProposedToolCallValidationResult, { ok: false }>;
  return {
    ok: false,
    code: failure.code,
    message: failure.message,
    raw: result,
    call,
  };
}
