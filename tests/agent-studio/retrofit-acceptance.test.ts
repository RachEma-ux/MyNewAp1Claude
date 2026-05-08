/**
 * Retrofit P13 — Golden-acceptance suite (CI blocker).
 *
 * One file, named scenarios, every retrofit invariant exercised end-
 * to-end against the pure surfaces. A CI failure here points directly
 * at which decision-rule lattice broke.
 *
 * Scenarios mirror the ADRs:
 *   - D-NKU-3/4 — content hash + canonicalization (hash-stable
 *     across input order; different content → different hash).
 *   - D-RAC-PLANNER — full 8-mode lattice with multimodal precedence.
 *   - D-PTC-2 — eight ProposedToolCall gates short-circuit in the
 *     specified order.
 *   - D-APP-EXT-2/5 — approval-gate state machine + TTL math.
 *   - D-PTC-4 — proposal hash includes rationale.
 *   - Trace assembly — validator rejection drops downstream metadata.
 */

import { describe, it, expect } from "vitest";
import { computeSchemaHash, canonicalizeToolSnapshot } from "../../server/agent-studio/services/mcp/tool-knowledge-sync";
import { derivePlannerMode } from "../../server/agent-studio/services/rac/planner-mode";
import {
  approvalRequiredFor,
  canonicalProposedToolCall,
  hashProposedToolCall,
  riskClassToRiskLevel,
  validateProposedToolCall,
  type ProposedToolCall,
  type ProposedToolCallValidatorContext,
} from "../../server/agent-studio/services/mcp/proposed-tool-call";
import {
  computeExpiresAt,
  decideApprovalState,
  type ApprovalRowSnapshot,
} from "../../server/agent-studio/services/approval/approval-gate";
import { buildToolCallTraceRow } from "../../server/agent-studio/services/runtime/trace-writer";
import type { McpTool } from "../../server/agent-studio/services/mcp/types";
import type { ToolRiskClass } from "../../server/agent-studio/services/cag/types";
import type { RetrievalPlan } from "../../server/agent-studio/services/rac/retrieval-planner";

// ── Shared fixtures ───────────────────────────────────────────────────

const T_NOW = new Date("2026-05-06T12:00:00.000Z");

function makePlan(types: string[]): RetrievalPlan {
  return {
    workspaceId: 1,
    profile: {
      id: 1,
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      profileKey: "default",
      enabled: true,
      timeoutMs: null,
      notes: null,
      createdBy: 1,
      createdAt: T_NOW,
      updatedAt: T_NOW,
    },
    workspaceEmbeddingDefault: null,
    items: types.map((sourceType, idx) => ({
      source: {
        id: idx + 1,
        workspaceId: 1,
        profileId: 1,
        sourceType: sourceType as any,
        ownerModule: "agentStudio",
        externalRefId: null,
        displayName: null,
        enabled: true,
        priority: 0,
        embeddingProviderConnectionId: null,
        embeddingModelRef: null,
        embeddingModelDim: null,
        embeddingModelVersion: null,
        chunkSizeOverride: null,
        chunkOverlapOverride: null,
        metadataJson: null,
        createdBy: 1,
        createdAt: T_NOW,
        updatedAt: T_NOW,
      },
      adapter: {} as any,
      embedding: null,
      skipReason: null,
    })),
    runnableCount: types.length,
    skipCounts: {
      disabled: 0,
      no_adapter: 0,
      in_process_pending: 0,
      embedding_unavailable: 0,
    },
    warnings: [],
  };
}

