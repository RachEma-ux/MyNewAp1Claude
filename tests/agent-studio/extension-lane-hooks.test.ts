/**
 * Extension lane hook registry + integration tests
 * (V1+ Phase 18-β).
 *
 * Covers:
 *   - registerLaneHook / getLaneHook round-trip
 *   - re-registration replaces prior hook (idempotent)
 *   - lane="tool" registration throws (dispatcher-only invariant)
 *   - listRegisteredLaneHookLanes reflects state
 *   - __resetExtensionLaneHooksForTests clears
 *   - invokeFromExtension calls the registered hook for non-tool lane
 *   - hook outcome is ledgered + surfaced via laneHookOutcome
 *   - thrown hook is captured as { succeeded: false, errorMessage }
 *   - α fall-through preserved: no hook registered → wrapper still
 *     ledgers + returns the original shape
 *   - source-scan boundary: lane-hooks.ts does NOT import
 *     dispatchMcpToolCall (kept scoped to runtime.ts).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetExtensionLaneHooksForTests,
  getLaneHook,
  listRegisteredLaneHookLanes,
  registerLaneHook,
  type LaneHookFn,
} from "../../server/agent-studio/services/extensions/lane-hooks.js";
import type {
  ExtensionRecord,
} from "../../server/agent-studio/services/extensions/contracts.js";
import { invokeFromExtension } from "../../server/agent-studio/services/extensions/runtime.js";

beforeEach(() => {
  __resetExtensionLaneHooksForTests();
});

afterEach(() => {
  __resetExtensionLaneHooksForTests();
});

function makeExtension(over: Partial<ExtensionRecord> = {}): ExtensionRecord {
  return {
    id: 1,
    workspaceId: 1,
    extensionKey: "ext-test",
    name: "Test Extension",
    version: "1.0.0",
    signingKeyId: null,
    governanceStatus: "approved",
    capabilityLanes: ["retrieve", "assemble", "compose"],
    declaredToolNames: [],
    config: null,
    installedAt: new Date(),
    approvedAt: new Date(),
    disabledAt: null,
    ...over,
  };
}

describe("registerLaneHook / getLaneHook", () => {
  it("registers + retrieves a hook for a non-tool lane", () => {
    const fn: LaneHookFn = async () => ({ succeeded: true });
    registerLaneHook("retrieve", fn);
    expect(getLaneHook("retrieve")).toBe(fn);
  });

  it("re-registration replaces prior hook", () => {
    const a: LaneHookFn = async () => ({ succeeded: true });
    const b: LaneHookFn = async () => ({ succeeded: false });
    registerLaneHook("assemble", a);
    registerLaneHook("assemble", b);
    expect(getLaneHook("assemble")).toBe(b);
  });

  it('registering lane="tool" throws', () => {
    expect(() =>
      registerLaneHook("tool" as never, async () => ({ succeeded: true })),
    ).toThrow(/Lane="tool" is not registerable/);
  });

  it("listRegisteredLaneHookLanes reflects the registry", () => {
    expect(listRegisteredLaneHookLanes()).toEqual([]);
    registerLaneHook("retrieve", async () => ({ succeeded: true }));
    registerLaneHook("compose", async () => ({ succeeded: true }));
    expect(listRegisteredLaneHookLanes().sort()).toEqual([
      "compose",
      "retrieve",
    ]);
  });

  it("__resetExtensionLaneHooksForTests clears registrations", () => {
    registerLaneHook("retrieve", async () => ({ succeeded: true }));
    expect(listRegisteredLaneHookLanes()).toEqual(["retrieve"]);
    __resetExtensionLaneHooksForTests();
    expect(listRegisteredLaneHookLanes()).toEqual([]);
  });
});

describe("invokeFromExtension — lane-hook integration", () => {
  const ext = makeExtension();

  it("calls registered hook for retrieve lane; surfaces laneHookOutcome", async () => {
    const hookSpy = vi.fn(async () => ({
      succeeded: true,
      details: { sourceCandidates: ["a", "b"] },
    }));
    const outcome = await invokeFromExtension(
      { extensionId: 1, lane: "retrieve" },
      {
        loadExtension: async () => ext,
        getDb: () => null as unknown as never,
        resolveLaneHook: (lane) =>
          lane === "retrieve" ? hookSpy : undefined,
      },
    );
    expect(hookSpy).toHaveBeenCalledTimes(1);
    expect(outcome.capability.check).toBe("allowed");
    expect(outcome.dispatched).toBe(false);
    expect(outcome.laneHookOutcome?.succeeded).toBe(true);
    expect(outcome.laneHookOutcome?.details).toEqual({
      sourceCandidates: ["a", "b"],
    });
  });

  it("captures hook throw as { succeeded: false, errorMessage }", async () => {
    const hookSpy = vi.fn(async () => {
      throw new Error("retrieve plugin crashed");
    });
    const outcome = await invokeFromExtension(
      { extensionId: 1, lane: "retrieve" },
      {
        loadExtension: async () => ext,
        getDb: () => null as unknown as never,
        resolveLaneHook: () => hookSpy,
      },
    );
    expect(outcome.laneHookOutcome?.succeeded).toBe(false);
    expect(outcome.laneHookOutcome?.errorMessage).toMatch(/plugin crashed/);
  });

  it("α fall-through when no hook is registered (assert + ledger)", async () => {
    const outcome = await invokeFromExtension(
      { extensionId: 1, lane: "compose" },
      {
        loadExtension: async () => ext,
        getDb: () => null as unknown as never,
        resolveLaneHook: () => undefined,
      },
    );
    expect(outcome.capability.check).toBe("allowed");
    expect(outcome.laneHookOutcome).toBeUndefined();
    expect(outcome.dispatched).toBe(false);
  });

  it("hook is NOT called when capability check fails", async () => {
    const hookSpy = vi.fn();
    const extWithoutLane = makeExtension({ capabilityLanes: ["tool"] });
    const outcome = await invokeFromExtension(
      { extensionId: 1, lane: "retrieve" },
      {
        loadExtension: async () => extWithoutLane,
        getDb: () => null as unknown as never,
        resolveLaneHook: () => hookSpy as unknown as never,
      },
    );
    expect(hookSpy).not.toHaveBeenCalled();
    expect(outcome.capability.check).not.toBe("allowed");
    expect(outcome.laneHookOutcome).toBeUndefined();
  });
});

describe("source-scan boundary — lane-hooks.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/lane-hooks.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .split("\n")
    .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
    .join("\n");

  it("does NOT import dispatchMcpToolCall (kept scoped to runtime.ts)", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        code,
      ),
    ).toBe(false);
  });

  it("does not import credential-resolver", () => {
    expect(/credential-resolver/.test(code)).toBe(false);
  });

  it("does not read process.env.*_API_KEY raw", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(code)).toBe(false);
  });

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });
});
