/**
 * Retrofit P8 — ProposedToolCall validator (pure gates).
 *
 * Each test injects a fake `ProposedToolCallValidatorContext` so we
 * exercise the eight gates without touching the live registry, the
 * retrieval planner, or the sandbox health probe.
 */

import { describe, it, expect } from "vitest";
import {
  approvalRequiredFor,
  canonicalProposedToolCall,
  hashProposedToolCall,
  riskClassToRiskLevel,
  validateProposedToolCall,
  type ProposedToolCall,
  type ProposedToolCallValidatorContext,
} from "../../server/agent-studio/services/mcp/proposed-tool-call";
import type { McpTool } from "../../server/agent-studio/services/mcp/types";
import type { ToolRiskClass } from "../../server/agent-studio/services/cag/types";

// ── Test fixtures ─────────────────────────────────────────────────────

const READ_TOOL: McpTool = {
  name: "search_docs",
  description: "search documentation",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number" },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

const CODE_EXEC_TOOL: McpTool = {
  name: "run_python",
  description: "execute python in sandbox",
  inputSchema: {
    type: "object",
    properties: { code: { type: "string" } },
    required: ["code"],
    additionalProperties: false,
  },
};

const QUARANTINED_TOOL: McpTool = {
  name: "scary_thing",
  description: "unknown tool, default-deny",
  inputSchema: { type: "object", properties: {} },
};

const DESTRUCTIVE_TOOL: McpTool = {
  name: "drop_table",
  description: "permanently delete a table",
  inputSchema: {
    type: "object",
    properties: { table: { type: "string" } },
    required: ["table"],
    additionalProperties: false,
  },
};

function makeCtx(overrides: Partial<ProposedToolCallValidatorContext> & {
  tools?: Map<string, { tool: McpTool; riskClass: ToolRiskClass }>;
}): ProposedToolCallValidatorContext {
  const tools = overrides.tools ?? new Map();
  return {
    resolveTool: async (serverId, toolName) =>
      tools.get(`${serverId}/${toolName}`)?.tool ?? null,
    resolveRiskClass: (tool) => {
      for (const entry of tools.values()) {
        if (entry.tool.name === tool.name) return entry.riskClass;
      }
      return "read_only";
    },
    retrievalChunkIdSet: overrides.retrievalChunkIdSet ?? new Set(),
    knowledgeUnitIdSet: overrides.knowledgeUnitIdSet ?? new Set(),
    cagBlockIdSet: overrides.cagBlockIdSet ?? new Set(),
    sandboxHealthOk: overrides.sandboxHealthOk ?? true,
  };
}

function baseCall(overrides: Partial<ProposedToolCall> = {}): ProposedToolCall {
  return {
    mcpServerId: "srv1",
    toolName: "search_docs",
    arguments: { query: "hello" },
    rationale: "user asked",
    evidenceChunkIds: [],
    riskLevel: "low",
    requiresApproval: false,
    ...overrides,
  };
}

// ── Risk-level / approval mapping (D-APP-EXT-4) ───────────────────────

describe("riskClassToRiskLevel", () => {
  it("maps the 8-class taxonomy onto the 4-level enum", () => {
    expect(riskClassToRiskLevel("read_only")).toBe("low");
    expect(riskClassToRiskLevel("write")).toBe("medium");
    expect(riskClassToRiskLevel("external_side_effect")).toBe("medium");
    expect(riskClassToRiskLevel("governance_sensitive")).toBe("medium");
    expect(riskClassToRiskLevel("credential_sensitive")).toBe("high");
    expect(riskClassToRiskLevel("code_execution")).toBe("high");
    expect(riskClassToRiskLevel("destructive")).toBe("critical");
    expect(riskClassToRiskLevel("quarantined")).toBe("critical");
  });
});

describe("approvalRequiredFor", () => {
  it("requires approval for medium-governance and above", () => {
    expect(approvalRequiredFor("read_only")).toBe(false);
    expect(approvalRequiredFor("write")).toBe(false);
    expect(approvalRequiredFor("external_side_effect")).toBe(false);
    expect(approvalRequiredFor("governance_sensitive")).toBe(true);
    expect(approvalRequiredFor("credential_sensitive")).toBe(true);
    expect(approvalRequiredFor("code_execution")).toBe(true);
    expect(approvalRequiredFor("destructive")).toBe(true);
    expect(approvalRequiredFor("quarantined")).toBe(true);
  });
});

// ── Canonicalization (D-PTC-4) ────────────────────────────────────────

describe("canonicalProposedToolCall + hashProposedToolCall", () => {
  it("produces stable output regardless of argument key order", () => {
    const a = baseCall({ arguments: { query: "x", limit: 5 } });
    const b = baseCall({ arguments: { limit: 5, query: "x" } });
    expect(canonicalProposedToolCall(a)).toBe(canonicalProposedToolCall(b));
    expect(hashProposedToolCall(a)).toBe(hashProposedToolCall(b));
  });

  it("different rationale → different hash (per D-PTC-4)", () => {
    const a = baseCall({ rationale: "because A" });
    const b = baseCall({ rationale: "because B" });
    expect(hashProposedToolCall(a)).not.toBe(hashProposedToolCall(b));
  });

  it("hash is 64-char hex (SHA-256)", () => {
    expect(hashProposedToolCall(baseCall())).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── The 8 gates ───────────────────────────────────────────────────────

describe("validateProposedToolCall — Gate 1: tool existence", () => {
  it("invented_tool when registry has no match", async () => {
    const ctx = makeCtx({ tools: new Map() });
    const r = await validateProposedToolCall(baseCall(), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invented_tool");
  });
});

describe("validateProposedToolCall — Gate 7 (early): quarantined block", () => {
  it("quarantined_tool short-circuits before other checks", async () => {
    const ctx = makeCtx({
      tools: new Map([
        ["srv1/scary_thing", { tool: QUARANTINED_TOOL, riskClass: "quarantined" }],
      ]),
    });
    // Even a perfectly-claimed call fails because the tool is quarantined.
    const r = await validateProposedToolCall(
      baseCall({
        toolName: "scary_thing",
        arguments: {},
        riskLevel: "critical",
        requiresApproval: true,
      }),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("quarantined_tool");
  });
});

describe("validateProposedToolCall — Gate 2: argument schema", () => {
  function readCtx() {
    return makeCtx({
      tools: new Map([
        ["srv1/search_docs", { tool: READ_TOOL, riskClass: "read_only" }],
      ]),
    });
  }

  it("missing_parameter for required field", async () => {
    const r = await validateProposedToolCall(
      baseCall({ arguments: {} }),
      readCtx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_parameter");
  });

  it("invented_parameter for unknown key (additionalProperties: false)", async () => {
    const r = await validateProposedToolCall(
      baseCall({ arguments: { query: "x", extra: 1 } }),
      readCtx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invented_parameter");
  });

  it("invented_parameter for type mismatch", async () => {
    const r = await validateProposedToolCall(
      baseCall({ arguments: { query: 42 } }),
      readCtx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invented_parameter");
  });
});

describe("validateProposedToolCall — Gate 3: evidence existence", () => {
  function readCtx(extra: Partial<ProposedToolCallValidatorContext> = {}) {
    return makeCtx({
      tools: new Map([
        ["srv1/search_docs", { tool: READ_TOOL, riskClass: "read_only" }],
      ]),
      ...extra,
    });
  }

  it("fabricated_evidence when chunk id is not in retrieval result", async () => {
    const r = await validateProposedToolCall(
      baseCall({ evidenceChunkIds: ["chunk-not-loaded"] }),
      readCtx({ retrievalChunkIdSet: new Set(["chunk-other"]) }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("fabricated_evidence");
  });

  it("fabricated_evidence when knowledgeUnitId not surfaced", async () => {
    const r = await validateProposedToolCall(
      baseCall({ knowledgeUnitIds: [99] }),
      readCtx({ knowledgeUnitIdSet: new Set([1, 2]) }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("fabricated_evidence");
  });

  it("fabricated_evidence when CAG block id not loaded", async () => {
    const r = await validateProposedToolCall(
      baseCall({ cagBlockIds: ["sec-not-loaded"] }),
      readCtx({ cagBlockIdSet: new Set(["sec-loaded"]) }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("fabricated_evidence");
  });

  it("passes when every evidence id is resolved", async () => {
    const r = await validateProposedToolCall(
      baseCall({
        evidenceChunkIds: ["c1"],
        knowledgeUnitIds: [1],
        cagBlockIds: ["sec-1"],
      }),
      readCtx({
        retrievalChunkIdSet: new Set(["c1"]),
        knowledgeUnitIdSet: new Set([1]),
        cagBlockIdSet: new Set(["sec-1"]),
      }),
    );
    expect(r.ok).toBe(true);
  });
});

describe("validateProposedToolCall — Gate 4: schema hash", () => {
  it("schema_mismatch when claimed hash disagrees with live", async () => {
    const ctx = makeCtx({
      tools: new Map([
        ["srv1/search_docs", { tool: READ_TOOL, riskClass: "read_only" }],
      ]),
    });
    const r = await validateProposedToolCall(
      baseCall({ schemaHash: "deadbeef".repeat(8) }),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("schema_mismatch");
  });

  it("missing schemaHash is allowed; validator computes liveSchemaHash", async () => {
    const ctx = makeCtx({
      tools: new Map([
        ["srv1/search_docs", { tool: READ_TOOL, riskClass: "read_only" }],
      ]),
    });
    const r = await validateProposedToolCall(baseCall(), ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.liveSchemaHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("validateProposedToolCall — Gate 5: risk level", () => {
  it("risk_level_mismatch when claim disagrees with manifest taxonomy", async () => {
    const ctx = makeCtx({
      tools: new Map([
        ["srv1/run_python", { tool: CODE_EXEC_TOOL, riskClass: "code_execution" }],
      ]),
    });
    // code_execution → high; claim "low" should fail.
    const r = await validateProposedToolCall(
      baseCall({
        toolName: "run_python",
        arguments: { code: "print(1)" },
        riskLevel: "low",
        requiresApproval: false,
      }),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("risk_level_mismatch");
  });
});

describe("validateProposedToolCall — Gate 6: approval claim", () => {
  it("approval_claim_mismatch when claim disagrees with policy table", async () => {
    const ctx = makeCtx({
      tools: new Map([
        ["srv1/drop_table", { tool: DESTRUCTIVE_TOOL, riskClass: "destructive" }],
      ]),
    });
    // destructive → critical, requires approval. Claiming requiresApproval=false fails.
    const r = await validateProposedToolCall(
      baseCall({
        toolName: "drop_table",
        arguments: { table: "users" },
        riskLevel: "critical",
        requiresApproval: false,
      }),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("approval_claim_mismatch");
  });
});

describe("validateProposedToolCall — Gate 8: sandbox prerequisite", () => {
  it("sandbox_required when code_execution tool runs against unhealthy sandbox", async () => {
    const ctx = makeCtx({
      tools: new Map([
        ["srv1/run_python", { tool: CODE_EXEC_TOOL, riskClass: "code_execution" }],
      ]),
      sandboxHealthOk: false,
    });
    const r = await validateProposedToolCall(
      baseCall({
        toolName: "run_python",
        arguments: { code: "print(1)" },
        riskLevel: "high",
        requiresApproval: true,
      }),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("sandbox_required");
  });

  it("passes when sandbox is healthy", async () => {
    const ctx = makeCtx({
      tools: new Map([
        ["srv1/run_python", { tool: CODE_EXEC_TOOL, riskClass: "code_execution" }],
      ]),
      sandboxHealthOk: true,
    });
    const r = await validateProposedToolCall(
      baseCall({
        toolName: "run_python",
        arguments: { code: "print(1)" },
        riskLevel: "high",
        requiresApproval: true,
      }),
      ctx,
    );
    expect(r.ok).toBe(true);
  });
});

describe("validateProposedToolCall — happy path", () => {
  it("normalizes risk + approval + schema hash on success", async () => {
    const ctx = makeCtx({
      tools: new Map([
        ["srv1/search_docs", { tool: READ_TOOL, riskClass: "read_only" }],
      ]),
    });
    const r = await validateProposedToolCall(baseCall(), ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized.riskLevel).toBe("low");
      expect(r.normalized.requiresApproval).toBe(false);
      expect(r.normalized.schemaHash).toBe(r.liveSchemaHash);
      expect(r.liveSchemaHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