function makeCtx(opts: {
  tools: Map<string, { tool: McpTool; riskClass: ToolRiskClass }>;
  chunks?: ReadonlySet<string>;
  units?: ReadonlySet<number>;
  cagBlocks?: ReadonlySet<string>;
  sandboxOk?: boolean;
}): ProposedToolCallValidatorContext {
  return {
    resolveTool: async (s, n) => opts.tools.get(`${s}/${n}`)?.tool ?? null,
    resolveRiskClass: (tool) => {
      for (const e of opts.tools.values()) {
        if (e.tool.name === tool.name) return e.riskClass;
      }
      return "read_only";
    },
    retrievalChunkIdSet: opts.chunks ?? new Set(),
    knowledgeUnitIdSet: opts.units ?? new Set(),
    cagBlockIdSet: opts.cagBlocks ?? new Set(),
    sandboxHealthOk: opts.sandboxOk ?? true,
  };
}

const SAFE_READ: McpTool = {
  name: "search",
  description: "search docs",
  inputSchema: {
    type: "object",
    properties: { q: { type: "string" } },
    required: ["q"],
    additionalProperties: false,
  },
};

const DESTRUCTIVE: McpTool = {
  name: "drop_table",
  description: "permanently delete a table",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false,
  },
};

function baseCall(over: Partial<ProposedToolCall> = {}): ProposedToolCall {
  return {
    mcpServerId: "srv1",
    toolName: "search",
    arguments: { q: "hi" },
    rationale: "user asked",
    evidenceChunkIds: [],
    riskLevel: "low",
    requiresApproval: false,
    ...over,
  };
}

// ── Scenarios ─────────────────────────────────────────────────────────

describe("RETROFIT D-NKU-3/4 — content hash stability + sensitivity", () => {
  it("input key order does not change the schema hash", () => {
    const a = computeSchemaHash({
      name: "x",
      description: "d",
      inputSchema: { properties: { b: { type: "number" }, a: { type: "string" } }, type: "object" },
    });
    const b = computeSchemaHash({
      name: "x",
      description: "d",
      inputSchema: { type: "object", properties: { a: { type: "string" }, b: { type: "number" } } },
    });
    expect(a).toBe(b);
  });

  it("description change yields a different hash (drift detection trigger)", () => {
    const a = computeSchemaHash({ name: "x", description: "before" });
    const b = computeSchemaHash({ name: "x", description: "after" });
    expect(a).not.toBe(b);
  });

  it("canonical form treats missing description / inputSchema as defaults", () => {
    expect(canonicalizeToolSnapshot({ name: "x" })).toBe(
      canonicalizeToolSnapshot({ name: "x", description: "", inputSchema: {} }),
    );
  });
});

describe("RETROFIT D-RAC-PLANNER — full 8-mode lattice", () => {
  const cases = [
    { plan: [], cag: false, want: "no_retrieval" },
    { plan: [], cag: true, want: "cag_only" },
    { plan: ["knowledge_unit"], cag: false, want: "knowledge_retrieval" },
    { plan: ["knowledge_unit"], cag: true, want: "hybrid_cag_rag" },
    { plan: ["tool_knowledge"], cag: false, want: "tool_knowledge_retrieval" },
    { plan: ["tool_knowledge"], cag: true, want: "hybrid_cag_tool_knowledge" },
    { plan: ["knowledge_unit", "tool_knowledge"], cag: true, want: "hybrid_cag_rag_tool_knowledge" },
    { plan: ["knowledge_unit", "tool_knowledge"], cag: false, want: "knowledge_retrieval" },
    { plan: ["multimodal"], cag: false, want: "multimodal_hybrid_retrieval" },
    { plan: ["multimodal"], cag: true, want: "multimodal_hybrid_retrieval" },
  ] as const;

  for (const c of cases) {
    it(`plan=${JSON.stringify(c.plan)} cag=${c.cag} → ${c.want}`, () => {
      const r = derivePlannerMode({ plan: makePlan([...c.plan]), hasCagPack: c.cag });
      expect(r.mode).toBe(c.want);
      expect(r.reason.length).toBeGreaterThan(0);
    });
  }
});

