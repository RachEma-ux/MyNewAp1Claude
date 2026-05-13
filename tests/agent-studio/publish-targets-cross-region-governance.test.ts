/**
 * Cross-region publish governance tests — V1+ integration slice.
 *
 * Multi-region acceptance criterion #5: "Governance — cross-region
 * promotion / publish requires explicit governance step."
 *
 * Covers:
 *   - requiresCrossRegionGovernance pure predicate matrix
 *   - wrapWithCrossRegionGovernance composes the base gate
 *   - same-region passes through to the base gate's decision
 *   - cross-region downgrades to "pending" by default
 *   - downgrade="rejected" mode blocks the publish outright
 *   - null on either side is treated as same-region (no extra gate)
 *   - source-scan boundary: no credential-resolver / dispatcher /
 *     *_API_KEY / neo4j-driver
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import {
  requiresCrossRegionGovernance,
  wrapWithCrossRegionGovernance,
} from "../../server/agent-studio/services/publish-targets/cross-region-governance.js";
import type {
  GovernanceDecision,
  GovernanceGateFn,
  PublishPayload,
  PublishTargetRecord,
} from "../../server/agent-studio/services/publish-targets/types.js";

const TARGET: PublishTargetRecord = {
  id: 1,
  targetKey: "t",
  targetType: "staging_env",
  endpoint: "https://staging.example.com",
  providerConnectionId: null,
  config: null,
  enabled: true,
};

const PAYLOAD: PublishPayload = {
  sourcePromotionId: 10,
  body: {},
};

describe("requiresCrossRegionGovernance — predicate matrix", () => {
  it("returns false when both regions match", () => {
    expect(
      requiresCrossRegionGovernance({
        sourceRegionKey: "us-east",
        targetRegionKey: "us-east",
      }),
    ).toBe(false);
  });

  it("returns true when regions differ and both are known", () => {
    expect(
      requiresCrossRegionGovernance({
        sourceRegionKey: "us-east",
        targetRegionKey: "eu-west",
      }),
    ).toBe(true);
  });

  it("returns false when source region is null (no pin → same-region)", () => {
    expect(
      requiresCrossRegionGovernance({
        sourceRegionKey: null,
        targetRegionKey: "us-east",
      }),
    ).toBe(false);
  });

  it("returns false when target region is null (defensive same-region)", () => {
    expect(
      requiresCrossRegionGovernance({
        sourceRegionKey: "us-east",
        targetRegionKey: null,
      }),
    ).toBe(false);
  });

  it("returns false when both regions are null", () => {
    expect(
      requiresCrossRegionGovernance({
        sourceRegionKey: null,
        targetRegionKey: null,
      }),
    ).toBe(false);
  });
});

describe("wrapWithCrossRegionGovernance — composition with base gate", () => {
  it("same-region passes through to the base gate's decision", async () => {
    const baseGate: GovernanceGateFn = vi.fn(async () => "approved");
    const composed = wrapWithCrossRegionGovernance(baseGate, {
      getSourceRegionKey: async () => "us-east",
      getTargetRegionKey: async () => "us-east",
    });
    const decision = await composed({ target: TARGET, payload: PAYLOAD });
    expect(decision).toBe("approved");
    expect(baseGate).toHaveBeenCalledTimes(1);
  });

  it('cross-region downgrades to "pending" by default; base gate NOT called', async () => {
    const baseGate: GovernanceGateFn = vi.fn(async () => "approved");
    const composed = wrapWithCrossRegionGovernance(baseGate, {
      getSourceRegionKey: async () => "us-east",
      getTargetRegionKey: async () => "eu-west",
    });
    const decision = await composed({ target: TARGET, payload: PAYLOAD });
    expect(decision).toBe("pending");
    expect(baseGate).not.toHaveBeenCalled();
  });

  it('downgrade="rejected" mode blocks the publish outright', async () => {
    const baseGate: GovernanceGateFn = vi.fn(async () => "approved");
    const composed = wrapWithCrossRegionGovernance(baseGate, {
      getSourceRegionKey: async () => "us-east",
      getTargetRegionKey: async () => "eu-west",
      downgrade: "rejected",
    });
    const decision = await composed({ target: TARGET, payload: PAYLOAD });
    expect(decision).toBe("rejected");
    expect(baseGate).not.toHaveBeenCalled();
  });

  it("base gate returning 'rejected' on same-region wins", async () => {
    const baseGate: GovernanceGateFn = vi.fn(async () => "rejected");
    const composed = wrapWithCrossRegionGovernance(baseGate, {
      getSourceRegionKey: async () => "us-east",
      getTargetRegionKey: async () => "us-east",
    });
    const decision = await composed({ target: TARGET, payload: PAYLOAD });
    expect(decision).toBe("rejected");
  });

  it("null source region → no extra gate; base gate decides", async () => {
    const baseGate: GovernanceGateFn = vi.fn(async () => "approved");
    const composed = wrapWithCrossRegionGovernance(baseGate, {
      getSourceRegionKey: async () => null,
      getTargetRegionKey: async () => "eu-west",
    });
    const decision = await composed({ target: TARGET, payload: PAYLOAD });
    expect(decision).toBe("approved");
    expect(baseGate).toHaveBeenCalledTimes(1);
  });

  it("propagates resolver errors (no silent swallow)", async () => {
    const baseGate: GovernanceGateFn = vi.fn();
    const composed = wrapWithCrossRegionGovernance(baseGate, {
      getSourceRegionKey: async () => {
        throw new Error("region service unavailable");
      },
      getTargetRegionKey: async () => "eu-west",
    });
    await expect(
      composed({ target: TARGET, payload: PAYLOAD }),
    ).rejects.toThrow(/region service unavailable/);
    expect(baseGate).not.toHaveBeenCalled();
  });
});

describe("source-scan boundary — cross-region-governance.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/cross-region-governance.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .split("\n")
    .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
    .join("\n");

  it("does not import credential-resolver", () => {
    expect(/credential-resolver/.test(code)).toBe(false);
  });

  it("does not import the MCP dispatcher", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        code,
      ),
    ).toBe(false);
  });

  it("does not read process.env.*_API_KEY raw", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(code)).toBe(false);
  });

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });
});

describe("integration with the 19-γ governance gate", () => {
  it("end-to-end: cross-region detection produces a `GovernanceDecision`", async () => {
    // Sanity check that the composed gate returns one of the
    // closed taxonomy's three values regardless of input shape.
    const baseGate: GovernanceGateFn = async () => "approved";
    const composed = wrapWithCrossRegionGovernance(baseGate, {
      getSourceRegionKey: async () => "us-east",
      getTargetRegionKey: async () => "eu-west",
    });
    const decision: GovernanceDecision = await composed({
      target: TARGET,
      payload: PAYLOAD,
    });
    expect(["approved", "pending", "rejected"]).toContain(decision);
  });
});
