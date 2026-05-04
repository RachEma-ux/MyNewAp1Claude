/**
 * Model Access — execute()/validateBinding() unit tests
 *
 * Plan v3 Phase 4. These tests:
 *   - Mock the global fetch to avoid any real upstream HTTP.
 *   - Mock the Provider Connections internal credential resolver to
 *     avoid hitting the database. The resolver mock returns a
 *     hard-coded credential context whose `authHeaders` is what
 *     execute() spreads into `fetch`.
 *   - Assert that the resolved credential is forwarded to fetch
 *     exactly once and that the response is normalized into a
 *     ModelAccessResult.
 *
 * Live provider tests are gated behind `RUN_LIVE_PROVIDER_TESTS=1`
 * (Phase 6 — not exercised here).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the credential resolver before importing execute. The resolver
// path is the only place outside server/secrets/ where a decrypted
// credential exists; the mock returns a deterministic shape.
vi.mock("../../provider-connections/internal/credential-resolver", () => ({
  withProviderCredential: vi.fn(),
  ProviderCredentialResolutionError: class ProviderCredentialResolutionError extends Error {
    constructor(public readonly reason: string, message: string) {
      super(message);
      this.name = "ProviderCredentialResolutionError";
    }
  },
}));

import { execute, validateBinding } from "./execute";
import { withProviderCredential } from "../../provider-connections/internal/credential-resolver";

const mockedWith = withProviderCredential as unknown as ReturnType<
  typeof vi.fn
>;

describe("Model Access — execute()", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mockedWith.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards resolved credential headers to fetch and normalizes OpenAI-shape response", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.example.com",
        authHeaders: { Authorization: "Bearer redacted-test-pat" },
        providerType: "openai",
      }),
    );

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "hello" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await execute({
      providerConnectionId: 42,
      modelRef: "gpt-test",
      messages: [{ role: "user", content: "hi" }],
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.status).toBe("ok");
    expect(result.output).toBe("hello");
    expect(result.usage).toEqual({
      inputTokens: 5,
      outputTokens: 7,
      totalTokens: 12,
    });
    expect(result.providerConnectionId).toBe(42);
    expect(result.modelRef).toBe("gpt-test");
    expect(result.correlationId).toMatch(/^mod-acc-/);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOpts] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("https://api.example.com/v1/chat/completions");
    expect(calledOpts.method).toBe("POST");
    expect(calledOpts.headers["Authorization"]).toBe(
      "Bearer redacted-test-pat",
    );
    const body = JSON.parse(calledOpts.body);
    expect(body.model).toBe("gpt-test");
    expect(body.stream).toBe(false);
  });

  it("uses Anthropic adapter shape when providerType=anthropic", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.anthropic.com",
        authHeaders: {
          "x-api-key": "redacted",
          "anthropic-version": "2023-06-01",
        },
        providerType: "anthropic",
      }),
    );

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "anthropic-out" }],
          usage: { input_tokens: 3, output_tokens: 4 },
          stop_reason: "end_turn",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await execute({
      providerConnectionId: 99,
      modelRef: "claude-test",
      messages: [
        { role: "system", content: "be terse" },
        { role: "user", content: "hi" },
      ],
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.status).toBe("ok");
    expect(result.output).toBe("anthropic-out");
    expect(result.usage).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
    });

    const [calledUrl, calledOpts] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("https://api.anthropic.com/v1/messages");
    expect(calledOpts.headers["x-api-key"]).toBe("redacted");
    const body = JSON.parse(calledOpts.body);
    // System message is hoisted out of the messages array for Anthropic.
    expect(body.system).toBe("be terse");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("returns a normalized error when the credential resolver fails", async () => {
    const { ProviderCredentialResolutionError } = await import(
      "../../provider-connections/internal/credential-resolver"
    );
    mockedWith.mockRejectedValueOnce(
      new ProviderCredentialResolutionError(
        "secret_missing",
        "Provider connection 42 has no stored secret",
      ),
    );

    const result = await execute({
      providerConnectionId: 42,
      modelRef: "gpt-test",
      messages: [{ role: "user", content: "hi" }],
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/credential_resolution_failed/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a normalized error on upstream HTTP failure", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.example.com",
        authHeaders: { Authorization: "Bearer x" },
        providerType: "openai",
      }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response("rate limited", {
        status: 429,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    const result = await execute({
      providerConnectionId: 1,
      modelRef: "m",
      messages: [{ role: "user", content: "hi" }],
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/upstream_http_error/);
    expect(result.error).toMatch(/429/);
  });

  it("does not return any secret-bearing field on success", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.example.com",
        authHeaders: { Authorization: "Bearer secret-pat-leak-bait" },
        providerType: "openai",
      }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await execute({
      providerConnectionId: 1,
      modelRef: "m",
      messages: [{ role: "user", content: "hi" }],
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/secret-pat-leak-bait/);
    expect(serialized).not.toMatch(/Bearer/);
    expect(serialized).not.toMatch(/Authorization/);
  });
});

describe("Model Access — validateBinding()", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mockedWith.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok when /v1/models is reachable and lists the model", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.example.com",
        authHeaders: { Authorization: "Bearer x" },
        providerType: "openai",
      }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ id: "gpt-test" }, { id: "other" }] }),
        { status: 200 },
      ),
    );

    const r = await validateBinding({
      providerConnectionId: 1,
      modelRef: "gpt-test",
      workspaceId: 1,
    });
    expect(r.ok).toBe(true);
  });

  it("returns model_not_listed when modelRef missing for non-Anthropic provider", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.example.com",
        authHeaders: { Authorization: "Bearer x" },
        providerType: "openai",
      }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: "different-model" }] }), {
        status: 200,
      }),
    );

    const r = await validateBinding({
      providerConnectionId: 1,
      modelRef: "gpt-test",
      workspaceId: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("model_not_listed");
  });

  it("treats Anthropic /v1/models absence as ok (provider underreports)", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.anthropic.com",
        authHeaders: { "x-api-key": "x" },
        providerType: "anthropic",
      }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    const r = await validateBinding({
      providerConnectionId: 1,
      modelRef: "claude-test",
      workspaceId: 1,
    });
    expect(r.ok).toBe(true);
  });
});

// ─── Plan v3 Phase 18 — tool-call extraction ─────────────────────────

describe("Model Access — execute() tool-call schema (Phase 18)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mockedWith.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("OpenAI: extracts tool_calls into ModelAccessToolCall[]", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.openai.com",
        authHeaders: { Authorization: "Bearer x" },
        providerType: "openai",
      }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_abc",
                    type: "function",
                    function: { name: "do_thing", arguments: '{"x":1}' },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        }),
        { status: 200 },
      ),
    );

    const r = await execute({
      providerConnectionId: 1,
      modelRef: "gpt-x",
      messages: [{ role: "user", content: "go" }],
      tools: [{ type: "function", function: { name: "do_thing" } }],
      intent: "chat",
      workspaceId: 1,
      actorId: 1,
    });
    expect(r.status).toBe("ok");
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls?.[0].id).toBe("call_abc");
    expect(r.toolCalls?.[0].name).toBe("do_thing");
    expect(r.toolCalls?.[0].arguments).toBe('{"x":1}');
    expect(r.finishReason).toBe("tool_calls");
  });

  it("OpenAI: round-trips assistant.toolCalls + tool.toolCallId into the request body", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.openai.com",
        authHeaders: { Authorization: "Bearer x" },
        providerType: "openai",
      }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "done" }, finish_reason: "stop" }],
        }),
        { status: 200 },
      ),
    );

    await execute({
      providerConnectionId: 1,
      modelRef: "gpt-x",
      messages: [
        { role: "user", content: "go" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "call_1", name: "do_thing", arguments: '{"x":1}' },
          ],
        },
        { role: "tool", content: '{"ok":true}', toolCallId: "call_1" },
      ],
      intent: "chat",
      workspaceId: 1,
      actorId: 1,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const req = fetchSpy.mock.calls[0][1];
    const body = JSON.parse(req.body as string);
    const assistantTurn = body.messages.find(
      (m: any) => m.role === "assistant",
    );
    expect(assistantTurn.tool_calls).toEqual([
      {
        id: "call_1",
        type: "function",
        function: { name: "do_thing", arguments: '{"x":1}' },
      },
    ]);
    const toolTurn = body.messages.find((m: any) => m.role === "tool");
    expect(toolTurn.tool_call_id).toBe("call_1");
    expect(toolTurn.content).toBe('{"ok":true}');
  });

  it("Anthropic: extracts tool_use blocks into ModelAccessToolCall[]", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.anthropic.com",
        authHeaders: { "x-api-key": "x" },
        providerType: "anthropic",
      }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [
            { type: "text", text: "calling tool" },
            {
              type: "tool_use",
              id: "tu_1",
              name: "lookup",
              input: { q: "x" },
            },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 1, output_tokens: 2 },
        }),
        { status: 200 },
      ),
    );
    const r = await execute({
      providerConnectionId: 1,
      modelRef: "claude-x",
      messages: [{ role: "user", content: "go" }],
      tools: [{ name: "lookup" }],
      intent: "chat",
      workspaceId: 1,
      actorId: 1,
    });
    expect(r.status).toBe("ok");
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls?.[0]).toEqual({
      id: "tu_1",
      name: "lookup",
      arguments: '{"q":"x"}',
    });
    expect(r.finishReason).toBe("tool_use");
  });

  it("returns no toolCalls field when the model returns plain text", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.openai.com",
        authHeaders: { Authorization: "Bearer x" },
        providerType: "openai",
      }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "plain reply" }, finish_reason: "stop" }],
        }),
        { status: 200 },
      ),
    );
    const r = await execute({
      providerConnectionId: 1,
      modelRef: "gpt-x",
      messages: [{ role: "user", content: "hi" }],
      intent: "chat",
      workspaceId: 1,
      actorId: 1,
    });
    expect(r.status).toBe("ok");
    expect(r.output).toBe("plain reply");
    expect(r.toolCalls).toBeUndefined();
  });
});
