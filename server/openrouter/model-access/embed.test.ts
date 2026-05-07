/**
 * Phase 28.4 — Model Access embed() unit tests.
 *
 * Mirror the execute.test.ts pattern: mock `withProviderCredential`
 * and the global fetch so the test stays focused on the primitive's
 * behavior. Live upstream tests are gated behind
 * `RUN_LIVE_PROVIDER_TESTS=1` (not exercised here).
 *
 * Coverage maps to D-MA-EMBED-1..7:
 *   - happy path single + batch (D-MA-EMBED-1, D-MA-EMBED-6)
 *   - Anthropic refusal (D-MA-EMBED-2)
 *   - failure modes: timeout / http error / network error / invalid
 *     response / mismatch (D-MA-EMBED-4)
 *   - credential resolution failure (D-MA-EMBED-4)
 *   - dimension contract is caller-side (D-MA-EMBED-5) — test asserts
 *     the primitive does NOT clip or pad
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../provider-connections/internal/credential-resolver", () => ({
  withProviderCredential: vi.fn(),
  ProviderCredentialResolutionError: class ProviderCredentialResolutionError extends Error {
    constructor(public readonly reason: string, message: string) {
      super(message);
      this.name = "ProviderCredentialResolutionError";
    }
  },
}));

import { embed } from "./embed";
import {
  withProviderCredential,
  ProviderCredentialResolutionError,
} from "../../provider-connections/internal/credential-resolver";

const mockedWith = withProviderCredential as unknown as ReturnType<typeof vi.fn>;

describe("Model Access — embed()", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mockedWith.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("happy path: forwards credential, returns batch-shaped embeddings (single input)", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.openai.com",
        authHeaders: { Authorization: "Bearer redacted" },
        providerType: "openai",
      }),
    );

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          model: "text-embedding-3-small",
          usage: { prompt_tokens: 4, total_tokens: 4 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await embed({
      providerConnectionId: 42,
      modelRef: "text-embedding-3-small",
      inputs: "hello world",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.status).toBe("ok");
    expect(result.embeddings).toEqual([[0.1, 0.2, 0.3]]);
    expect(result.usage?.inputTokens).toBe(4);
    expect(result.usage?.totalTokens).toBe(4);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect((init.headers as any).Authorization).toBe("Bearer redacted");
  });

  it("happy path: batch input returns batch-shaped result", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.openai.com",
        authHeaders: { Authorization: "Bearer redacted" },
        providerType: "openai",
      }),
    );

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { embedding: [0.1, 0.2] },
            { embedding: [0.3, 0.4] },
            { embedding: [0.5, 0.6] },
          ],
          usage: { prompt_tokens: 12, total_tokens: 12 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await embed({
      providerConnectionId: 42,
      modelRef: "text-embedding-3-small",
      inputs: ["a", "b", "c"],
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.status).toBe("ok");
    expect(result.embeddings.length).toBe(3);
    expect(result.embeddings[0]).toEqual([0.1, 0.2]);
    expect(result.embeddings[2]).toEqual([0.5, 0.6]);
  });

  it("D-MA-EMBED-2: refuses Anthropic provider with unsupported_provider_type", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.anthropic.com",
        authHeaders: { "x-api-key": "redacted" },
        providerType: "anthropic",
      }),
    );

    const result = await embed({
      providerConnectionId: 42,
      modelRef: "claude-irrelevant",
      inputs: "hi",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/unsupported_provider_type/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("D-MA-EMBED-2: matches Anthropic by base URL even if providerType is generic", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.anthropic.com",
        authHeaders: {},
        providerType: "openai-compatible",
      }),
    );

    const result = await embed({
      providerConnectionId: 42,
      modelRef: "x",
      inputs: "hi",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/unsupported_provider_type/);
  });

  it("D-MA-EMBED-4: upstream HTTP error surfaces with the response body", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.openai.com",
        authHeaders: {},
        providerType: "openai",
      }),
    );

    fetchSpy.mockResolvedValueOnce(
      new Response("rate limit exceeded", { status: 429 }),
    );

    const result = await embed({
      providerConnectionId: 42,
      modelRef: "text-embedding-3-small",
      inputs: "hi",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/upstream_http_error/);
    expect(result.error).toMatch(/429/);
  });

  it("D-MA-EMBED-4: upstream network error surfaces", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.openai.com",
        authHeaders: {},
        providerType: "openai",
      }),
    );

    fetchSpy.mockImplementationOnce(() => {
      throw new TypeError("fetch failed: ECONNRESET");
    });

    const result = await embed({
      providerConnectionId: 42,
      modelRef: "text-embedding-3-small",
      inputs: "hi",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/upstream_network_error/);
  });

  it("D-MA-EMBED-4: invalid JSON response surfaces as upstream_invalid_response", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.openai.com",
        authHeaders: {},
        providerType: "openai",
      }),
    );

    fetchSpy.mockResolvedValueOnce(
      new Response("not json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await embed({
      providerConnectionId: 42,
      modelRef: "text-embedding-3-small",
      inputs: "hi",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/upstream_invalid_response/);
  });

  it("D-MA-EMBED-4: result-count mismatch surfaces as upstream_invalid_response", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.openai.com",
        authHeaders: {},
        providerType: "openai",
      }),
    );

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ embedding: [0.1] }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await embed({
      providerConnectionId: 42,
      modelRef: "text-embedding-3-small",
      inputs: ["a", "b", "c"], // requested 3, will get 1
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/upstream_invalid_response/);
    expect(result.error).toMatch(/1 embeddings for 3 inputs/);
  });

  it("D-MA-EMBED-4: credential resolution failure surfaces", async () => {
    mockedWith.mockImplementation(async () => {
      throw new ProviderCredentialResolutionError(
        "credential_not_found",
        "no active connection",
      );
    });

    const result = await embed({
      providerConnectionId: 999,
      modelRef: "x",
      inputs: "hi",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/credential_resolution_failed/);
    expect(result.error).toMatch(/no active connection/);
  });

  it("D-MA-EMBED-5: returns embeddings with their native dimension (no clipping/padding)", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.openai.com",
        authHeaders: {},
        providerType: "openai",
      }),
    );

    // 1536-element vector (text-embedding-3-small native dim)
    const long = Array.from({ length: 1536 }, (_, i) => i / 1536);
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ embedding: long }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await embed({
      providerConnectionId: 42,
      modelRef: "text-embedding-3-small",
      inputs: "hi",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.status).toBe("ok");
    expect(result.embeddings[0].length).toBe(1536);
    expect(result.embeddings[0][0]).toBe(0);
    expect(result.embeddings[0][1535]).toBeCloseTo(1535 / 1536);
  });

  it("D-MA-EMBED-1: correlationId is echoed back when supplied", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.openai.com",
        authHeaders: {},
        providerType: "openai",
      }),
    );

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ embedding: [0.1] }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await embed({
      providerConnectionId: 42,
      modelRef: "text-embedding-3-small",
      inputs: "hi",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
      correlationId: "test-corr-123",
    });

    expect(result.correlationId).toBe("test-corr-123");
  });

  it("body forwards `input` field directly (string for single, array for batch)", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "https://api.openai.com",
        authHeaders: {},
        providerType: "openai",
      }),
    );

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: [0] }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await embed({
      providerConnectionId: 42,
      modelRef: "text-embedding-3-small",
      inputs: "hello",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
    expect(body.model).toBe("text-embedding-3-small");
    expect(body.input).toBe("hello");

    fetchSpy.mockClear();
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ embedding: [0] }, { embedding: [0] }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await embed({
      providerConnectionId: 42,
      modelRef: "text-embedding-3-small",
      inputs: ["a", "b"],
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });
    const batchBody = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
    expect(batchBody.input).toEqual(["a", "b"]);
  });
});
