/**
 * Wire-level: Model Access against the local mock provider server.
 *
 * Plan v3 Phase 6. Unlike the unit suite (which mocks global `fetch`),
 * this test exercises the real `fetch` path end-to-end against a
 * process-local HTTP server. Lives at `tests/model-access/` (not
 * `tests/integration/`) because it requires no live infra — a local
 * `http.createServer` plus a mocked credential resolver — and so it
 * runs in the default CI suite. It catches:
 *
 *   - Wire-level URL/method/header construction.
 *   - Body shape negotiation per provider.
 *   - The credential resolver -> fetch -> response normalization
 *     pipeline together.
 *
 * The credential resolver is still mocked at the module level so the
 * test does not need a real Provider Connection row in Postgres. The
 * mock returns a deterministic credential context whose `baseUrl`
 * points at the local mock server.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock(
  "../../server/provider-connections/internal/credential-resolver",
  () => ({
    withProviderCredential: vi.fn(),
    ProviderCredentialResolutionError: class extends Error {
      constructor(public readonly reason: string, message: string) {
        super(message);
        this.name = "ProviderCredentialResolutionError";
      }
    },
  }),
);

import {
  execute,
  validateBinding,
} from "../../server/openrouter/model-access/execute";
import { withProviderCredential } from "../../server/provider-connections/internal/credential-resolver";
import {
  startMockProviderServer,
  type MockProviderServerHandle,
} from "../fixtures/mock-provider-server";

const mockedWith = withProviderCredential as unknown as ReturnType<
  typeof vi.fn
>;

let server: MockProviderServerHandle;

beforeAll(async () => {
  server = await startMockProviderServer();
});

afterAll(async () => {
  await server.close();
});

describe("Model Access — integration against mock provider server", () => {
  it("OpenAI: execute() POSTs /v1/chat/completions and normalizes the response", async () => {
    server.requests.length = 0;
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: server.baseUrl,
        authHeaders: { Authorization: "Bearer mock-pat" },
        providerType: "openai",
      }),
    );

    const result = await execute({
      providerConnectionId: 1,
      modelRef: "gpt-test",
      messages: [{ role: "user", content: "hello" }],
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.status).toBe("ok");
    expect(result.output).toBe("mock-openai-output");
    expect(result.usage).toEqual({
      inputTokens: 4,
      outputTokens: 6,
      totalTokens: 10,
    });

    expect(server.requests).toHaveLength(1);
    const r = server.requests[0]!;
    expect(r.method).toBe("POST");
    expect(r.url).toBe("/v1/chat/completions");
    expect(r.headers.authorization).toBe("Bearer mock-pat");
    expect(r.bodyJson).toMatchObject({
      model: "gpt-test",
      stream: false,
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("Anthropic: execute() POSTs /v1/messages and hoists the system message", async () => {
    server.requests.length = 0;
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: server.baseUrl,
        authHeaders: {
          "x-api-key": "mock-key",
          "anthropic-version": "2023-06-01",
        },
        providerType: "anthropic",
      }),
    );

    const result = await execute({
      providerConnectionId: 2,
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
    expect(result.output).toBe("mock-anthropic-output");
    expect(result.usage).toEqual({
      inputTokens: 3,
      outputTokens: 5,
      totalTokens: 8,
    });

    expect(server.requests).toHaveLength(1);
    const r = server.requests[0]!;
    expect(r.method).toBe("POST");
    expect(r.url).toBe("/v1/messages");
    expect(r.headers["x-api-key"]).toBe("mock-key");
    expect(r.headers["anthropic-version"]).toBe("2023-06-01");
    expect(r.bodyJson).toMatchObject({
      model: "claude-test",
      system: "be terse",
      messages: [{ role: "user", content: "hi" }],
    });
  });

  it("validateBinding(): GET /v1/models reports ok when modelRef appears", async () => {
    server.requests.length = 0;
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: server.baseUrl,
        authHeaders: { Authorization: "Bearer x" },
        providerType: "openai",
      }),
    );

    const r = await validateBinding({
      providerConnectionId: 3,
      modelRef: "gpt-test",
      workspaceId: 1,
    });
    expect(r.ok).toBe(true);
    expect(server.requests[0]?.method).toBe("GET");
    expect(server.requests[0]?.url).toBe("/v1/models");
  });

  it("validateBinding(): reports model_not_listed when modelRef is absent for non-Anthropic", async () => {
    server.requests.length = 0;
    server.options.modelsBody = { data: [{ id: "different-model" }] };
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: server.baseUrl,
        authHeaders: { Authorization: "Bearer x" },
        providerType: "openai",
      }),
    );

    const r = await validateBinding({
      providerConnectionId: 4,
      modelRef: "gpt-test",
      workspaceId: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("model_not_listed");

    // restore default
    server.options.modelsBody = undefined;
  });

  it("HTTP error: upstream 429 is normalized into a Model Access error result", async () => {
    server.requests.length = 0;
    server.options.nextChatStatus = 429;
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: server.baseUrl,
        authHeaders: { Authorization: "Bearer x" },
        providerType: "openai",
      }),
    );

    const result = await execute({
      providerConnectionId: 5,
      modelRef: "gpt-test",
      messages: [{ role: "user", content: "hi" }],
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/upstream_http_error/);
    expect(result.error).toMatch(/429/);
  });

  it("does not leak the credential into the captured request body or back to the caller", async () => {
    server.requests.length = 0;
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: server.baseUrl,
        authHeaders: {
          Authorization: "Bearer integration-leak-bait",
        },
        providerType: "openai",
      }),
    );

    const result = await execute({
      providerConnectionId: 6,
      modelRef: "gpt-test",
      messages: [{ role: "user", content: "hi" }],
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    // The Authorization header is in the captured request (correct —
    // the upstream provider needs it). It must NOT appear in the
    // returned ModelAccessResult.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/integration-leak-bait/);
    expect(serialized).not.toMatch(/Bearer/);

    // Spot-check the request body too — the body is the user
    // payload; it must not echo credentials.
    const bodyStr = server.requests[0]?.body ?? "";
    expect(bodyStr).not.toMatch(/integration-leak-bait/);
    expect(bodyStr).not.toMatch(/Authorization/i);
  });
});
