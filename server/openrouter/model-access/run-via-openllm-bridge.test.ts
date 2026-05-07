/**
 * Phase 28.6 — openllm-agent bridge primitive unit tests.
 *
 * Mocks `withProviderCredential` and the `ws` WebSocket module so the
 * tests stay focused on the bridge's behavior. Coverage maps to
 * D-MA-TOOL-1..8:
 *   - happy path: open → token(s) → done (D-MA-TOOL-4)
 *   - permission_request → resolver → permission_response (D-MA-TOOL-3)
 *   - permission resolver fallback to "deny" when omitted
 *   - permission "needs_human" emits a policy event
 *   - configure_session sent when mcpServers non-empty (D-MA-TOOL-6)
 *   - configure_session NOT sent when mcpServers empty
 *   - session_configured ack populates sessionConfig
 *   - configure_session no-ack timeout falls through to "no_ack"
 *   - WebSocket error bubbles into result.error
 *   - WebSocket close before done finalizes ok=false
 *   - timeout finalizes ok=false
 *   - credential resolution failure surfaces in result.error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

vi.mock("../../provider-connections/internal/credential-resolver", () => ({
  withProviderCredential: vi.fn(),
  ProviderCredentialResolutionError: class ProviderCredentialResolutionError extends Error {
    constructor(public readonly reason: string, message: string) {
      super(message);
      this.name = "ProviderCredentialResolutionError";
    }
  },
}));

// Hoisted fake `ws` module — each `new WebSocket(url)` returns an
// EventEmitter the test can drive with .emit("open"), .emit("message",
// buf), etc. `vi.hoisted` is required because `vi.mock` is itself
// hoisted to the top of the file, so a class declared at module scope
// isn't yet available when the mock factory runs.
const { FakeWebSocket } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: NodeEventEmitter } = require("events");
  class FakeWebSocketImpl extends NodeEventEmitter {
    url: string;
    sent: any[] = [];
    closed = false;
    constructor(url: string) {
      super();
      this.url = url;
      FakeWebSocketImpl.instances.push(this);
    }
    send(payload: string) {
      this.sent.push(JSON.parse(payload));
    }
    close() {
      this.closed = true;
    }
    static instances: FakeWebSocketImpl[] = [];
    static reset() {
      FakeWebSocketImpl.instances = [];
    }
  }
  return { FakeWebSocket: FakeWebSocketImpl };
});

vi.mock("ws", () => ({
  default: FakeWebSocket,
}));

import {
  runViaOpenllmBridge,
  deriveOpenllmWsUrl,
} from "./run-via-openllm-bridge";
import {
  withProviderCredential,
  ProviderCredentialResolutionError,
} from "../../provider-connections/internal/credential-resolver";

const mockedWith = withProviderCredential as unknown as ReturnType<typeof vi.fn>;
async function awaitWs() {
  // Wait for the credential-resolver mock + the new Promise constructor
  // to schedule the WebSocket creation. setImmediate flushes microtasks.
  for (let i = 0; i < 5; i++) {
    if (FakeWebSocket.instances.length > 0) return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    await new Promise<void>((r) => setImmediate(r));
  }
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
}


const standardCredential = {
  baseUrl: "http://127.0.0.1:5000",
  authHeaders: { Authorization: "Bearer sk-test-key" },
  providerType: "openai",
};

beforeEach(() => {
  FakeWebSocket.reset();
  mockedWith.mockReset();
  mockedWith.mockImplementation(async (_id: number, fn: any) =>
    fn(standardCredential),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("deriveOpenllmWsUrl", () => {
  it("rewrites http to ws and adds /ws path", () => {
    expect(deriveOpenllmWsUrl("http://127.0.0.1:5000")).toBe("ws://127.0.0.1:5000/ws");
  });
  it("rewrites https to wss and adds /ws path", () => {
    expect(deriveOpenllmWsUrl("https://tunnel.example.com")).toBe("wss://tunnel.example.com/ws");
  });
  it("preserves ws/wss scheme; ensures /ws path", () => {
    expect(deriveOpenllmWsUrl("ws://host:5000")).toBe("ws://host:5000/ws");
  });
  it("returns input unchanged when URL parsing fails", () => {
    expect(deriveOpenllmWsUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("runViaOpenllmBridge — happy path", () => {
  it("open → token → done resolves with the assembled text and usage", async () => {
    const promise = runViaOpenllmBridge({
      providerConnectionId: 42,
      modelRef: "gpt-test",
      message: "hi",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    // Wait for the credential resolver microtask to fire the WS construction
    const ws = await awaitWs();
    expect(ws).toBeDefined();
    expect(ws.url).toBe("ws://127.0.0.1:5000/ws");

    ws.emit("open");
    // First sent frame should be the message (no MCP servers passed)
    expect(ws.sent[0]).toMatchObject({
      type: "message",
      content: "hi",
      provider: "openai",
      model: "gpt-test",
      apiKey: "sk-test-key",
    });

    ws.emit("message", JSON.stringify({ type: "token", content: "hello" }));
    ws.emit("message", JSON.stringify({ type: "token", content: " world" }));
    ws.emit(
      "message",
      JSON.stringify({
        type: "done",
        usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
      }),
    );

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.text).toBe("hello world");
    expect(result.tokenCount).toBe(2);
    expect(result.finalizedNormally).toBe(true);
    expect(result.usage?.inputTokens).toBe(5);
    expect(result.usage?.outputTokens).toBe(7);
    expect(result.usage?.totalTokens).toBe(12);
    expect(ws.closed).toBe(true);
  });
});

describe("runViaOpenllmBridge — permission_request flow", () => {
  it("invokes resolver, sends permission_response with the decision", async () => {
    const resolver = vi.fn(async () => "allow" as const);

    const promise = runViaOpenllmBridge({
      providerConnectionId: 42,
      modelRef: "gpt-test",
      message: "do tool",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
      permissionResolver: resolver,
    });

    const ws = await awaitWs();
    ws.emit("open");

    ws.emit(
      "message",
      JSON.stringify({
        type: "permission_request",
        toolName: "fs.write",
        rawPayload: { x: 1 },
      }),
    );

    // Resolver runs in a microtask; flush it.
    await Promise.resolve();
    await Promise.resolve();

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(ws.sent.find((f: any) => f.type === "permission_response")).toMatchObject({
      type: "permission_response",
      allowed: true,
    });

    ws.emit("message", JSON.stringify({ type: "done", usage: {} }));
    const result = await promise;
    expect(result.permissionEvents.length).toBe(1);
  });

  it("falls back to deny when no resolver supplied (Phase 1b safety)", async () => {
    const promise = runViaOpenllmBridge({
      providerConnectionId: 42,
      modelRef: "gpt-test",
      message: "x",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    const ws = await awaitWs();
    ws.emit("open");
    ws.emit("message", JSON.stringify({ type: "permission_request", toolName: "x" }));

    await Promise.resolve();
    await Promise.resolve();

    const response = ws.sent.find((f: any) => f.type === "permission_response");
    expect(response).toMatchObject({ type: "permission_response", allowed: false });

    ws.emit("message", JSON.stringify({ type: "done", usage: {} }));
    await promise;
  });

  it("decision='needs_human' denies AND records a policy event", async () => {
    const promise = runViaOpenllmBridge({
      providerConnectionId: 42,
      modelRef: "gpt-test",
      message: "x",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
      permissionResolver: async () => "needs_human",
    });

    const ws = await awaitWs();
    ws.emit("open");
    ws.emit("message", JSON.stringify({ type: "permission_request", toolName: "x" }));

    await Promise.resolve();
    await Promise.resolve();

    const response = ws.sent.find((f: any) => f.type === "permission_response");
    expect(response.allowed).toBe(false);

    ws.emit("message", JSON.stringify({ type: "done", usage: {} }));
    const result = await promise;
    expect(result.policyEvents.find((e) => (e.payload as any).type === "permission_needs_human"))
      .toBeDefined();
  });
});

describe("runViaOpenllmBridge — configure_session (Phase 18 / D-MA-TOOL-6)", () => {
  it("sends configure_session FIRST when mcpServers non-empty, then message after ack", async () => {
    const promise = runViaOpenllmBridge({
      providerConnectionId: 42,
      modelRef: "gpt-test",
      message: "hi",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
      mcpServers: [{ type: "sdk", serverName: "studio.echo" }],
    });

    const ws = await awaitWs();
    ws.emit("open");

    expect(ws.sent[0]).toMatchObject({ type: "configure_session" });
    expect(ws.sent.find((f: any) => f.type === "message")).toBeUndefined();

    ws.emit(
      "message",
      JSON.stringify({
        type: "session_configured",
        mcpServerCount: 1,
        mcpToolCount: 3,
        errors: [],
      }),
    );

    expect(ws.sent.find((f: any) => f.type === "message")).toMatchObject({
      type: "message",
      content: "hi",
    });

    ws.emit("message", JSON.stringify({ type: "done", usage: {} }));
    const result = await promise;
    expect(result.sessionConfig).toMatchObject({
      mcpServerCount: 1,
      mcpToolCount: 3,
      errors: [],
    });
  });

  it("falls through to message when configure_session ack times out", async () => {
    // Important: fake timers AFTER awaitWs() returns. awaitWs uses
    // setImmediate which is itself faked by vi.useFakeTimers — flipping
    // the order would deadlock the helper.
    const promise = runViaOpenllmBridge({
      providerConnectionId: 42,
      modelRef: "gpt-test",
      message: "hi",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
      mcpServers: [{ type: "sdk", serverName: "x" }],
      sessionConfigureTimeoutMs: 100,
    });

    const ws = await awaitWs();
    vi.useFakeTimers();
    ws.emit("open");
    expect(ws.sent[0]).toMatchObject({ type: "configure_session" });

    vi.advanceTimersByTime(100);
    expect(ws.sent.find((f: any) => f.type === "message")).toBeDefined();

    ws.emit("message", JSON.stringify({ type: "done", usage: {} }));
    vi.useRealTimers();
    const result = await promise;
    expect(result.sessionConfig).toBe("no_ack");
  });

  it("does NOT send configure_session when mcpServers omitted/empty", async () => {
    const promise = runViaOpenllmBridge({
      providerConnectionId: 42,
      modelRef: "gpt-test",
      message: "hi",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    const ws = await awaitWs();
    ws.emit("open");
    expect(ws.sent[0].type).toBe("message");

    ws.emit("message", JSON.stringify({ type: "done" }));
    await promise;
  });
});

describe("runViaOpenllmBridge — failure modes", () => {
  it("returns ok=false when WebSocket emits error", async () => {
    const promise = runViaOpenllmBridge({
      providerConnectionId: 42,
      modelRef: "gpt-test",
      message: "x",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    const ws = await awaitWs();
    ws.emit("error", new Error("ECONNREFUSED"));

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ECONNREFUSED/);
  });

  it("returns ok=false when WebSocket closes before done", async () => {
    const promise = runViaOpenllmBridge({
      providerConnectionId: 42,
      modelRef: "gpt-test",
      message: "x",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    const ws = await awaitWs();
    ws.emit("open");
    ws.emit("close");

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/closed before done/);
  });

  it("returns ok=false when overall timeout fires", async () => {
    // Same ordering constraint as the configure_session-ack-timeout test:
    // fake timers AFTER awaitWs() returns.
    const promise = runViaOpenllmBridge({
      providerConnectionId: 42,
      modelRef: "gpt-test",
      message: "x",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
      timeoutMs: 50,
    });

    const ws = await awaitWs();
    vi.useFakeTimers();
    ws.emit("open");

    vi.advanceTimersByTime(50);
    vi.useRealTimers();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timeout/);
  });

  it("returns credential_resolution_failed when resolver throws ProviderCredentialResolutionError", async () => {
    mockedWith.mockImplementation(async () => {
      throw new ProviderCredentialResolutionError(
        "credential_not_found",
        "no active connection",
      );
    });

    const result = await runViaOpenllmBridge({
      providerConnectionId: 999,
      modelRef: "x",
      message: "x",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/credential_resolution_failed/);
    expect(FakeWebSocket.instances.length).toBe(0);
  });

  it("returns ok=false when upstream emits {type:'error'} mid-stream", async () => {
    const promise = runViaOpenllmBridge({
      providerConnectionId: 42,
      modelRef: "gpt-test",
      message: "x",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });

    const ws = await awaitWs();
    ws.emit("open");
    ws.emit("message", JSON.stringify({ type: "error", message: "model_unavailable" }));

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toBe("model_unavailable");
  });
});

describe("runViaOpenllmBridge — credential extraction", () => {
  it("strips 'Bearer ' prefix from Authorization header before forwarding apiKey", async () => {
    const promise = runViaOpenllmBridge({
      providerConnectionId: 42,
      modelRef: "x",
      message: "x",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });
    const ws = await awaitWs();
    ws.emit("open");
    expect(ws.sent[0].apiKey).toBe("sk-test-key");
    ws.emit("message", JSON.stringify({ type: "done" }));
    await promise;
  });

  it("falls back to x-api-key header when Authorization absent", async () => {
    mockedWith.mockImplementation(async (_id: number, fn: any) =>
      fn({
        baseUrl: "http://127.0.0.1:5000",
        authHeaders: { "x-api-key": "anthropic-style-key" },
        providerType: "anthropic",
      }),
    );

    const promise = runViaOpenllmBridge({
      providerConnectionId: 42,
      modelRef: "claude-x",
      message: "x",
      intent: "agent-test",
      workspaceId: 1,
      actorId: 1,
    });
    const ws = await awaitWs();
    ws.emit("open");
    expect(ws.sent[0].apiKey).toBe("anthropic-style-key");
    expect(ws.sent[0].provider).toBe("anthropic");
    ws.emit("message", JSON.stringify({ type: "done" }));
    await promise;
  });
});
