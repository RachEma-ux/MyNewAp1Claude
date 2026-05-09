/**
 * ProposedToolCall Contract + Validator — Retrofit P8.
 *
 * Locked by `docs/architecture/agent-studio-proposed-tool-call.md`
 * (D-PTC-1..6). Forces every model-emitted tool-use response through
 * a structured envelope BEFORE the existing dispatcher sees it.
 *
 * Eight validation gates run in order; first failure short-circuits
 * (D-PTC-2). Validator runs IN-PROCESS (D-PTC-3) — the dispatcher
 * remains the chokepoint, the validator is a pre-flight gate.
 *
 * Validator never executes tools (D-PTC-6). All checks read from
 * the registry, the retrieval result, the CAG pack, and the sandbox
 * health probe.
 */

import { createHash } from "crypto";
import type { McpTool } from "./types";
import type { ToolRiskClass } from "../cag/types";

// ── Contract ──────────────────────────────────────────────────────────

export type ProposedToolCallRiskLevel = "low" | "medium" | "high" | "critical";

export interface ProposedToolCall {
  /** Canonical MCP server id from agsMcpServers (NOT the connection id). */
  mcpServerId: string;
  /** Tool name as advertised by the registry. */
  toolName: string;
  /** Optional version string from the manifest. */
  toolVersion?: string;
  /** Invocation arguments. */
  arguments: Record<string, unknown>;
  /** Free-form rationale; trace surfaces verbatim (model-supplied). */
  rationale: string;
  /** Chunk ids from this turn's retrieval (Phase 4). */
  evidenceChunkIds: string[];
  /** NormalizedKnowledgeUnit ids (Phase 3 / D-NKU-2). */
  knowledgeUnitIds?: number[];
  /** Tool knowledge unit ids (Phase 7 mirror; D-NKU-6). */
  toolKnowledgeIds?: number[];
  /** CAG section ids loaded this turn (D-PRM-1 sections). */
  cagBlockIds?: string[];
  /**
   * Optional schema-hash claim from the model. The validator re-checks
   * against the live registry / mirror; mismatch fails the call
   * (D-PTC-2 #4). When omitted, the validator computes the live hash
   * for trace recording but does not fail.
   */
  schemaHash?: string;
  /** Risk level claim; validator verifies against the manifest taxonomy. */
  riskLevel: ProposedToolCallRiskLevel;
  /** Approval claim; validator verifies against the policy table. */
  requiresApproval: boolean;
}

// ── Verdict ───────────────────────────────────────────────────────────

export type ProposedToolCallValidationCode =
  | "invented_tool"
  | "invented_parameter"
  | "missing_parameter"
  | "fabricated_evidence"
  | "schema_mismatch"
  | "risk_level_mismatch"
  | "approval_claim_mismatch"
  | "quarantined_tool"
  | "sandbox_required";

export interface ProposedToolCallValidationOk {
  ok: true;
  /**
   * Normalized envelope — the validator overwrites the model's claimed
   * `riskLevel` and `requiresApproval` with the derived values, so
   * downstream consumers always see the verified pair.
   */
  normalized: ProposedToolCall;
  /** Computed hash of the live tool snapshot, regardless of whether
   *  the model provided one. */
  liveSchemaHash: string;
}

export interface ProposedToolCallValidationFailure {
  ok: false;
  code: ProposedToolCallValidationCode;
  message: string;
  /** Optional structured detail for the audit trail. */
  detail?: Record<string, unknown>;
}

export type ProposedToolCallValidationResult =
  | ProposedToolCallValidationOk
  | ProposedToolCallValidationFailure;

// ── Validator context ─────────────────────────────────────────────────

/**
 * Caller-supplied resolution surface. The chat-stream wires real
 * implementations; tests inject fakes. Keeping this an interface
 * keeps the validator pure — no live registry / DB imports leak in.
 */
export interface ProposedToolCallValidatorContext {
  /** Resolve a tool by (mcpServerId, toolName) from the LIVE registry. */
  resolveTool(
    mcpServerId: string,
    toolName: string,
  ): Promise<McpTool | null>;
  /** Read the manifest riskClass via D-TOOL-5 single source of truth. */
  resolveRiskClass(tool: McpTool): ToolRiskClass;
  /** Set of evidence chunk ids returned this turn. */
  retrievalChunkIdSet: ReadonlySet<string>;
  /** Set of knowledge unit ids surfaced this turn. */
  knowledgeUnitIdSet: ReadonlySet<number>;
  /**
   * Set of tool-knowledge ids surfaced this turn — distinct from
   * `knowledgeUnitIdSet`. Tool-knowledge rows live in
   * `agsMcpToolKnowledge` (Phase 7 mirror; D-NKU-6); knowledge units
   * live in `agsKnowledgeUnits`. They share an integer id space but
   * the rows are NOT interchangeable. C3-c6 (cycle-6 audit closure
   * §C3-c6) closed a latent bug where Gate 3 was iterating
   * `call.toolKnowledgeIds` against `knowledgeUnitIdSet`. The bug was
   * latent (no production caller emits `toolKnowledgeIds` today) but
   * any future caller would have hit systematic false-rejection.
   */
  toolKnowledgeIdSet: ReadonlySet<number>;
  /** Set of CAG section ids loaded this turn. */
  cagBlockIdSet: ReadonlySet<string>;
  /** Sandbox health probe (Phase 9 / D-SBX-2). */
  sandboxHealthOk: boolean;
}

