/**
 * Follow-up A1 — runtime validator wiring tests.
 *
 * Locks the helper that bridges chat-stream / chat-service to the
 * Phase 8 validator. Production tool-use envelopes don't yet carry
 * rationale + evidence; the helper builds a manifest-derived envelope
 * so the active gates are: invented_tool, missing_parameter,
 * invented_parameter, quarantined_tool, sandbox_required.
 */

import { describe, it, expect } from "vitest";
import { validateRuntimeToolCall } from "../../server/agent-studio/services/runtime/proposed-tool-call-runtime";
import type { McpTool } from "../../server/agent-studio/services/mcp/types";

const READ_TOOL: McpTool & { riskClass: "read_only" } = {
  name: "search_docs",
  description: "search documentation",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
    additionalProperties: false,
  },
  riskClass: "read_only",
};

const QUARANTINED_TOOL: McpTool & { riskClass: "quarantined" } = {
  name: "weird",
  description: "unknown",
  inputSchema: { type: "object", properties: {} },
  riskClass: "quarantined",
};

const CODE_EXEC_TOOL: McpTool & { riskClass: "code_execution" } = {
  name: "py",
  description: "exec python",
  inputSchema: {
    type: "object",
    properties: { code: { type: "string" } },
    required: ["code"],
    additionalProperties: false,
  },
  riskClass: "code_execution",
};

describe("validateRuntimeToolCall — happy path", () => {
  it("ok validator + manifest-derived risk + approval", async () => {
    const v = await validateRuntimeToolCall({
      mcpServerId: "srv1",
      toolName: "search_docs",
      liveTool: READ_TOOL,
      arguments: { query: "x" },
    });
    expect(v.ok).toBe(true);
    expect(v.call.riskLevel).toBe("low");
    expect(v.call.requiresApproval).toBe(false);
    expect(v.call.rationale).toBe("");
    expect(v.call.evidenceChunkIds).toEqual([]);
  });
});

describe("validateRuntimeToolCall — active gates with empty envelope", () => {
  it("Gate 2 missing_parameter — required arg omitted by model", async () => {
    const v = await validateRuntimeToolCall({
      mcpServerId: "srv1",
      toolName: "search_docs",
      liveTool: READ_TOOL,
      arguments: {},
    });
    expect(v.ok).toBe(false);
    expect(v.code).toBe("missing_parameter");
  });

  it("Gate 2 invented_parameter — model passes a key not in schema", async () => {
    const v = await validateRuntimeToolCall({
      mcpServerId: "srv1",
      toolName: "search_docs",
      liveTool: READ_TOOL,
      arguments: { query: "x", extra: 1 },
    });
    expect(v.ok).toBe(false);
    expect(v.code).toBe("invented_parameter");
  });

  it("Gate 2 invented_parameter — type mismatch", async () => {
    const v = await validateRuntimeToolCall({
      mcpServerId: "srv1",
      toolName: "search_docs",
      liveTool: READ_TOOL,
      arguments: { query: 42 },
    });
    expect(v.ok).toBe(false);
    expect(v.code).toBe("invented_parameter");
  });

  it("Gate 7 quarantined_tool — manifest classifies tool as quarantined", async () => {
    const v = await validateRuntimeToolCall({
      mcpServerId: "srv1",
      toolName: "weird",
      liveTool: QUARANTINED_TOOL,
      arguments: {},
    });
    expect(v.ok).toBe(false);
    expect(v.code).toBe("quarantined_tool");
  });

  it("Gate 8 sandbox_required — code_execution tool with unhealthy sandbox", async () => {
    const v = await validateRuntimeToolCall({
      mcpServerId: "srv1",
      toolName: "py",
      liveTool: CODE_EXEC_TOOL,
      arguments: { code: "print(1)" },
      sandboxHealthOk: false,
    });
    expect(v.ok).toBe(false);
    expect(v.code).toBe("sandbox_required");
  });

  it("Gate 8 passes when sandbox is healthy (default)", async () => {
    const v = await validateRuntimeToolCall({
      mcpServerId: "srv1",
      toolName: "py",
      liveTool: CODE_EXEC_TOOL,
      arguments: { code: "print(1)" },
    });
    expect(v.ok).toBe(true);
  });
});

describe("validateRuntimeToolCall — manifest-derived risk + approval", () => {
  it("destructive tool → critical + requiresApproval=true", async () => {
    const TOOL: McpTool & { riskClass: "destructive" } = {
      name: "drop_table",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: false,
      },
      riskClass: "destructive",
    };
    const v = await validateRuntimeToolCall({
      mcpServerId: "srv1",
      toolName: "drop_table",
      liveTool: TOOL,
      arguments: { name: "users" },
    });
    expect(v.ok).toBe(true);
    expect(v.call.riskLevel).toBe("critical");
    expect(v.call.requiresApproval).toBe(true);
  });

  it("write tool → medium + requiresApproval=false", async () => {
    const TOOL: McpTool & { riskClass: "write" } = {
      name: "write_file",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
      riskClass: "write",
    };
    const v = await validateRuntimeToolCall({
      mcpServerId: "srv1",
      toolName: "write_file",
      liveTool: TOOL,
      arguments: { path: "x.txt" },
    });
    expect(v.ok).toBe(true);
    expect(v.call.riskLevel).toBe("medium");
    expect(v.call.requiresApproval).toBe(false);
  });
});
