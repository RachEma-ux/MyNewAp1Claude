/**
 * Publish executor — governance gate tests (V1+ Phase 19-γ).
 *
 * Covers:
 *   - GOVERNANCE_DECISIONS closed taxonomy (3 values)
 *   - isGovernanceDecision narrowing
 *   - When no `governanceGate` is supplied, executor proceeds as if
 *     "approved" (backward compat with α/β behavior)
 *   - "rejected" → pusher NOT called; outcome.status="failed",
 *     errorMessage="governance_rejected",
 *     details.governanceDecision="rejected"
 *   - "pending" → pusher NOT called; outcome.status="pending",
 *     details.governanceDecision="pending"
 *   - "approved" → pusher runs (existing in_flight/succeeded path
 *     stays intact)
 *   - source-scan boundary: executor + types stay clean
 *
 * Uses the `targetLoader` DI seam introduced in PR-V1-21 so the
 * tests run in unit-vitest without a live ASDB.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GOVERNANCE_DECISIONS,
  isGovernanceDecision,
  type GovernanceDecision,
  type PublishExecutionOutcome,
  type PublishPusher,
  type PublishTargetRecord,
} from "../../server/agent-studio/services/publish-targets/types.js";
import { executePublish } from "../../server/agent-studio/services/publish-targets/executor.js";
import { __resetRegistryForTests } from "../../server/agent-studio/services/publish-targets/registry.js";

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: () => null,
}));

afterEach(() => {
  __resetRegistryForTests();
});

function fakeTarget(over: Partial<PublishTargetRecord> = {}): PublishTargetRecord {
  return {
    id: 7,
    targetKey: "t1",
    targetType: "staging_env",
    endpoint: "https://staging.example.com/api",
    providerConnectionId: null,
    config: null,
    enabled: true,
    ...over,
  };
}

describe("GOVERNANCE_DECISIONS taxonomy", () => {
  it("is the closed 3-value union (approved/pending/rejected)", () => {
    expect([...GOVERNANCE_DECISIONS]).toEqual([
      "approved",
      "pending",
      "rejected",
    ]);
  });

  it("isGovernanceDecision accepts every member", () => {
    for (const d of GOVERNANCE_DECISIONS) {
      expect(isGovernanceDecision(d)).toBe(true);
    }
  });

  it("isGovernanceDecision rejects non-members", () => {
    expect(isGovernanceDecision("ok")).toBe(false);
    expect(isGovernanceDecision("")).toBe(false);
    expect(isGovernanceDecision(null)).toBe(false);
    expect(isGovernanceDecision(123)).toBe(false);
  });
});

describe("executePublish — governanceGate branches", () => {
  it('"approved" runs the pusher and returns its outcome', async () => {
    const pusher = vi.fn<PublishPusher>(async () => ({
      status: "succeeded",
      upstreamArtifactId: "art-1",
    }));
    const res = await executePublish({
      targetKey: "t1",
      payload: { sourcePromotionId: 10, body: { hi: 1 } },
      targetLoader: async () => fakeTarget(),
      pusherLookup: () => pusher,
      governanceGate: async () => "approved" as GovernanceDecision,
    });
    expect(pusher).toHaveBeenCalledTimes(1);
    expect(res.outcome.status).toBe("succeeded");
    expect(res.outcome.upstreamArtifactId).toBe("art-1");
  });

  it('"rejected" stages outcome.status="failed" with errorMessage="governance_rejected"; pusher NOT called', async () => {
    const pusher = vi.fn<PublishPusher>(async () => ({
      status: "succeeded",
    }));
    const res = await executePublish({
      targetKey: "t1",
      payload: { sourcePromotionId: 10, body: {} },
      targetLoader: async () => fakeTarget(),
      pusherLookup: () => pusher,
      governanceGate: async () => "rejected" as GovernanceDecision,
    });
    expect(pusher).not.toHaveBeenCalled();
    expect(res.outcome.status).toBe("failed");
    expect(res.outcome.errorMessage).toBe("governance_rejected");
    expect(
      (res.outcome.details as { governanceDecision?: string })
        ?.governanceDecision,
    ).toBe("rejected");
  });

  it('"pending" stages outcome.status="pending"; pusher NOT called', async () => {
    const pusher = vi.fn<PublishPusher>(async () => ({
      status: "succeeded",
    }));
    const res = await executePublish({
      targetKey: "t1",
      payload: { sourcePromotionId: 10, body: {} },
      targetLoader: async () => fakeTarget(),
      pusherLookup: () => pusher,
      governanceGate: async () => "pending" as GovernanceDecision,
    });
    expect(pusher).not.toHaveBeenCalled();
    expect(res.outcome.status).toBe("pending");
    expect(
      (res.outcome.details as { governanceDecision?: string })
        ?.governanceDecision,
    ).toBe("pending");
  });

  it("no governanceGate supplied → existing α/β behavior (pusher runs)", async () => {
    const pusher = vi.fn<PublishPusher>(async () => ({
      status: "succeeded",
    }));
    const res = await executePublish({
      targetKey: "t1",
      payload: { sourcePromotionId: 10, body: {} },
      targetLoader: async () => fakeTarget(),
      pusherLookup: () => pusher,
    });
    expect(pusher).toHaveBeenCalledTimes(1);
    expect(res.outcome.status).toBe("succeeded");
  });

  it("governanceGate failure throws out (executor does not silently swallow)", async () => {
    const pusher = vi.fn();
    await expect(
      executePublish({
        targetKey: "t1",
        payload: { sourcePromotionId: 10, body: {} },
        targetLoader: async () => fakeTarget(),
        pusherLookup: () => pusher as unknown as PublishPusher,
        governanceGate: async () => {
          throw new Error("governance evaluator crashed");
        },
      }),
    ).rejects.toThrow(/governance evaluator crashed/);
    expect(pusher).not.toHaveBeenCalled();
  });
});

describe("source-scan boundary — executor + types", () => {
  function read(name: string): string {
    return readFileSync(
      resolve(
        __dirname,
        `../../server/agent-studio/services/publish-targets/${name}`,
      ),
      "utf8",
    );
  }
  function strip(src: string): string {
    return src
      .split("\n")
      .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .join("\n");
  }

  it("executor.ts has no credential-resolver import", () => {
    const code = strip(read("executor.ts"));
    expect(/credential-resolver/.test(code)).toBe(false);
  });

  it("types.ts has no credential-resolver / dispatcher / neo4j-driver / *_API_KEY", () => {
    const code = strip(read("types.ts"));
    expect(/credential-resolver/.test(code)).toBe(false);
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        code,
      ),
    ).toBe(false);
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(code)).toBe(false);
  });

  it("PublishExecutionOutcome.status='pending' alignment with PUBLISH_EXECUTION_STATUSES", () => {
    // The γ slice emits status="pending" on governance-gate "pending".
    // That requires "pending" to be a legal value in the closed
    // taxonomy from Phase 19-α.
    const _outcome: PublishExecutionOutcome = {
      status: "pending",
    };
    expect(_outcome.status).toBe("pending");
  });
});
