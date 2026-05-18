/**
 * T-D.4 slice 3 — promote-and-approve combo.
 *
 * Verifies the composition contract:
 *   - promoteAndApproveProposal runs the promote step first, then
 *     calls approveAndApplyProposal with the NEW correction-proposal id
 *   - Operator-supplied rationale flows to BOTH the promotion decision
 *     row AND the approve-and-apply decision row
 *   - Operator-supplied decidedByUserId stamps BOTH sides
 *   - Errors from the promote step short-circuit (no approve call)
 *   - Errors from approveAndApplyProposal propagate after a successful
 *     promote
 *   - Router mounts `promoteAndApprove` mutation that maps bridge
 *     errors to TRPCError codes (same mapping as `promote`)
 *
 * Tests use vi.mock to swap the promote runner + approve-and-apply
 * for stubs so the composition logic is verified without DB or
 * applier-registry I/O.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const { promoteRunnerMock, approveAndApplyMock } = vi.hoisted(() => ({
  promoteRunnerMock: vi.fn(),
  approveAndApplyMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-promote-runner.js",
  () => ({
    runPromoteSemanticEnrichment: (...args: unknown[]) => promoteRunnerMock(...args),
  }),
);

vi.mock(
  "../../server/agent-studio/services/graph-quality/public-api.js",
  () => ({
    approveAndApplyProposal: (...args: unknown[]) => approveAndApplyMock(...args),
  }),
);

import { promoteAndApproveProposal } from "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-promote-and-approve";

const DIR = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment",
);
const COMBO_FILE = join(DIR, "semantic-enrichment-promote-and-approve.ts");
const ROUTER_FILE = join(DIR, "semantic-enrichment-router.ts");
const BARREL = join(DIR, "public-api.ts");

function read(p: string): string {
  return readFileSync(p, "utf8");
}

beforeEach(() => {
  promoteRunnerMock.mockReset();
  approveAndApplyMock.mockReset();
});

// ────────────────────────────────────────────────────────────────────
// Composition behavior
// ────────────────────────────────────────────────────────────────────

describe("promoteAndApproveProposal — composition", () => {
  it("runs promote first, then calls approveAndApply with the new correction-proposal id", async () => {
    const calls: string[] = [];
    promoteRunnerMock.mockImplementation(async () => {
      calls.push("promote");
      return {
        correctionProposalId: 500,
        enrichmentProposalId: 100,
        correctionProposalRow: {} as never,
      };
    });
    approveAndApplyMock.mockImplementation(async () => {
      calls.push("approveAndApply");
      return {
        approval: { id: 500, status: "approved" } as never,
        apply: { applied: true, auditEventId: 9 } as never,
      };
    });

    const result = await promoteAndApproveProposal({
      proposalId: 100,
      decidedByUserId: 22,
      rationale: "lgtm",
    });

    expect(calls).toEqual(["promote", "approveAndApply"]);
    // Promote call shape
    expect(promoteRunnerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: 100,
        decidedByUserId: 22,
        decisionRationale: "lgtm",
      }),
      expect.any(Object),
    );
    // approveAndApply receives the NEW correction id, NOT the source proposal id
    expect(approveAndApplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: 500,
        decidedByUserId: 22,
        rationale: "lgtm",
      }),
      expect.any(Object),
    );

    expect(result.promote.correctionProposalId).toBe(500);
    expect(result.approveAndApply.apply.applied).toBe(true);
  });

  it("threads notifyUserId to approveAndApply only (not to promote)", async () => {
    promoteRunnerMock.mockResolvedValue({
      correctionProposalId: 500,
      enrichmentProposalId: 100,
      correctionProposalRow: {} as never,
    });
    approveAndApplyMock.mockResolvedValue({
      approval: {} as never,
      apply: { applied: true } as never,
    });

    await promoteAndApproveProposal({
      proposalId: 100,
      decidedByUserId: 22,
      notifyUserId: 33,
    });

    expect(promoteRunnerMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "notifyUserId",
    );
    expect(approveAndApplyMock.mock.calls[0]?.[0]).toMatchObject({
      notifyUserId: 33,
    });
  });

  it("threads proposedByAgentId to promote only (not to approveAndApply)", async () => {
    promoteRunnerMock.mockResolvedValue({
      correctionProposalId: 500,
      enrichmentProposalId: 100,
      correctionProposalRow: {} as never,
    });
    approveAndApplyMock.mockResolvedValue({
      approval: {} as never,
      apply: { applied: true } as never,
    });

    await promoteAndApproveProposal({
      proposalId: 100,
      decidedByUserId: 22,
      proposedByAgentId: 7,
    });

    expect(promoteRunnerMock.mock.calls[0]?.[0]).toMatchObject({
      proposedByAgentId: 7,
    });
    expect(approveAndApplyMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "proposedByAgentId",
    );
  });

  it("forwards db / getDb / applierRegistry options to the right half each", async () => {
    promoteRunnerMock.mockResolvedValue({
      correctionProposalId: 500,
      enrichmentProposalId: 100,
      correctionProposalRow: {} as never,
    });
    approveAndApplyMock.mockResolvedValue({
      approval: {} as never,
      apply: { applied: true } as never,
    });

    const fakeDb = { __marker: "db" } as never;
    const fakeGetDb = vi.fn() as never;
    const fakeRegistry = { __marker: "registry" } as never;

    await promoteAndApproveProposal(
      { proposalId: 100, decidedByUserId: 22 },
      {
        db: fakeDb,
        getDb: fakeGetDb,
        applierRegistry: fakeRegistry,
      },
    );

    // promote-runner gets `db` (test-seam DB)
    expect(promoteRunnerMock.mock.calls[0]?.[1]).toMatchObject({ db: fakeDb });
    // approveAndApply gets `getDb` + `registry` (its own option shape)
    expect(approveAndApplyMock.mock.calls[0]?.[1]).toMatchObject({
      getDb: fakeGetDb,
      registry: fakeRegistry,
    });
  });

  it("short-circuits when promote throws — approveAndApply never called", async () => {
    promoteRunnerMock.mockRejectedValue(new Error("promote failed"));

    await expect(
      promoteAndApproveProposal({ proposalId: 100, decidedByUserId: 22 }),
    ).rejects.toThrow("promote failed");
    expect(approveAndApplyMock).not.toHaveBeenCalled();
  });

  it("propagates errors from approveAndApply after a successful promote", async () => {
    promoteRunnerMock.mockResolvedValue({
      correctionProposalId: 500,
      enrichmentProposalId: 100,
      correctionProposalRow: {} as never,
    });
    approveAndApplyMock.mockRejectedValue(new Error("apply failed"));

    await expect(
      promoteAndApproveProposal({ proposalId: 100, decidedByUserId: 22 }),
    ).rejects.toThrow("apply failed");
    expect(promoteRunnerMock).toHaveBeenCalledTimes(1);
    expect(approveAndApplyMock).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Source-scan
// ────────────────────────────────────────────────────────────────────

describe("T-D.4 slice 3 — source-scan", () => {
  it("combo file imports both halves' entry points", () => {
    const src = read(COMBO_FILE);
    expect(src).toMatch(/runPromoteSemanticEnrichment/);
    expect(src).toMatch(/approveAndApplyProposal/);
  });

  it("combo file declares no new graph mutation imports", () => {
    const src = read(COMBO_FILE);
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
    expect(stripped).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(stripped).not.toMatch(/from\s+["'][^"']*openrouter[^"']*["']/);
    expect(stripped).not.toMatch(/\bdispatchMcpToolCall\s*\(/);
  });

  it("router declares `promoteAndApprove` adminProcedure.mutation", () => {
    const src = read(ROUTER_FILE);
    expect(src).toMatch(
      /promoteAndApprove:\s*adminProcedure[\s\S]*?\.mutation\(/,
    );
    expect(src).toMatch(/promoteAndApproveProposal\s*\(/);
  });

  it("router maps the 4 bridge error classes for promoteAndApprove too", () => {
    const src = read(ROUTER_FILE);
    // Both `promote` and `promoteAndApprove` blocks must contain the
    // same error→code mappings.
    const promoteAndApproveBlock = src.slice(
      src.indexOf("promoteAndApprove:"),
      src.indexOf("promote:"),
    );
    expect(promoteAndApproveBlock).toMatch(/EnrichmentProposalNotFoundError/);
    expect(promoteAndApproveBlock).toMatch(
      /EnrichmentProposalAlreadyPromotedError/,
    );
    expect(promoteAndApproveBlock).toMatch(
      /EnrichmentProposalNotPromotableError/,
    );
    expect(promoteAndApproveBlock).toMatch(/AsdbUnavailableForPromotionError/);
  });

  it("public-api re-exports the combo surface", () => {
    const src = read(BARREL);
    for (const sym of [
      "promoteAndApproveProposal",
      "PromoteAndApproveInput",
      "PromoteAndApproveOptions",
      "PromoteAndApproveResult",
    ]) {
      expect(src, `barrel must re-export ${sym}`).toMatch(
        new RegExp(`\\b${sym}\\b`),
      );
    }
  });
});