// ── Risk-level mapping (D-APP-EXT-4 / D-PTC-2 #5) ─────────────────────

/**
 * Map the manifest 8-class taxonomy onto the 4-level riskLevel.
 * Locked in docs/architecture/agent-studio-approval-gate-extension.md
 * (D-APP-EXT-4).
 */
export function riskClassToRiskLevel(
  cls: ToolRiskClass,
): ProposedToolCallRiskLevel {
  switch (cls) {
    case "read_only":
      return "low";
    case "write":
    case "external_side_effect":
    case "governance_sensitive":
      return "medium";
    case "credential_sensitive":
    case "code_execution":
      return "high";
    case "destructive":
    case "quarantined":
      return "critical";
  }
}

/** Approval is required for medium+governance_sensitive, high, and critical. */
export function approvalRequiredFor(cls: ToolRiskClass): boolean {
  switch (cls) {
    case "read_only":
    case "write":
    case "external_side_effect":
      return false;
    case "governance_sensitive":
    case "credential_sensitive":
    case "code_execution":
    case "destructive":
    case "quarantined":
      return true;
  }
}

// ── Canonicalization (D-PTC-4) ────────────────────────────────────────

// M1-c5 (cycle-5 audit closure §M1-c5) — single source of truth for
// schema hash + key sorting. Pre-cycle-5 this file had its own copies
// of `sortKeys` + `computeLiveSchemaHash`; both are now imported from
// `tool-schema-hash.ts` for the schema-hash path. The local sortKeys
// usage in `canonicalProposedToolCall` (D-PTC-4 hash, distinct concern)
// uses the same exported helper.
import { sortKeys, hashMcpToolSchema } from "./tool-schema-hash";

/**
 * D-PTC-4 canonical form. Includes rationale (different rationale =
 * different proposal = different approval row).
 */
export function canonicalProposedToolCall(call: ProposedToolCall): string {
  const ordered = {
    arguments: sortKeys(call.arguments ?? {}),
    cagBlockIds: [...(call.cagBlockIds ?? [])],
    evidenceChunkIds: [...call.evidenceChunkIds],
    knowledgeUnitIds: [...(call.knowledgeUnitIds ?? [])],
    mcpServerId: call.mcpServerId,
    rationale: call.rationale,
    requiresApproval: call.requiresApproval,
    riskLevel: call.riskLevel,
    schemaHash: call.schemaHash ?? null,
    toolKnowledgeIds: [...(call.toolKnowledgeIds ?? [])],
    toolName: call.toolName,
    toolVersion: call.toolVersion ?? null,
  };
  return JSON.stringify(ordered);
}

export function hashProposedToolCall(call: ProposedToolCall): string {
  return createHash("sha256")
    .update(canonicalProposedToolCall(call))
    .digest("hex");
}

// ── Schema hash (matches Phase 7 sync) ────────────────────────────────

// M1-c5: delegates to single source of truth.
function computeLiveSchemaHash(tool: McpTool): string {
  return hashMcpToolSchema({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  });
}

// ── Argument-schema validator (D-PTC-2 #2) ────────────────────────────

/**
 * Lightweight JSON-Schema check covering the slice MCP tools actually
 * use: `type: object` with `properties` (typed primitives) +
 * `required`. We deliberately do NOT pull a full JSON Schema validator
 * here — MCP tool schemas in the wild stick to this slice; if a tool
 * needs deeper validation, it does it server-side.
 */
function validateArgumentsAgainstSchema(
  args: Record<string, unknown>,
  schema: Record<string, unknown> | undefined,
): { code: ProposedToolCallValidationCode; message: string } | null {
  if (!schema || typeof schema !== "object") return null;
  const props = (schema.properties ?? {}) as Record<string, { type?: string }>;
  const required = (schema.required ?? []) as string[];
  const additionalProperties =
    (schema as { additionalProperties?: boolean }).additionalProperties;

  for (const key of required) {
    if (!(key in args)) {
      return {
        code: "missing_parameter",
        message: `required parameter "${key}" is missing`,
      };
    }
  }

  for (const key of Object.keys(args)) {
    if (!(key in props)) {
      if (additionalProperties === false || additionalProperties === undefined) {
        return {
          code: "invented_parameter",
          message: `unknown parameter "${key}" not in tool input schema`,
        };
      }
    } else {
      const expected = props[key]?.type;
      if (expected) {
        const actual = jsType(args[key]);
        if (actual !== expected && !(expected === "integer" && actual === "number")) {
          return {
            code: "invented_parameter",
            message: `parameter "${key}" has type ${actual}, expected ${expected}`,
          };
        }
      }
    }
  }

  return null;
}

