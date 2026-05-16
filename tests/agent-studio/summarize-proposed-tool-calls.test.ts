/**
 * Phase G §T-G.61 — `summarizeProposedToolCalls` lockstep.
 *
 * Stable-shape row-state aggregator over `ProposedToolCall[]`. First
 * instantiation of the lesson-30 aggregator-pair pattern on a
 * RUNTIME-touching surface (vs the first 5 which were configuration
 * / registry / persisted-state surfaces).
 */

import { describe, expect, it } from "vitest";
import { summarizeProposedToolCalls } from "../../server/agent-studio/services/mcp/proposed-tool-call-summary.js";
import {
  PROPOSED_TOOL_CALL_RISK_LEVELS,
  type ProposedToolCall,
} from "../../server/agent-studio/services/mcp/proposed-tool-call.js";

function makeCall(overrides: Partial<ProposedToolCall> = {}): ProposedToolCall {
  return {
    mcpServerId: "server-a",
    toolName: "test-tool",
    arguments: {},
    rationale: "test",
    evidenceChunkIds: [],
    riskLevel: "low",
    requiresApproval: false,
    ...overrides,
  };
}

describe("summarizeProposedToolCalls — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeProposedToolCalls([]);
    expect(s.total).toBe(0);
    expect(s.distinctMcpServerCount).toBe(0);
    expect(s.requiresApprovalCount).toBe(0);
    expect(s.requiresApprovalPercent).toBe(0);
    expect(s.withEvidenceCount).toBe(0);
    expect(s.withKnowledgeUnitCount).toBe(0);
    expect(s.withCagBlockCount).toBe(0);
    expect(s.withSchemaHashCount).toBe(0);
    expect(s.byMcpServerId).toEqual({});
  });

  it("byRiskLevel carries every closed level at 0 (stable shape)", () => {
    const s = summarizeProposedToolCalls([]);
    for (const level of PROPOSED_TOOL_CALL_RISK_LEVELS) {
      expect(s.byRiskLevel[level]).toBe(0);
    }
  });
});

describe("summarizeProposedToolCalls — single call", () => {
  it("counts a single low-risk read-only call on the correct axes", () => {
    const s = summarizeProposedToolCalls([
      makeCall({
        mcpServerId: "fs",
        toolName: "read",
        riskLevel: "low",
        requiresApproval: false,
        evidenceChunkIds: ["chunk-1"],
      }),
    ]);
    expect(s.total).toBe(1);
    expect(s.byRiskLevel.low).toBe(1);
    expect(s.byRiskLevel.medium).toBe(0);
    expect(s.byRiskLevel.high).toBe(0);
    expect(s.byRiskLevel.critical).toBe(0);
    expect(s.byMcpServerId.fs).toBe(1);
    expect(s.distinctMcpServerCount).toBe(1);
    expect(s.requiresApprovalCount).toBe(0);
    expect(s.withEvidenceCount).toBe(1);
  });
});

describe("summarizeProposedToolCalls — mixed risk-level batch", () => {
  it("counts each risk-level correctly", () => {
    const s = summarizeProposedToolCalls([
      makeCall({ riskLevel: "low" }),
      makeCall({ riskLevel: "low" }),
      makeCall({ riskLevel: "medium" }),
      makeCall({ riskLevel: "high", requiresApproval: true }),
      makeCall({ riskLevel: "critical", requiresApproval: true }),
    ]);
    expect(s.total).toBe(5);
    expect(s.byRiskLevel.low).toBe(2);
    expect(s.byRiskLevel.medium).toBe(1);
    expect(s.byRiskLevel.high).toBe(1);
    expect(s.byRiskLevel.critical).toBe(1);
  });

  it("byRiskLevel sums to total", () => {
    const calls = [
      makeCall({ riskLevel: "low" }),
      makeCall({ riskLevel: "medium" }),
      makeCall({ riskLevel: "high" }),
    ];
    const s = summarizeProposedToolCalls(calls);
    let sum = 0;
    for (const level of PROPOSED_TOOL_CALL_RISK_LEVELS) {
      sum += s.byRiskLevel[level];
    }
    expect(sum).toBe(s.total);
  });
});

describe("summarizeProposedToolCalls — approval rate", () => {
  it("counts requiresApproval entries", () => {
    const s = summarizeProposedToolCalls([
      makeCall({ requiresApproval: false }),
      makeCall({ requiresApproval: true }),
      makeCall({ requiresApproval: true }),
      makeCall({ requiresApproval: false }),
    ]);
    expect(s.requiresApprovalCount).toBe(2);
    expect(s.requiresApprovalPercent).toBe(50);
  });

  it("1/3 → 33.3 percent precision", () => {
    const s = summarizeProposedToolCalls([
      makeCall({ requiresApproval: true }),
      makeCall({ requiresApproval: false }),
      makeCall({ requiresApproval: false }),
    ]);
    expect(s.requiresApprovalPercent).toBe(33.3);
  });
});

describe("summarizeProposedToolCalls — server breakdown", () => {
  it("counts per mcpServerId and tracks distinct count", () => {
    const s = summarizeProposedToolCalls([
      makeCall({ mcpServerId: "a" }),
      makeCall({ mcpServerId: "a" }),
      makeCall({ mcpServerId: "b" }),
      makeCall({ mcpServerId: "c" }),
    ]);
    expect(s.byMcpServerId.a).toBe(2);
    expect(s.byMcpServerId.b).toBe(1);
    expect(s.byMcpServerId.c).toBe(1);
    expect(s.distinctMcpServerCount).toBe(3);
  });

  it("byMcpServerId is sparse (no zero-fill on unregistered servers)", () => {
    const s = summarizeProposedToolCalls([makeCall({ mcpServerId: "x" })]);
    expect(s.byMcpServerId.x).toBe(1);
    expect(s.byMcpServerId.never_seen).toBeUndefined();
  });
});

describe("summarizeProposedToolCalls — evidence cite gauges", () => {
  it("withEvidenceCount counts non-empty evidenceChunkIds arrays", () => {
    const s = summarizeProposedToolCalls([
      makeCall({ evidenceChunkIds: [] }),
      makeCall({ evidenceChunkIds: ["c1"] }),
      makeCall({ evidenceChunkIds: ["c1", "c2"] }),
    ]);
    expect(s.withEvidenceCount).toBe(2);
  });

  it("withKnowledgeUnitCount counts non-empty knowledgeUnitIds arrays", () => {
    const s = summarizeProposedToolCalls([
      makeCall({ knowledgeUnitIds: undefined }),
      makeCall({ knowledgeUnitIds: [] }),
      makeCall({ knowledgeUnitIds: [1] }),
    ]);
    expect(s.withKnowledgeUnitCount).toBe(1);
  });

  it("withCagBlockCount counts non-empty cagBlockIds arrays", () => {
    const s = summarizeProposedToolCalls([
      makeCall({ cagBlockIds: undefined }),
      makeCall({ cagBlockIds: ["block-1"] }),
    ]);
    expect(s.withCagBlockCount).toBe(1);
  });

  it("withSchemaHashCount counts non-empty schemaHash claims", () => {
    const s = summarizeProposedToolCalls([
      makeCall({ schemaHash: undefined }),
      makeCall({ schemaHash: "" }),
      makeCall({ schemaHash: "abc123" }),
    ]);
    expect(s.withSchemaHashCount).toBe(1);
  });
});

describe("summarizeProposedToolCalls — edge cases", () => {
  it("never returns NaN on empty (defensive)", () => {
    const s = summarizeProposedToolCalls([]);
    expect(Number.isNaN(s.requiresApprovalPercent)).toBe(false);
  });
});
