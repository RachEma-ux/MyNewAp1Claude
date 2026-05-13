/**
 * agsApprovalSteps governance gate adapter — V1+ integration slice.
 *
 * Covers:
 *   - decideGovernanceFromApprovalSteps pure rule matrix (closed
 *     taxonomy: approved / pending / rejected)
 *   - createApprovalStepsGovernanceGate factory composition with
 *     the listApprovalSteps DI seam (no ASDB needed)
 *   - null publishRequestId fallback ("pending")
 *   - resolvePublishRequestId is invoked once per call
 *   - source-scan boundary: no credential-resolver / dispatcher /
 *     *_API_KEY / neo4j-driver
 *   - emits one of the closed 3-value GovernanceDecision union
 *   - getDb=null fallback (ASDB unavailable → defensive "pending")
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import {
  createApprovalStepsGovernanceGate,
  decideGovernanceFromApprovalSteps,
  type ApprovalStepSnapshot,
} from "../../server/agent-studio/services/publish-targets/governance-gate-approval-steps.js";
import type {
  GovernanceDecision,
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

describe("decideGovernanceFromApprovalSteps — pure rule matrix", () => {
  it('returns "pending" for an empty step list', () => {
    expect(decideGovernanceFromApprovalSteps([])).toBe("pending");
  });

  it('returns "approved" when every step is approved (≥ 1 step)', () => {
    const steps: ApprovalStepSnapshot[] = [
      { state: "approved" },
      { state: "approved" },
    ];
    expect(decideGovernanceFromApprovalSteps(steps)).toBe("approved");
  });

  it('returns "rejected" when ANY step is rejected (highest priority)', () => {
    const steps: ApprovalStepSnapshot[] = [
      { state: "approved" },
      { state: "rejected" },
      { state: "pending" },
    ];
    expect(decideGovernanceFromApprovalSteps(steps)).toBe("rejected");
  });

  it('rejected wins over a single approved row', () => {
    expect(
      decideGovernanceFromApprovalSteps([{ state: "rejected" }]),
    ).toBe("rejected");
  });

  it('returns "pending" when any step is non-terminal (pending / unknown)', () => {
    expect(
      decideGovernanceFromApprovalSteps([
        { state: "approved" },
        { state: "pending" },
      ]),
    ).toBe("pending");
  });

  it('returns "pending" for unrecognized state strings (defensive)', () => {
    expect(
      decideGovernanceFromApprovalSteps([{ state: "weird_state" }]),
    ).toBe("pending");
  });

  it('does not short-circuit on the first approved — scans for rejected', () => {
    expect(
      decideGovernanceFromApprovalSteps([
        { state: "approved" },
        { state: "approved" },
        { state: "rejected" },
      ]),
    ).toBe("rejected");
  });
});

describe("createApprovalStepsGovernanceGate — factory composition", () => {
  it('null publishRequestId → "pending"; listApprovalSteps NOT called', async () => {
    const list = vi.fn();
    const resolve = vi.fn(async () => null);
    const gate = createApprovalStepsGovernanceGate({
      resolvePublishRequestId: resolve,
      listApprovalSteps: list,
    });
    const decision = await gate({ target: TARGET, payload: PAYLOAD });
    expect(decision).toBe("pending");
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(list).not.toHaveBeenCalled();
  });

  it('resolved id → invokes listApprovalSteps once and applies pure rule', async () => {
    const list = vi.fn(
      async (): Promise<ApprovalStepSnapshot[]> => [{ state: "approved" }],
    );
    const gate = createApprovalStepsGovernanceGate({
      resolvePublishRequestId: async () => 42,
      listApprovalSteps: list,
    });
    const decision = await gate({ target: TARGET, payload: PAYLOAD });
    expect(decision).toBe("approved");
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(42);
  });

  it("passes the resolved publishRequestId verbatim to listApprovalSteps", async () => {
    let seen: number | null = null;
    const gate = createApprovalStepsGovernanceGate({
      resolvePublishRequestId: async () => 7,
      listApprovalSteps: async (id) => {
        seen = id;
        return [];
      },
    });
    await gate({ target: TARGET, payload: PAYLOAD });
    expect(seen).toBe(7);
  });

  it('rejected mix yields "rejected" through the factory', async () => {
    const gate = createApprovalStepsGovernanceGate({
      resolvePublishRequestId: async () => 1,
      listApprovalSteps: async () => [
        { state: "approved" },
        { state: "rejected" },
      ],
    });
    expect(await gate({ target: TARGET, payload: PAYLOAD })).toBe("rejected");
  });

  it('pending step yields "pending" through the factory', async () => {
    const gate = createApprovalStepsGovernanceGate({
      resolvePublishRequestId: async () => 1,
      listApprovalSteps: async () => [
        { state: "approved" },
        { state: "pending" },
      ],
    });
    expect(await gate({ target: TARGET, payload: PAYLOAD })).toBe("pending");
  });

  it("propagates resolver errors (no silent swallow)", async () => {
    const gate = createApprovalStepsGovernanceGate({
      resolvePublishRequestId: async () => {
        throw new Error("publish request lookup failed");
      },
      listApprovalSteps: async () => [],
    });
    await expect(
      gate({ target: TARGET, payload: PAYLOAD }),
    ).rejects.toThrow(/publish request lookup failed/);
  });

  it("propagates list errors (no silent swallow)", async () => {
    const gate = createApprovalStepsGovernanceGate({
      resolvePublishRequestId: async () => 1,
      listApprovalSteps: async () => {
        throw new Error("approval-steps query failed");
      },
    });
    await expect(
      gate({ target: TARGET, payload: PAYLOAD }),
    ).rejects.toThrow(/approval-steps query failed/);
  });

  it('getDb returning null → defensive "pending" (never silent approve)', async () => {
    const gate = createApprovalStepsGovernanceGate({
      resolvePublishRequestId: async () => 99,
      getDb: () => null as unknown as ReturnType<typeof import("../../server/agent-studio/db/connection.js").getAsDb>,
    });
    const decision = await gate({ target: TARGET, payload: PAYLOAD });
    expect(decision).toBe("pending");
  });

  it("invocation passes target + payload through to the resolver", async () => {
    const resolver = vi.fn(async () => null);
    const gate = createApprovalStepsGovernanceGate({
      resolvePublishRequestId: resolver,
    });
    await gate({ target: TARGET, payload: PAYLOAD });
    expect(resolver).toHaveBeenCalledWith({
      target: TARGET,
      payload: PAYLOAD,
    });
  });
});

describe("source-scan boundary — governance-gate-approval-steps.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/governance-gate-approval-steps.ts",
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

  it("does NOT issue any write to agsApprovalSteps (read-only adapter)", () => {
    expect(/\.insert\s*\(\s*agsApprovalSteps\s*\)/.test(code)).toBe(false);
    expect(/\.update\s*\(\s*agsApprovalSteps\s*\)/.test(code)).toBe(false);
    expect(/\.delete\s*\(\s*agsApprovalSteps\s*\)/.test(code)).toBe(false);
  });
});

describe("integration with the 19-γ governance taxonomy", () => {
  it("emits one of the closed 3-value GovernanceDecision union", async () => {
    const gate = createApprovalStepsGovernanceGate({
      resolvePublishRequestId: async () => 1,
      listApprovalSteps: async () => [{ state: "approved" }],
    });
    const decision: GovernanceDecision = await gate({
      target: TARGET,
      payload: PAYLOAD,
    });
    expect(["approved", "pending", "rejected"]).toContain(decision);
  });
});
