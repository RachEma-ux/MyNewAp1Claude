/**
 * composeGovernanceGates — V1+ AS-3 (PR-V1-33).
 *
 * Covers:
 *   - Empty list → "approved"
 *   - All "approved" → "approved"
 *   - Any "rejected" → "rejected" (short-circuits, skips later gates)
 *   - No "rejected" + any "pending" → "pending" (runs ALL gates;
 *     doesn't short-circuit on pending)
 *   - Order is preserved (gates run left-to-right)
 *   - Caller mutation of the input array after composition does NOT
 *     change composed-gate behavior (defensive snapshot)
 *   - Composes cleanly with the AS-1 createApprovalStepsGovernanceGate
 *     and the cross-region wrapper
 *   - Source-scan boundary: pure module, hard-rule clean
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import { composeGovernanceGates } from "../../server/agent-studio/services/publish-targets/compose-governance-gates.js";
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

function constGate(decision: GovernanceDecision): GovernanceGateFn {
  return async () => decision;
}

describe("composeGovernanceGates — pure decision matrix", () => {
  it('empty list returns "approved" (no constraint)', async () => {
    const gate = composeGovernanceGates([]);
    expect(await gate({ target: TARGET, payload: PAYLOAD })).toBe("approved");
  });

  it('all "approved" → "approved"', async () => {
    const gate = composeGovernanceGates([
      constGate("approved"),
      constGate("approved"),
      constGate("approved"),
    ]);
    expect(await gate({ target: TARGET, payload: PAYLOAD })).toBe("approved");
  });

  it('any "rejected" → "rejected"', async () => {
    const gate = composeGovernanceGates([
      constGate("approved"),
      constGate("rejected"),
      constGate("approved"),
    ]);
    expect(await gate({ target: TARGET, payload: PAYLOAD })).toBe("rejected");
  });

  it('no rejected + any "pending" → "pending"', async () => {
    const gate = composeGovernanceGates([
      constGate("approved"),
      constGate("pending"),
      constGate("approved"),
    ]);
    expect(await gate({ target: TARGET, payload: PAYLOAD })).toBe("pending");
  });

  it('"pending" then "rejected" still resolves to "rejected"', async () => {
    const gate = composeGovernanceGates([
      constGate("pending"),
      constGate("rejected"),
    ]);
    expect(await gate({ target: TARGET, payload: PAYLOAD })).toBe("rejected");
  });

  it("single-gate composition behaves as a passthrough", async () => {
    for (const d of ["approved", "pending", "rejected"] as const) {
      const gate = composeGovernanceGates([constGate(d)]);
      expect(await gate({ target: TARGET, payload: PAYLOAD })).toBe(d);
    }
  });
});

describe("composeGovernanceGates — short-circuit semantics", () => {
  it('short-circuits on "rejected" — later gates are NOT invoked', async () => {
    const second = vi.fn<GovernanceGateFn>(async () => "approved");
    const third = vi.fn<GovernanceGateFn>(async () => "approved");
    const gate = composeGovernanceGates([
      constGate("rejected"),
      second,
      third,
    ]);
    const result = await gate({ target: TARGET, payload: PAYLOAD });
    expect(result).toBe("rejected");
    expect(second).not.toHaveBeenCalled();
    expect(third).not.toHaveBeenCalled();
  });

  it('does NOT short-circuit on "pending" — runs all remaining gates', async () => {
    const second = vi.fn<GovernanceGateFn>(async () => "approved");
    const third = vi.fn<GovernanceGateFn>(async () => "approved");
    const gate = composeGovernanceGates([
      constGate("pending"),
      second,
      third,
    ]);
    const result = await gate({ target: TARGET, payload: PAYLOAD });
    expect(result).toBe("pending");
    expect(second).toHaveBeenCalledTimes(1);
    expect(third).toHaveBeenCalledTimes(1);
  });

  it("runs gates left-to-right (preserves input order)", async () => {
    const calls: string[] = [];
    const mk = (label: string, d: GovernanceDecision): GovernanceGateFn =>
      async () => {
        calls.push(label);
        return d;
      };
    const gate = composeGovernanceGates([
      mk("first", "approved"),
      mk("second", "pending"),
      mk("third", "approved"),
    ]);
    await gate({ target: TARGET, payload: PAYLOAD });
    expect(calls).toEqual(["first", "second", "third"]);
  });
});

describe("composeGovernanceGates — defensive snapshot", () => {
  it("caller-mutating the input array after composition does NOT affect the composed gate", async () => {
    const arr: GovernanceGateFn[] = [constGate("approved")];
    const gate = composeGovernanceGates(arr);
    arr.push(constGate("rejected"));
    expect(await gate({ target: TARGET, payload: PAYLOAD })).toBe("approved");
  });

  it("caller-clearing the input array after composition does NOT affect the composed gate", async () => {
    const arr: GovernanceGateFn[] = [
      constGate("approved"),
      constGate("pending"),
    ];
    const gate = composeGovernanceGates(arr);
    arr.length = 0;
    expect(await gate({ target: TARGET, payload: PAYLOAD })).toBe("pending");
  });
});

describe("composeGovernanceGates — public-api re-export", () => {
  it("the publish-targets barrel re-exports composeGovernanceGates", async () => {
    const barrel = await import(
      "../../server/agent-studio/services/publish-targets/index.js"
    );
    expect(typeof barrel.composeGovernanceGates).toBe("function");
  });
});

describe("source-scan boundary", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/compose-governance-gates.ts",
  );
  const src = readFileSync(file, "utf8");

  it("does not import credential-resolver", () => {
    expect(/from\s+["'][^"']*credential-resolver/.test(src)).toBe(false);
  });

  it("does not import dispatchMcpToolCall", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        src,
      ),
    ).toBe(false);
  });

  it("does not read process.env.*_API_KEY", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(src)).toBe(false);
  });

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(src)).toBe(false);
  });

  it("does not import drizzle-orm (pure composer, no DB)", () => {
    expect(/from\s+["']drizzle-orm/.test(src)).toBe(false);
  });
});
