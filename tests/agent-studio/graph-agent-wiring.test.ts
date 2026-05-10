/**
 * Phase 13 — Graph Agent Lite wiring tests.
 *
 * Verifies that the wiring file (the boundary surface where the engine meets
 * the real OpenRouter / MCP / runtime-trace systems) imports the correct
 * canonical modules and exposes adapter classes conforming to the engine's
 * adapter interfaces.
 *
 * Pure source-scan + interface conformance — no DB / network.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  OpenRouterModelAccessAdapter,
  McpDispatcherAdapter,
  RuntimeTraceWriterAdapter,
} from "../../server/agent-studio/services/graph-agent/wiring.js";

const WIRING_PATH = join(
  process.cwd(),
  "server/agent-studio/services/graph-agent/wiring.ts",
);
const WIRING_SRC = readFileSync(WIRING_PATH, "utf8");

describe("Graph Agent Lite wiring — boundary imports", () => {
  it("imports `execute` from server/openrouter/model-access (no direct provider SDK)", () => {
    expect(WIRING_SRC).toMatch(/from\s+["'][.\/]*openrouter\/model-access\/execute/);
  });

  it("imports `dispatchMcpToolCall` from the existing MCP dispatcher", () => {
    expect(WIRING_SRC).toMatch(/dispatchMcpToolCall/);
    expect(WIRING_SRC).toMatch(/from\s+["'][.\/]*mcp\/dispatcher/);
  });

  it("does NOT import provider SDKs directly", () => {
    expect(WIRING_SRC).not.toMatch(/from\s+["']@anthropic-ai\/sdk["']/);
    expect(WIRING_SRC).not.toMatch(/from\s+["']openai["']/);
    expect(WIRING_SRC).not.toMatch(/from\s+["']@google\/generative-ai["']/);
  });

  it("does NOT import `neo4j-driver`", () => {
    expect(WIRING_SRC).not.toMatch(/from\s+["']neo4j-driver["']/);
  });

  it("exposes wireGraphAgentLite factory", () => {
    expect(WIRING_SRC).toMatch(/export\s+function\s+wireGraphAgentLite/);
  });
});

describe("Graph Agent Lite wiring — adapter conformance", () => {
  it("OpenRouterModelAccessAdapter is constructible", () => {
    const a = new OpenRouterModelAccessAdapter({
      providerConnectionId: 1,
      modelRef: "anthropic/claude-3-5-haiku-20250101",
      workspaceId: 1,
      actorId: 1,
    });
    expect(typeof a.execute).toBe("function");
  });

  it("McpDispatcherAdapter is constructible", () => {
    const a = new McpDispatcherAdapter({
      workspaceId: 1,
      actorUserId: 1,
      agentDraftId: -1,
    });
    expect(typeof a.dispatch).toBe("function");
  });

  it("RuntimeTraceWriterAdapter is constructible + safely no-ops without ASDB", async () => {
    const a = new RuntimeTraceWriterAdapter();
    expect(typeof a.startRun).toBe("function");
    expect(typeof a.finalizeRun).toBe("function");
    // Calling startRun without ASDB available falls back to runId=0
    // (test env may or may not have appendRuntimeRun); finalize must
    // be safe for runId=0.
    await expect(a.finalizeRun(0, "completed", 100)).resolves.toBeUndefined();
  });
});
