/**
 * Default governance-gate registry + executor fall-through — V1+ AS-2
 * follow-up to PR-V1-25 (AS-1) and PR-V1-22 (Phase 19-γ executor gate).
 *
 * Covers:
 *   - Registry semantics: install / get / has / reset
 *   - Executor fall-through to the default gate when
 *     `input.governanceGate` is omitted
 *   - Per-call `input.governanceGate` wins (default is NOT invoked)
 *   - No default + no per-call → existing α/β behavior
 *     (decision="approved", pusher runs)
 *   - Public-api re-export shape (barrel exports the 4 names)
 *   - Source-scan boundary: default-governance-gate.ts stays clean
 *     (no credential-resolver / dispatcher / *_API_KEY / neo4j-driver)
 *   - Executor file references the default-gate import (so the
 *     fall-through can't silently be dropped in a future refactor)
 *
 * Uses the executor's existing `targetLoader` DI seam (PR-V1-21) +
 * the `vi.mock("../db/connection")` pattern (publish-targets-
 * governance-gate.test.ts) to run unit-style without a live ASDB.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetDefaultGovernanceGateForTests,
  getDefaultGovernanceGate,
  hasDefaultGovernanceGate,
  installDefaultGovernanceGate,
} from "../../server/agent-studio/services/publish-targets/default-governance-gate.js";
import { executePublish } from "../../server/agent-studio/services/publish-targets/executor.js";
import { __resetRegistryForTests } from "../../server/agent-studio/services/publish-targets/registry.js";
import type {
  GovernanceDecision,
  GovernanceGateFn,
  PublishPusher,
  PublishTargetRecord,
} from "../../server/agent-studio/services/publish-targets/types.js";

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: () => null,
}));

afterEach(() => {
  __resetDefaultGovernanceGateForTests();
  __resetRegistryForTests();
});

function fakeTarget(over: Partial<PublishTargetRecord> = {}): PublishTargetRecord {
  return {
    id: 11,
    targetKey: "t-default-gate",
    targetType: "staging_env",
    endpoint: "https://staging.example.com/api",
    providerConnectionId: null,
    config: null,
    enabled: true,
    ...over,
  };
}

describe("default-governance-gate registry", () => {
  it("starts unregistered — get returns null, has=false", () => {
    expect(getDefaultGovernanceGate()).toBeNull();
    expect(hasDefaultGovernanceGate()).toBe(false);
  });

  it("install + get + has — returns the registered gate", () => {
    const gate: GovernanceGateFn = vi.fn<GovernanceGateFn>(async () => "approved");
    installDefaultGovernanceGate(gate);
    expect(getDefaultGovernanceGate()).toBe(gate);
    expect(hasDefaultGovernanceGate()).toBe(true);
  });

  it("re-install overwrites prior gate (idempotent)", () => {
    const a: GovernanceGateFn = vi.fn<GovernanceGateFn>(async () => "approved");
    const b: GovernanceGateFn = vi.fn<GovernanceGateFn>(async () => "rejected");
    installDefaultGovernanceGate(a);
    installDefaultGovernanceGate(b);
    expect(getDefaultGovernanceGate()).toBe(b);
  });

  it("__reset clears the registered gate", () => {
    installDefaultGovernanceGate(vi.fn<GovernanceGateFn>(async () => "approved"));
    __resetDefaultGovernanceGateForTests();
    expect(getDefaultGovernanceGate()).toBeNull();
    expect(hasDefaultGovernanceGate()).toBe(false);
  });
});

describe("executePublish — default gate fall-through", () => {
  it("falls through to the default gate when input.governanceGate is omitted", async () => {
    const defaultGate = vi.fn<GovernanceGateFn>(async () => "rejected");
    installDefaultGovernanceGate(defaultGate);
    const pusher = vi.fn<PublishPusher>(async () => ({ status: "succeeded" }));

    const res = await executePublish({
      targetKey: "t-default-gate",
      payload: { sourcePromotionId: 42, body: { x: 1 } },
      targetLoader: async () => fakeTarget(),
      pusherLookup: () => pusher,
    });

    expect(defaultGate).toHaveBeenCalledTimes(1);
    expect(pusher).not.toHaveBeenCalled();
    expect(res.outcome.status).toBe("failed");
    expect(res.outcome.errorMessage).toBe("governance_rejected");
    expect(res.outcome.details).toEqual({ governanceDecision: "rejected" });
  });

  it("per-call governanceGate wins — default is NOT invoked", async () => {
    const defaultGate = vi.fn<GovernanceGateFn>(async () => "rejected");
    const perCallGate = vi.fn<GovernanceGateFn>(async () => "approved");
    installDefaultGovernanceGate(defaultGate);
    const pusher = vi.fn<PublishPusher>(async () => ({ status: "succeeded" }));

    const res = await executePublish({
      targetKey: "t-default-gate",
      payload: { sourcePromotionId: 42, body: {} },
      governanceGate: perCallGate,
      targetLoader: async () => fakeTarget(),
      pusherLookup: () => pusher,
    });

    expect(perCallGate).toHaveBeenCalledTimes(1);
    expect(defaultGate).not.toHaveBeenCalled();
    expect(pusher).toHaveBeenCalledTimes(1);
    expect(res.outcome.status).toBe("succeeded");
  });

  it("no default + no per-call → existing approved-by-default behavior", async () => {
    const pusher = vi.fn<PublishPusher>(async () => ({ status: "succeeded" }));
    const res = await executePublish({
      targetKey: "t-default-gate",
      payload: { sourcePromotionId: 42, body: {} },
      targetLoader: async () => fakeTarget(),
      pusherLookup: () => pusher,
    });
    expect(pusher).toHaveBeenCalledTimes(1);
    expect(res.outcome.status).toBe("succeeded");
  });

  it('default gate "pending" → pusher NOT called; outcome.status="pending"', async () => {
    installDefaultGovernanceGate(async () => "pending");
    const pusher = vi.fn<PublishPusher>(async () => ({ status: "succeeded" }));

    const res = await executePublish({
      targetKey: "t-default-gate",
      payload: { sourcePromotionId: 99, body: {} },
      targetLoader: async () => fakeTarget(),
      pusherLookup: () => pusher,
    });

    expect(pusher).not.toHaveBeenCalled();
    expect(res.outcome.status).toBe("pending");
    expect(res.outcome.details).toEqual({ governanceDecision: "pending" });
  });

  it('default gate "approved" → pusher runs', async () => {
    installDefaultGovernanceGate(async () => "approved");
    const pusher = vi.fn<PublishPusher>(async () => ({
      status: "succeeded",
      upstreamArtifactId: "art-AS2",
    }));

    const res = await executePublish({
      targetKey: "t-default-gate",
      payload: { sourcePromotionId: 7, body: {} },
      targetLoader: async () => fakeTarget(),
      pusherLookup: () => pusher,
    });

    expect(pusher).toHaveBeenCalledTimes(1);
    expect(res.outcome.status).toBe("succeeded");
    expect(res.outcome.upstreamArtifactId).toBe("art-AS2");
  });
});

describe("public-api re-exports", () => {
  it("the publish-targets barrel re-exports the 4 default-gate names", async () => {
    const barrel = await import(
      "../../server/agent-studio/services/publish-targets/index.js"
    );
    expect(typeof barrel.installDefaultGovernanceGate).toBe("function");
    expect(typeof barrel.getDefaultGovernanceGate).toBe("function");
    expect(typeof barrel.hasDefaultGovernanceGate).toBe("function");
    expect(typeof barrel.__resetDefaultGovernanceGateForTests).toBe("function");
  });
});

describe("source-scan boundary", () => {
  const moduleFile = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/default-governance-gate.ts",
  );
  const executorFile = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/executor.ts",
  );
  const moduleSrc = readFileSync(moduleFile, "utf8");
  const executorSrc = readFileSync(executorFile, "utf8");

  it("default-governance-gate.ts does not import credential-resolver", () => {
    expect(
      /from\s+["'][^"']*credential-resolver/.test(moduleSrc),
    ).toBe(false);
  });

  it("default-governance-gate.ts does not import dispatchMcpToolCall", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        moduleSrc,
      ),
    ).toBe(false);
  });

  it("default-governance-gate.ts does not read process.env.*_API_KEY", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(moduleSrc)).toBe(false);
  });

  it("default-governance-gate.ts does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(moduleSrc)).toBe(false);
  });

  it("executor imports getDefaultGovernanceGate (fall-through can't silently drop)", () => {
    expect(/getDefaultGovernanceGate/.test(executorSrc)).toBe(true);
    expect(
      /from\s+["'].\/default-governance-gate(\.js)?["']/.test(executorSrc),
    ).toBe(true);
  });

  it("executor falls through via the ?? operator (per-call wins)", () => {
    expect(
      /input\.governanceGate\s*\?\?\s*getDefaultGovernanceGate\s*\(\s*\)/.test(
        executorSrc,
      ),
    ).toBe(true);
  });
});
