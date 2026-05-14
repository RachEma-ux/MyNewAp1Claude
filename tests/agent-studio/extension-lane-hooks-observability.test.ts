/**
 * V1+ 18-γ observability-only lane hooks (PR-V1-81).
 *
 * First concrete implementation of the typed contract surface
 * pinned in #793. Verifies:
 *   - Each per-lane hook returns `{ succeeded: true }` with no
 *     supplemental data fields (zero pipeline impact).
 *   - The log sink emits one structured line per invocation with
 *     the documented field set (lane / extension id /
 *     extensionKey / workspaceId / toolName).
 *   - Log-call throw is swallowed (never propagates to the wrapper).
 *   - `installObservabilityLaneHooks` registers all 3 contracted
 *     lanes in declaration order and returns the install summary.
 *   - The factory does not pull forbidden imports.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import {
  createObservabilityLaneHooks,
  installObservabilityLaneHooks,
  type ObservabilityLaneHookLog,
} from "../../server/agent-studio/services/extensions/lane-hooks-observability.js";

import type {
  ExtensionCapabilityLane,
  ExtensionRecord,
  InvokeFromExtensionInput,
} from "../../server/agent-studio/services/extensions/contracts.js";

function fixtureExtension(over: Partial<ExtensionRecord> = {}): ExtensionRecord {
  return {
    id: 42,
    workspaceId: 100,
    extensionKey: "@example/observability",
    name: "Example Extension",
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

function fixtureInput(over: Partial<InvokeFromExtensionInput> = {}): InvokeFromExtensionInput {
  return {
    extensionId: 42,
    lane: "retrieve",
    payload: {},
    ...over,
  };
}

describe("createObservabilityLaneHooks — zero-contribution outcome", () => {
  it("retrieve hook returns { succeeded: true } with NO supplemental fields", async () => {
    const hooks = createObservabilityLaneHooks({ log: () => {} });
    const out = await hooks.retrieve({
      extension: fixtureExtension(),
      input: fixtureInput({ lane: "retrieve" }),
    });
    expect(out).toEqual({ succeeded: true });
  });

  it("assemble hook returns { succeeded: true } with NO supplemental fields", async () => {
    const hooks = createObservabilityLaneHooks({ log: () => {} });
    const out = await hooks.assemble({
      extension: fixtureExtension(),
      input: fixtureInput({ lane: "assemble" }),
    });
    expect(out).toEqual({ succeeded: true });
  });

  it("compose hook returns { succeeded: true } with NO supplemental fields", async () => {
    const hooks = createObservabilityLaneHooks({ log: () => {} });
    const out = await hooks.compose({
      extension: fixtureExtension(),
      input: fixtureInput({ lane: "compose" }),
    });
    expect(out).toEqual({ succeeded: true });
  });
});

describe("createObservabilityLaneHooks — log sink", () => {
  it("emits one structured line with lane + extension id + extensionKey + workspaceId + toolName", async () => {
    const lines: string[] = [];
    const log: ObservabilityLaneHookLog = (line) => lines.push(line);
    const hooks = createObservabilityLaneHooks({ log });
    await hooks.retrieve({
      extension: fixtureExtension({
        id: 7,
        extensionKey: "@vendor/x",
        workspaceId: 200,
      }),
      input: fixtureInput({ lane: "retrieve", toolName: "search" }),
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/lane=retrieve/);
    expect(lines[0]).toMatch(/extension=#7/);
    expect(lines[0]).toMatch(/extensionKey=@vendor\/x/);
    expect(lines[0]).toMatch(/workspaceId=200/);
    expect(lines[0]).toMatch(/toolName=search/);
  });

  it("renders toolName='(none)' when input does not provide one", async () => {
    const lines: string[] = [];
    const log: ObservabilityLaneHookLog = (line) => lines.push(line);
    const hooks = createObservabilityLaneHooks({ log });
    await hooks.assemble({
      extension: fixtureExtension(),
      input: fixtureInput({ lane: "assemble" }),
    });
    expect(lines[0]).toMatch(/toolName=\(none\)/);
  });

  it("a throwing log sink is swallowed (never propagates to the hook outcome)", async () => {
    const throwingLog: ObservabilityLaneHookLog = () => {
      throw new Error("log-blew-up");
    };
    const hooks = createObservabilityLaneHooks({ log: throwingLog });
    // Should resolve cleanly with succeeded: true despite the log throw.
    await expect(
      hooks.retrieve({
        extension: fixtureExtension(),
        input: fixtureInput({ lane: "retrieve" }),
      }),
    ).resolves.toEqual({ succeeded: true });
  });

  it("defaults to console.log when no log option supplied", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const hooks = createObservabilityLaneHooks();
      await hooks.compose({
        extension: fixtureExtension(),
        input: fixtureInput({ lane: "compose" }),
      });
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls[0]?.[0]).toMatch(/lane=compose/);
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("installObservabilityLaneHooks — registry installation", () => {
  it("registers all 3 contracted lanes in declaration order", () => {
    const calls: ExtensionCapabilityLane[] = [];
    const register = (lane: ExtensionCapabilityLane) => {
      calls.push(lane);
    };
    const result = installObservabilityLaneHooks({
      register,
      log: () => {},
    });
    expect(result.installedLanes).toEqual(["retrieve", "assemble", "compose"]);
    expect(calls).toEqual(["retrieve", "assemble", "compose"]);
  });

  it("each registered hook produces a contract-conforming outcome", async () => {
    const installed = new Map<ExtensionCapabilityLane, unknown>();
    const register = (lane: ExtensionCapabilityLane, fn: unknown) => {
      installed.set(lane, fn);
    };
    installObservabilityLaneHooks({ register, log: () => {} });

    for (const lane of ["retrieve", "assemble", "compose"] as const) {
      const fn = installed.get(lane) as (
        params: { extension: ExtensionRecord; input: InvokeFromExtensionInput },
      ) => Promise<{ succeeded: boolean }>;
      const out = await fn({
        extension: fixtureExtension(),
        input: fixtureInput({ lane }),
      });
      expect(out.succeeded).toBe(true);
    }
  });
});

describe("source-scan boundaries — hard-rule compliance", () => {
  const src = readFileSync(
    resolve(
      __dirname,
      "../../server/agent-studio/services/extensions/lane-hooks-observability.ts",
    ),
    "utf8",
  );

  function stripComments(s: string): string {
    return s
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
      .join("\n");
  }

  const stripped = stripComments(src);

  it("no credential-resolver / *_API_KEY / dispatchMcpToolCall / neo4j-driver / openrouter / GraphRepository imports", () => {
    const FORBIDDEN = [
      /from\s+["'][^"']*credential-resolver/,
      /from\s+["'][^"']*dispatchMcpToolCall/,
      /process\.env\.[A-Z0-9_]*_API_KEY\b/,
      /from\s+["']neo4j-driver/,
      /from\s+["'][^"']*openrouter/,
      /\bGraphRepository\b/,
    ];
    for (const pattern of FORBIDDEN) {
      expect(pattern.test(stripped)).toBe(false);
    }
  });

  it("type-only imports of contracts.ts (ExtensionRecord / InvokeFromExtensionInput)", () => {
    expect(
      /import\s+type\s*\{[^}]*ExtensionRecord[^}]*\}\s+from\s+["']\.\/contracts/.test(
        stripped,
      ),
    ).toBe(true);
  });
});