function jsType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

// ── The 8 gates ───────────────────────────────────────────────────────

export async function validateProposedToolCall(
  call: ProposedToolCall,
  ctx: ProposedToolCallValidatorContext,
): Promise<ProposedToolCallValidationResult> {
  // Gate 1 — Tool existence
  const tool = await ctx.resolveTool(call.mcpServerId, call.toolName);
  if (!tool) {
    return {
      ok: false,
      code: "invented_tool",
      message: `tool ${call.mcpServerId}/${call.toolName} not found in live registry`,
    };
  }
  const riskClass = ctx.resolveRiskClass(tool);

  // Gate 7 — Quarantined hard block (run early so other checks don't
  // produce noise on a tool that's going to fail anyway).
  if (riskClass === "quarantined") {
    return {
      ok: false,
      code: "quarantined_tool",
      message: `tool ${call.toolName} is quarantined (D-TOOL-1 default-deny)`,
    };
  }

  // Gate 2 — Argument schema
  const argFailure = validateArgumentsAgainstSchema(call.arguments ?? {}, tool.inputSchema);
  if (argFailure) {
    return {
      ok: false,
      code: argFailure.code,
      message: argFailure.message,
    };
  }

  // Gate 3 — Evidence existence
  for (const id of call.evidenceChunkIds) {
    if (!ctx.retrievalChunkIdSet.has(id)) {
      return {
        ok: false,
        code: "fabricated_evidence",
        message: `evidence chunk "${id}" not in this turn's retrieval result`,
      };
    }
  }
  for (const id of call.knowledgeUnitIds ?? []) {
    if (!ctx.knowledgeUnitIdSet.has(id)) {
      return {
        ok: false,
        code: "fabricated_evidence",
        message: `knowledge unit ${id} not surfaced this turn`,
      };
    }
  }
  // C3-c6 (cycle-6 audit closure §C3-c6): pre-cycle-6 this loop
  // checked against `ctx.knowledgeUnitIdSet` — the wrong set.
  // Tool-knowledge ids and knowledge-unit ids share an integer space
  // but the rows live in different tables (agsMcpToolKnowledge vs
  // agsKnowledgeUnits) with no overlap. Latent bug: no production
  // caller emits toolKnowledgeIds today, so the misdirected check
  // never fires. Any future caller would have hit systematic
  // false-rejection.
  for (const id of call.toolKnowledgeIds ?? []) {
    if (!ctx.toolKnowledgeIdSet.has(id)) {
      return {
        ok: false,
        code: "fabricated_evidence",
        message: `tool-knowledge unit ${id} not surfaced this turn`,
      };
    }
  }
  for (const id of call.cagBlockIds ?? []) {
    if (!ctx.cagBlockIdSet.has(id)) {
      return {
        ok: false,
        code: "fabricated_evidence",
        message: `CAG block "${id}" not loaded this turn`,
      };
    }
  }

  // Gate 4 — Schema hash integrity
  const liveSchemaHash = computeLiveSchemaHash(tool);
  if (call.schemaHash && call.schemaHash !== liveSchemaHash) {
    return {
      ok: false,
      code: "schema_mismatch",
      message: `schemaHash mismatch: claimed=${call.schemaHash}, live=${liveSchemaHash}`,
    };
  }

  // Gate 5 — Risk level
  const expectedRiskLevel = riskClassToRiskLevel(riskClass);
  if (call.riskLevel !== expectedRiskLevel) {
    return {
      ok: false,
      code: "risk_level_mismatch",
      message: `riskLevel claim "${call.riskLevel}" disagrees with manifest taxonomy "${expectedRiskLevel}" (riskClass=${riskClass})`,
    };
  }

  // Gate 6 — Approval claim
  const expectedApproval = approvalRequiredFor(riskClass);
  if (call.requiresApproval !== expectedApproval) {
    return {
      ok: false,
      code: "approval_claim_mismatch",
      message: `requiresApproval claim ${call.requiresApproval} disagrees with policy table (riskClass=${riskClass} → ${expectedApproval})`,
    };
  }

  // Gate 8 — Sandbox prerequisite (D-SBX-2)
  if (riskClass === "code_execution" && !ctx.sandboxHealthOk) {
    return {
      ok: false,
      code: "sandbox_required",
      message: `tool ${call.toolName} requires a healthy sandbox (D-SBX-2); sandbox health probe ok=false`,
    };
  }

  return {
    ok: true,
    normalized: {
      ...call,
      riskLevel: expectedRiskLevel,
      requiresApproval: expectedApproval,
      schemaHash: liveSchemaHash,
    },
    liveSchemaHash,
  };
}