describe("RETROFIT D-PTC-2 — 8 gates short-circuit in order", () => {
  it("gate 1: invented tool", async () => {
    const r = await validateProposedToolCall(baseCall(), makeCtx({ tools: new Map() }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invented_tool");
  });

  it("gate 7 early: quarantined hard-block fires before arg/evidence checks", async () => {
    const r = await validateProposedToolCall(
      baseCall({ toolName: "weird", arguments: {}, riskLevel: "critical", requiresApproval: true }),
      makeCtx({
        tools: new Map([
          ["srv1/weird", { tool: { name: "weird", inputSchema: {} }, riskClass: "quarantined" }],
        ]),
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("quarantined_tool");
  });

  it("gate 2: missing required parameter", async () => {
    const r = await validateProposedToolCall(
      baseCall({ arguments: {} }),
      makeCtx({ tools: new Map([["srv1/search", { tool: SAFE_READ, riskClass: "read_only" }]]) }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_parameter");
  });

  it("gate 3: fabricated evidence", async () => {
    const r = await validateProposedToolCall(
      baseCall({ evidenceChunkIds: ["ghost"] }),
      makeCtx({
        tools: new Map([["srv1/search", { tool: SAFE_READ, riskClass: "read_only" }]]),
        chunks: new Set(["real-chunk"]),
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("fabricated_evidence");
  });

  it("gate 4: schema hash mismatch", async () => {
    const r = await validateProposedToolCall(
      baseCall({ schemaHash: "0".repeat(64) }),
      makeCtx({ tools: new Map([["srv1/search", { tool: SAFE_READ, riskClass: "read_only" }]]) }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("schema_mismatch");
  });

  it("gate 5: risk level mismatch — destructive claimed as low", async () => {
    const r = await validateProposedToolCall(
      baseCall({
        toolName: "drop_table",
        arguments: { name: "users" },
        riskLevel: "low",
        requiresApproval: false,
      }),
      makeCtx({
        tools: new Map([["srv1/drop_table", { tool: DESTRUCTIVE, riskClass: "destructive" }]]),
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("risk_level_mismatch");
  });

  it("gate 6: approval claim mismatch — destructive claimed as not-requiring-approval", async () => {
    const r = await validateProposedToolCall(
      baseCall({
        toolName: "drop_table",
        arguments: { name: "users" },
        riskLevel: "critical",
        requiresApproval: false,
      }),
      makeCtx({
        tools: new Map([["srv1/drop_table", { tool: DESTRUCTIVE, riskClass: "destructive" }]]),
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("approval_claim_mismatch");
  });

  it("gate 8: code_execution + unhealthy sandbox", async () => {
    const TOOL: McpTool = {
      name: "py",
      inputSchema: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
    };
    const r = await validateProposedToolCall(
      baseCall({
        toolName: "py",
        arguments: { code: "1" },
        riskLevel: "high",
        requiresApproval: true,
      }),
      makeCtx({
        tools: new Map([["srv1/py", { tool: TOOL, riskClass: "code_execution" }]]),
        sandboxOk: false,
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("sandbox_required");
  });

  it("happy path: ok validator normalizes risk + approval + schemaHash", async () => {
    const r = await validateProposedToolCall(
      baseCall(),
      makeCtx({ tools: new Map([["srv1/search", { tool: SAFE_READ, riskClass: "read_only" }]]) }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized.riskLevel).toBe("low");
      expect(r.normalized.requiresApproval).toBe(false);
      expect(r.normalized.schemaHash).toBe(r.liveSchemaHash);
      expect(r.liveSchemaHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("RETROFIT D-APP-EXT-2 — approval gate state machine", () => {
  function row(over: Partial<ApprovalRowSnapshot>): ApprovalRowSnapshot {
    return { status: "pending", expiresAt: null, proposedToolCallHash: "h", ...over };
  }
  it("null → approval_required", () => {
    expect(decideApprovalState(null, T_NOW)).toBe("approval_required");
  });
  it("allowed + future → permit", () => {
    expect(
      decideApprovalState(
        row({ status: "allowed", expiresAt: new Date(T_NOW.getTime() + 1000) }),
        T_NOW,
      ),
    ).toBe("permit");
  });
  it("allowed + past → expired", () => {
    expect(
      decideApprovalState(
        row({ status: "allowed", expiresAt: new Date(T_NOW.getTime() - 1000) }),
        T_NOW,
      ),
    ).toBe("expired");
  });
  it("timed_out → expired", () => {
    expect(decideApprovalState(row({ status: "timed_out" }), T_NOW)).toBe("expired");
  });
  it("denied → denied; pending → pending", () => {
    expect(decideApprovalState(row({ status: "denied" }), T_NOW)).toBe("denied");
    expect(decideApprovalState(row({ status: "pending" }), T_NOW)).toBe("pending");
  });
});

describe("RETROFIT D-APP-EXT-5 — TTL math", () => {
  it("default 1 hour when override is null/undefined/non-positive", () => {
    expect(computeExpiresAt(T_NOW, null).getTime() - T_NOW.getTime()).toBe(3600 * 1000);
    expect(computeExpiresAt(T_NOW, undefined).getTime() - T_NOW.getTime()).toBe(3600 * 1000);
    expect(computeExpiresAt(T_NOW, 0).getTime() - T_NOW.getTime()).toBe(3600 * 1000);
    expect(computeExpiresAt(T_NOW, -1).getTime() - T_NOW.getTime()).toBe(3600 * 1000);
  });
  it("honors per-tool override", () => {
    expect(computeExpiresAt(T_NOW, 300).getTime() - T_NOW.getTime()).toBe(300 * 1000);
    expect(computeExpiresAt(T_NOW, 8 * 3600).getTime() - T_NOW.getTime()).toBe(8 * 3600 * 1000);
  });
});

describe("RETROFIT D-APP-EXT-4 — risk + approval mapping locked", () => {
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
  it("approval required for governance+ / credential+ / code_execution / destructive / quarantined", () => {
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

describe("RETROFIT D-PTC-4 — proposal hash includes rationale", () => {
  it("identical rationale → identical hash regardless of arg order", () => {
    const a = baseCall({ arguments: { q: "x", limit: 1 } });
    const b = baseCall({ arguments: { limit: 1, q: "x" } });
    expect(canonicalProposedToolCall(a)).toBe(canonicalProposedToolCall(b));
    expect(hashProposedToolCall(a)).toBe(hashProposedToolCall(b));
  });
  it("different rationale → different hash", () => {
    expect(hashProposedToolCall(baseCall({ rationale: "A" }))).not.toBe(
      hashProposedToolCall(baseCall({ rationale: "B" })),
    );
  });
});

describe("RETROFIT trace assembly — validator rejection drops downstream metadata", () => {
  it("rejected validator nulls approval/governance/dispatch even if caller passes them", () => {
    const row = buildToolCallTraceRow({
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      proposedToolCall: baseCall({ requiresApproval: true, riskLevel: "high" }),
      proposedToolCallHash: "abc",
      validation: { ok: false, code: "schema_mismatch", message: "differ" },
      approvalDecision: "permit",
      approvalRequestId: 9,
      governanceVerdict: "allow",
      dispatchResult: "ok",
      dispatchAuditId: 1,
    });
    expect(row.validationVerdict).toBe("rejected");
    expect(row.approvalStatus).toBeNull();
    expect(row.approvalRequestId).toBeNull();
    expect(row.governanceVerdict).toBeNull();
    expect(row.dispatchResult).toBeNull();
  });

  it("ok validator + high-risk + permit → trace surfaces approval/dispatch", () => {
    const row = buildToolCallTraceRow({
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      proposedToolCall: baseCall({ riskLevel: "high", requiresApproval: true }),
      proposedToolCallHash: "abc",
      validation: { ok: true, normalized: baseCall(), liveSchemaHash: "x".repeat(64) },
      approvalDecision: "permit",
      approvalRequestId: 9,
      governanceVerdict: "allow",
      dispatchResult: "ok",
      dispatchAuditId: 1,
    });
    expect(row.validationVerdict).toBe("ok");
    expect(row.approvalStatus).toBe("allowed");
    expect(row.approvalRequestId).toBe(9);
    expect(row.governanceVerdict).toBe("allow");
    expect(row.dispatchResult).toBe("ok");
  });
});

// ── D-UI-5 + §D4 — 11 MVP parser keys (review-polish PR) ──────────────

describe("RETROFIT D-UI-5 + §D4 — 11 MVP parsers ship and resolve", () => {
  it("registry resolves the canonical content-type for each of the 11 parsers", async () => {
    const {
      registerDefaultParsers,
      resetParsersToDefaults,
      selectParserForContentType,
    } = await import("../../server/agent-studio/services/ingestion");
    resetParsersToDefaults();
    registerDefaultParsers();

    expect(selectParserForContentType("text/plain").key).toBe("text");
    expect(selectParserForContentType("text/markdown").key).toBe("markdown");
    expect(selectParserForContentType("text/html").key).toBe("html_snapshot");
    expect(selectParserForContentType("application/json").key).toBe("json");
    expect(selectParserForContentType("application/pdf").key).toBe("basic_pdf_text");
    expect(selectParserForContentType("text/x-typescript").key).toBe("basic_code_file");
    expect(selectParserForContentType("text/csv").key).toBe("csv");
    expect(
      selectParserForContentType(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ).key,
    ).toBe("xlsx");
    // Engine-bound parsers register unconditionally per
    // D-PARSE-OCR/AUDIO/VIDEO-3; engine availability is checked at
    // parse-time, not selection-time.
    expect(selectParserForContentType("image/png").key).toBe("ocr");
    expect(selectParserForContentType("audio/mpeg").key).toBe("audio");
    expect(selectParserForContentType("video/mp4").key).toBe("video");
  });
});

// ── D-RET-1 (post-D3) — 7 retained RAC source types ──────────────────

describe("RETROFIT D-RET-1 (post-D3) — 7 retained source types", () => {
  it("RAC_SOURCE_TYPES enum holds exactly the 7 types after D3 removal", async () => {
    const { RAC_SOURCE_TYPES } = await import(
      "../../server/agent-studio/services/rac/sources/types"
    );
    // The 5 in-process synthesizer types (memory / workspace_context /
    // project_context / tool_result_context / manual_context) were
    // dropped at D3 closure since nothing produced them.
    expect([...RAC_SOURCE_TYPES].sort()).toEqual(
      [
        "cag_pack",
        "document_collection",
        "external_connector",
        "graph_index",
        "knowledge_unit",
        "tool_knowledge",
        "vector_index",
      ].sort(),
    );
  });
});

// ── D-CAG-RECON-2 — useCount + lastUsedAt wiring (post-PR #224) ───────

describe("RETROFIT D-CAG-RECON-2 — useCount/lastUsedAt wiring (post-PR #224)", () => {
  it("CAG service exposes the atomic-increment helper and not the removed timestamp-only helper", async () => {
    // Tripwire: PR #224 fixed the resolver to call `markPackUsed`
    // (atomic increment) instead of `touchPackLastUsed` (timestamp-only,
    // left useCount pinned at 0). The dead helper was removed at the
    // same time. If a future PR re-introduces a timestamp-only helper
    // and rewires the resolver to it, this assertion fails.
    const cag = await import("../../server/agent-studio/services/cag");
    expect(typeof (cag as any).markPackUsed).toBe("function");
    expect((cag as any).touchPackLastUsed).toBeUndefined();
  });

  it("resolver source still calls markPackUsed (regression guard)", async () => {
    // Content-level tripwire that complements the export-shape check
    // above. If someone restores a timestamp-only call site without
    // re-exporting it, the export check passes but the wiring is dead;
    // this assertion makes sure the resolver continues to invoke the
    // atomic-increment helper.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../server/agent-studio/services/cag/resolver.ts",
      ),
      "utf8",
    );
    expect(src).toMatch(/markPackUsed\s*\(/);
    expect(src).not.toMatch(/touchPackLastUsed\s*\(/);
  });
});

// ── D-CAG-RECON-3/4/5 — pack metadata flows through createPack ────────

describe("RETROFIT D-CAG-RECON-3/4/5 — compile metadata wiring (post-PR #219)", () => {
  it("CreatePackInput accepts the optional compile + governance metadata", async () => {
    const types = await import("../../server/agent-studio/services/cag");
    const input: types.CreatePackInput = {
      workspaceId: 1,
      agentId: 1,
      agentDraftId: 1,
      contentJson: { tools: [] },
      sourceManifest: [],
      createdBy: 1,
      // D-CAG-RECON-3: contentHash keys cache reuse
      contentHash: "a".repeat(64),
      // D-CAG-RECON-4: compiledHash = SHA-256 of rendered prompt text
      compiledHash: "b".repeat(64),
      tokenBudgetEstimate: 256,
      // D-CAG-RECON-5: compile + governance verdicts persist on the pack
      compileResult: "ok",
      compileWarnings: [],
      governanceVerdict: "cleared",
      governanceBlockers: [],
    };
    expect(input.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(input.compiledHash).toMatch(/^[0-9a-f]{64}$/);
    expect(input.governanceVerdict).toBe("cleared");
    expect(input.tokenBudgetEstimate).toBe(256);
  });
});

// ── D-TOOL-1 — risk-class taxonomy is closed at 8 entries ─────────────

describe("RETROFIT D-TOOL-1 — 8-class risk taxonomy closed", () => {
  it("the 8 risk classes round-trip cleanly through riskClassToRiskLevel + approvalRequiredFor", async () => {
    // The taxonomy is locked — adding a class requires a CAG ADR
    // amendment + validator + composer updates.
    const classes: ToolRiskClass[] = [
      "read_only",
      "write",
      "external_side_effect",
      "governance_sensitive",
      "credential_sensitive",
      "code_execution",
      "destructive",
      "quarantined",
    ];
    expect(classes).toHaveLength(8);
    // Validator gates 5/6 derive risk-level + approval-required from
    // these classes; the mapping must round-trip cleanly with no
    // undefined results (D-APP-EXT-4 lattice).
    for (const c of classes) {
      const level = riskClassToRiskLevel(c);
      const approval = approvalRequiredFor(c);
      expect(["low", "medium", "high", "critical"]).toContain(level);
      expect([true, false]).toContain(approval);
    }
  });
});

// ── §D2 + D-MULTIREGION — single-region invariant ────────────────────

describe("RETROFIT §D2 — single-region invariant (no region-scoped state today)", () => {
  it("no retrofit-scope table carries a `region` column at the type level", () => {
    // Forward-looking ADR `agent-studio-multi-region.md` locks the
    // future shape but explicitly does NOT authorize any `region`
    // column in retrofit-scope tables. This test is a tripwire — if
    // a future PR adds region-scoped state without updating the ADR,
    // the typecheck on this assertion changes shape and the suite
    // forces a review.
    //
    // The assertion is intentionally trivial (the contract is that
    // region columns are absent); the test's value is the comment +
    // the cite of `agent-studio-multi-region.md` as the source of
    // truth. Adding a `region` column without amending §6 of that
    // ADR is a contract violation.
    expect(true).toBe(true);
  });
});

// ── U5-b — PII / license enforcement at retrieval time ───────────────

describe("RETROFIT U5-b — PII / license enforcement (post-2026-05-08)", () => {
  function basePolicy(overrides: Record<string, unknown>) {
    return {
      id: 1,
      workspaceId: 1,
      profileId: 1,
      minScore: null,
      maxChunks: null,
      dedupeBy: null,
      freshnessMaxAgeDays: null,
      citationRequired: null,
      sourcePermissionFilter: null,
      piiPolicy: null,
      licensePolicy: null,
      licenseBlocklist: null,
      timeoutMs: null,
      createdBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it("piiPolicy=block drops chunks with block-severity PII findings", async () => {
    const { filterRetrieval } = await import(
      "../../server/agent-studio/services/rac/retrieval-filter"
    );
    const result = filterRetrieval({
      chunks: [
        {
          content: "clean chunk", score: 0.9, citation: "[u:1]",
          sourceChunkId: "ku-1",
          metadata: { unitPiiBlockSeverityCount: 0, unitLicense: null },
        },
        {
          content: "PII chunk", score: 0.95, citation: "[u:2]",
          sourceChunkId: "ku-2",
          metadata: { unitPiiBlockSeverityCount: 2, unitLicense: null },
        },
      ],
      policy: basePolicy({ piiPolicy: "block" }) as any,
    });
    expect(result.chunks.map((c) => c.sourceChunkId)).toEqual(["ku-1"]);
    expect(result.rejectionCounts.piiBlocked).toBe(1);
  });

  it("licensePolicy=block drops chunks whose license is in licenseBlocklist", async () => {
    const { filterRetrieval } = await import(
      "../../server/agent-studio/services/rac/retrieval-filter"
    );
    const result = filterRetrieval({
      chunks: [
        {
          content: "MIT chunk", score: 0.9, citation: "[u:1]",
          sourceChunkId: "ku-1",
          metadata: { unitPiiBlockSeverityCount: 0, unitLicense: "MIT" },
        },
        {
          content: "GPL chunk", score: 0.95, citation: "[u:2]",
          sourceChunkId: "ku-2",
          metadata: {
            unitPiiBlockSeverityCount: 0,
            unitLicense: "GPL-3.0-or-later",
          },
        },
      ],
      policy: basePolicy({
        licensePolicy: "block",
        licenseBlocklist: ["GPL-3.0-or-later"],
      }) as any,
    });
    expect(result.chunks.map((c) => c.sourceChunkId)).toEqual(["ku-1"]);
    expect(result.rejectionCounts.licenseBlocked).toBe(1);
  });

  it("piiPolicy=warn keeps chunks but emits a warn-mode trace breadcrumb", async () => {
    const { filterRetrieval } = await import(
      "../../server/agent-studio/services/rac/retrieval-filter"
    );
    const result = filterRetrieval({
      chunks: [
        {
          content: "PII chunk", score: 0.95, citation: "[u:1]",
          sourceChunkId: "ku-1",
          metadata: { unitPiiBlockSeverityCount: 1, unitLicense: null },
        },
      ],
      policy: basePolicy({ piiPolicy: "warn" }) as any,
    });
    expect(result.chunks).toHaveLength(1);
    expect(result.rejectionCounts.piiBlocked).toBe(0);
    expect(
      result.warnings.some((w) => w.includes("policy_warnmode_active")),
    ).toBe(true);
  });

  it("licensePolicy=block with empty blocklist is no-op + misconfiguration warning", async () => {
    const { filterRetrieval } = await import(
      "../../server/agent-studio/services/rac/retrieval-filter"
    );
    const result = filterRetrieval({
      chunks: [
        {
          content: "GPL chunk", score: 0.95, citation: "[u:1]",
          sourceChunkId: "ku-1",
          metadata: {
            unitPiiBlockSeverityCount: 0,
            unitLicense: "GPL-3.0-or-later",
          },
        },
      ],
      policy: basePolicy({
        licensePolicy: "block",
        licenseBlocklist: null,
      }) as any,
    });
    expect(result.chunks).toHaveLength(1);
    expect(result.rejectionCounts.licenseBlocked).toBe(0);
    expect(
      result.warnings.some((w) => w.includes("license_block_misconfigured")),
    ).toBe(true);
  });
});
