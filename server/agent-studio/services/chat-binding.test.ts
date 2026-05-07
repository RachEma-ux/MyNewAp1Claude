/**
 * Phase 17 — Expert chat binding routing tests.
 *
 * Asserts that `sendChatMessage` prefers the Model-Access (binding)
 * path when the agent has a `binding_v1` row to a hosted Provider
 * Connection AND no MCP tools are attached, and falls back to the
 * legacy direct-OpenAI path on every other shape.
 *
 * The tests mock the repository, the binding read, the gateway, the
 * MCP registry snapshot, and the dynamic OpenAIProvider import. The
 * goal is to lock down the routing logic, NOT to exercise Model Access
 * internals (covered by OpenRouter Phase 4 unit tests).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repository", () => ({
  getChatSessionById: vi.fn(),
  getCurrentDraft: vi.fn(),
  appendChatMessage: vi.fn(),
  listChatMessages: vi.fn(),
  bumpChatSessionTotals: vi.fn(),
  listMcpServers: vi.fn(() => Promise.resolve([])),
}));

// PMB Phase 29.7 — mock must include FORBIDDEN_BINDING_KEYS because
// `services/cag/validator.ts` (transitively imported via the chat path)
// reads it at module-load time. Mocking only `getAgentProviderBinding`
// turns the constant into `undefined` and crashes module init in
// `cag/validator.ts:70` (`.map((k) => k.toLowerCase())` on undefined).
// Mirror the actual export from `../bindings:132`.
vi.mock("../bindings", () => ({
  getAgentProviderBinding: vi.fn(),
  FORBIDDEN_BINDING_KEYS: [
    "apiKey",
    "api_key",
    "pat",
    "encryptedPat",
    "encrypted_pat",
    "secret",
    "Authorization",
    "authorization",
    "x-api-key",
    "Bearer",
    "apiKeyEnvVar",
  ] as const,
}));

vi.mock("../../provider-connections/public-api", () => ({
  // Phase 21 — provider-use governance calls getBindingEligibility
  // unless the caller passes skipEligibilityCheck. Default ok=true
  // so the existing chat-binding tests don't fail on the new gate.
  getBindingEligibility: vi.fn(async () => ({
    providerConnectionId: 42,
    ok: true,
    lifecycleStatus: "active",
    healthStatus: "ok",
  })),
}));

vi.mock("../../platform/modules/module-gateway", () => ({
  gatewayCall: vi.fn(),
}));

vi.mock("./mcp/registry", () => ({
  getSnapshot: vi.fn(() => null),
}));

vi.mock("./mcp/dispatcher", () => ({
  dispatchMcpToolCall: vi.fn(),
}));

// PMB Phase 29.7 — short-circuit the RAC runtime so the chat-binding
// tests don't try to query ASDB through `listProfilesForDraft`. The
// chat path calls `buildRuntimeSystemPrompt` which transitively hits
// `rac/sources/store.ts` — and the rac-orchestrator subtree was added
// to chat.ts after this test file was written, breaking it
// transitively. Mocking the orchestrator's two public entry points
// keeps the test focused on the binding-routing logic it actually
// asserts.
vi.mock("./runtime/rac-orchestrator", () => ({
  buildRuntimeSystemPrompt: vi.fn(async () => ({
    systemPrompt: "stub system prompt",
    context: {
      mode: "no_retrieval" as const,
      capabilityPack: null,
      retrievalEvidence: [],
      warnings: [],
      sourceTraces: [],
      metrics: undefined,
    },
    composerWarnings: [],
    truncations: [],
    cacheKey: "stub-cache-key",
  })),
  resolveAndAssembleContext: vi.fn(async () => ({
    mode: "no_retrieval" as const,
    capabilityPack: null,
    retrievalEvidence: [],
    warnings: [],
    sourceTraces: [],
    metrics: undefined,
  })),
  RetrievalRequiredError: class extends Error {
    constructor(public readonly reasons: string[] = []) {
      super("retrieval required");
    }
  },
}));

import * as repo from "../repository";
import { getAgentProviderBinding } from "../bindings";
import { gatewayCall } from "../../platform/modules/module-gateway";
import { dispatchMcpToolCall } from "./mcp/dispatcher";
import { getSnapshot } from "./mcp/registry";
import { sendChatMessage } from "./chat";

const mockedRepo = repo as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockedBinding = getAgentProviderBinding as unknown as ReturnType<
  typeof vi.fn
>;
const mockedGateway = gatewayCall as unknown as ReturnType<typeof vi.fn>;
const mockedDispatch = dispatchMcpToolCall as unknown as ReturnType<
  typeof vi.fn
>;
const mockedSnapshot = getSnapshot as unknown as ReturnType<typeof vi.fn>;

function bindingPublic(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    workspaceId: 1,
    agentId: 1,
    draftId: 1,
    role: "primary",
    providerCatalogEntryId: 10,
    modelCatalogEntryId: 20,
    providerConnectionId: 42,
    modelRef: "gpt-4o-mini",
    status: "binding_v1" as const,
    statusReason: null,
    legacyEnvVarHint: null,
    lastValidatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function defaultSession() {
  return { id: 1, agentId: 1, title: null };
}

function defaultDraft() {
  return {
    id: 1,
    agentId: 1,
    systemInstructions: "Be helpful",
    roleInstructions: null,
    providerConfig: { provider: "openai", model: "gpt-4o-mini" },
  };
}

beforeEach(() => {
  for (const fn of Object.values(mockedRepo)) fn.mockReset?.();
  mockedBinding.mockReset();
  mockedGateway.mockReset();

  mockedRepo.getChatSessionById.mockResolvedValue(defaultSession());
  mockedRepo.getCurrentDraft.mockResolvedValue(defaultDraft());
  mockedRepo.appendChatMessage.mockResolvedValue({ id: 99 });
  mockedRepo.listChatMessages.mockResolvedValue([
    { role: "user", content: "Hi" },
  ]);
  mockedRepo.bumpChatSessionTotals.mockResolvedValue(undefined);
  mockedRepo.listMcpServers.mockResolvedValue([]);
});

describe("sendChatMessage — binding path (Phase 17)", () => {
  it("routes through Model Access when binding_v1 + hosted PCID + no tools", async () => {
    mockedBinding.mockResolvedValue(bindingPublic());
    mockedGateway.mockResolvedValue({
      status: "ok",
      output: "Hello back",
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
      latencyMs: 90,
      usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
    });

    const r = await sendChatMessage(
      { sessionId: 1, userMessage: "Hi" },
      { workspaceId: 7, actorId: 11 },
    );

    expect(r.ok).toBe(true);
    expect(r.assistantMessage?.content).toBe("Hello back");
    expect(r.assistantMessage?.inputTokens).toBe(12);
    expect(r.assistantMessage?.outputTokens).toBe(4);
    expect(r.assistantMessage?.model).toBe("gpt-4o-mini");

    expect(mockedGateway).toHaveBeenCalledTimes(1);
    const call = mockedGateway.mock.calls[0][0];
    expect(call.ctx.targetModule).toBe("openRouter");
    expect(call.ctx.actionKey).toBe("openRouter.modelAccess.execute");
    expect(call.ctx.workspaceId).toBe(7);
    expect(call.ctx.actorId).toBe(11);
    expect(call.input.providerConnectionId).toBe(42);
    expect(call.input.modelRef).toBe("gpt-4o-mini");
    expect(call.input.intent).toBe("chat");
    // Plan v3 Phase 20: chat intent requires a governance receipt.
    expect(typeof call.ctx.governanceReceiptId).toBe("string");
    expect(call.ctx.governanceReceiptId).toMatch(/^chat-/);
    // System message + the persisted user message
    expect(call.input.messages.length).toBeGreaterThanOrEqual(2);
    expect(call.input.messages[0].role).toBe("system");
  });

  it("returns Model Access error verbatim", async () => {
    mockedBinding.mockResolvedValue(bindingPublic());
    mockedGateway.mockResolvedValue({
      status: "error",
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
      latencyMs: 30,
      error: "upstream 503",
    });

    const r = await sendChatMessage(
      { sessionId: 1, userMessage: "Hi" },
      { workspaceId: 1, actorId: 1 },
    );

    expect(r.ok).toBe(false);
    expect(r.error).toContain("upstream 503");
  });

  it("rejects local-provider bindings (providerConnectionId=null)", async () => {
    mockedBinding.mockResolvedValue(
      bindingPublic({ providerConnectionId: null, modelRef: "llama3.1:8b" }),
    );

    const r = await sendChatMessage(
      { sessionId: 1, userMessage: "Hi" },
      { workspaceId: 1, actorId: 1 },
    );

    // The point of this test is that the gateway is NOT called for a
    // null-PCID binding. After Phase 27.5 removed the legacy fallback
    // and Phase 29.0a deleted `resolveProviderApiKey`, sendChatMessage
    // returns a structured `binding_required`-style failure for
    // null-PCID bindings rather than attempting any upstream call.
    expect(mockedGateway).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  it("falls through to legacy path when no binding row exists", async () => {
    mockedBinding.mockResolvedValue(null);

    await sendChatMessage(
      { sessionId: 1, userMessage: "Hi" },
      { workspaceId: 1, actorId: 1 },
    );

    expect(mockedGateway).not.toHaveBeenCalled();
  });

  it("falls through to legacy path when binding is legacy_unresolved", async () => {
    mockedBinding.mockResolvedValue(
      bindingPublic({
        status: "legacy_unresolved",
        statusReason: "legacy_env_var",
      }),
    );

    await sendChatMessage(
      { sessionId: 1, userMessage: "Hi" },
      { workspaceId: 1, actorId: 1 },
    );

    expect(mockedGateway).not.toHaveBeenCalled();
  });
});

// ─── Plan v3 Phase 18 — tool-equipped binding chat ─────────────────────

describe("sendChatMessage — tool-call binding path (Phase 18)", () => {
  beforeEach(() => {
    mockedDispatch.mockReset();
    mockedSnapshot.mockReset();
    // One MCP server, connected, exposing a single tool.
    mockedRepo.listMcpServers.mockResolvedValue([
      { id: 7, name: "demo", enabled: true },
    ]);
    mockedSnapshot.mockReturnValue({
      tools: [
        {
          name: "echo",
          description: "echoes args",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    });
  });

  it("routes a tool-equipped binding through the gateway and dispatches the tool", async () => {
    mockedBinding.mockResolvedValue(bindingPublic());

    // History grows across the loop. We simulate two listings:
    //   (1) initial pre-loop snapshot (1 user message)
    //   (2) inside the loop after the assistant tool-call turn + tool result
    //   (3) post-loop snapshot
    let listCallCount = 0;
    mockedRepo.listChatMessages.mockImplementation(async () => {
      listCallCount++;
      if (listCallCount === 1) {
        // pre-loop count
        return [{ role: "user", content: "go" }];
      }
      if (listCallCount === 2) {
        // first turn: history is just the user message
        return [{ role: "user", content: "go" }];
      }
      if (listCallCount === 3) {
        // second turn: assistant tool-call + tool result are appended
        return [
          { role: "user", content: "go" },
          {
            role: "assistant",
            content: "",
            toolPayload: {
              toolCalls: [
                { id: "call_1", name: "demo__echo", arguments: '{"x":1}' },
              ],
            },
          },
          {
            role: "tool",
            content: '{"echoed":true}',
            toolPayload: { toolCallId: "call_1" },
          },
        ];
      }
      // post-loop: + final assistant turn
      return [
        { role: "user", content: "go" },
        { role: "assistant", content: "" },
        { role: "tool", content: '{"echoed":true}' },
        { role: "assistant", content: "All done." },
      ];
    });

    // First gateway call returns tool_calls; second returns final text.
    mockedGateway
      .mockResolvedValueOnce({
        status: "ok",
        providerConnectionId: 42,
        modelRef: "gpt-4o-mini",
        latencyMs: 100,
        usage: { inputTokens: 5, outputTokens: 3 },
        toolCalls: [
          { id: "call_1", name: "demo__echo", arguments: '{"x":1}' },
        ],
        finishReason: "tool_calls",
      })
      .mockResolvedValueOnce({
        status: "ok",
        providerConnectionId: 42,
        modelRef: "gpt-4o-mini",
        latencyMs: 80,
        usage: { inputTokens: 8, outputTokens: 4 },
        output: "All done.",
        finishReason: "stop",
      });

    mockedDispatch.mockResolvedValue({
      ok: true,
      result: { echoed: true },
    });

    const r = await sendChatMessage(
      { sessionId: 1, userMessage: "go" },
      { workspaceId: 1, actorId: 1 },
    );

    expect(r.ok).toBe(true);
    expect(r.assistantMessage?.content).toBe("All done.");
    expect(mockedGateway).toHaveBeenCalledTimes(2);
    expect(mockedDispatch).toHaveBeenCalledTimes(1);
    const dispatchArgs = mockedDispatch.mock.calls[0][0];
    expect(dispatchArgs.toolName).toBe("mcp__demo__echo");
    expect(dispatchArgs.args).toEqual({ x: 1 });

    // Cumulative usage from both turns.
    expect(r.assistantMessage?.inputTokens).toBe(5 + 8);
    expect(r.assistantMessage?.outputTokens).toBe(3 + 4);
  });

  it("surfaces dispatcher errors as role=tool error rows; loop continues", async () => {
    mockedBinding.mockResolvedValue(bindingPublic());

    let listCallCount = 0;
    mockedRepo.listChatMessages.mockImplementation(async () => {
      listCallCount++;
      if (listCallCount <= 2) return [{ role: "user", content: "go" }];
      return [
        { role: "user", content: "go" },
        { role: "assistant", content: "" },
        {
          role: "tool",
          content: JSON.stringify({ error: "boom", code: "ERR_X" }),
        },
        { role: "assistant", content: "Recovered." },
      ];
    });

    mockedGateway
      .mockResolvedValueOnce({
        status: "ok",
        providerConnectionId: 42,
        modelRef: "gpt-4o-mini",
        latencyMs: 100,
        toolCalls: [
          { id: "call_1", name: "demo__echo", arguments: "{}" },
        ],
      })
      .mockResolvedValueOnce({
        status: "ok",
        providerConnectionId: 42,
        modelRef: "gpt-4o-mini",
        latencyMs: 50,
        output: "Recovered.",
      });

    mockedDispatch.mockResolvedValue({
      ok: false,
      error: { message: "boom", code: "ERR_X" },
    });

    const r = await sendChatMessage(
      { sessionId: 1, userMessage: "go" },
      { workspaceId: 1, actorId: 1 },
    );

    expect(r.ok).toBe(true);
    expect(r.assistantMessage?.content).toBe("Recovered.");
    // Tool result row written with error JSON.
    const errorToolWrites = mockedRepo.appendChatMessage.mock.calls.filter(
      (c: any[]) =>
        c[0].role === "tool" &&
        typeof c[0].content === "string" &&
        c[0].content.includes('"error":"boom"'),
    );
    expect(errorToolWrites.length).toBe(1);
  });
});
