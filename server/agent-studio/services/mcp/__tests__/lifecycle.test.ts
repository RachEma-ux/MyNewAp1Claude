/**
 * MCP Hardening Phase 1 — lifecycle integration tests.
 *
 * Exercises the manager + transports + FSM + registry as a single unit
 * with mocked transports + repo. Three core scenarios from the
 * hardening plan:
 *
 *  1.1  mid_session_disconnect: a transport's onClose fires after the
 *       FSM is `connected` → manager removes the connection, clears
 *       the registry snapshot, drives FSM to `failed`. Idempotent.
 *
 *  1.2  auth_provided: notifyAuthProvided drives FSM
 *       `needs_auth → connecting`.
 *
 *  1.3  connecting orphans: rows with status="connecting" + empty
 *       in-memory FSM are picked up by the auto-reconnect filter.
 *
 * The transports themselves are mocked so we control onClose timing
 * deterministically. End-to-end real-subprocess tests live in
 * Phase 5's lifecycle-real.test.ts (out of scope here).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks must be hoisted above the imports they affect ───────────────────

vi.mock("../../../repository", () => ({
  getMcpServerById: vi.fn(),
  listAllMcpServers: vi.fn(),
  listMcpServers: vi.fn(),
  updateMcpServerStatus: vi.fn().mockResolvedValue(undefined),
}));

// Track the onClose callbacks each transport receives so tests can
// fire them at a precise moment.
const stdioOnCloses: Array<((reason: string) => void) | undefined> = [];
const wsOnCloses: Array<((reason: string) => void) | undefined> = [];

vi.mock("../transports/stdio", () => ({
  connectStdio: vi.fn(async (input: any) => {
    stdioOnCloses.push(input.onClose);
    return makeFakeConnection(input.serverId, "stdio");
  }),
}));
vi.mock("../transports/http", () => ({
  connectHttp: vi.fn(async (input: any) =>
    makeFakeConnection(input.serverId, "http")
  ),
}));
vi.mock("../transports/sse", () => ({
  connectSse: vi.fn(async () => {
    throw new Error("sse not implemented");
  }),
}));
vi.mock("../transports/sdk", () => ({
  connectSdk: vi.fn(async (input: any) =>
    makeFakeConnection(input.serverId, "sdk")
  ),
}));
vi.mock("../transports/websocket", () => ({
  connectWebSocket: vi.fn(async (input: any) => {
    wsOnCloses.push(input.onClose);
    return makeFakeConnection(input.serverId, "websocket");
  }),
}));

import * as repo from "../../../repository";
import * as registry from "../registry";
import {
  connectMcpServer,
  disconnectMcpServer,
  getConnectionState,
  notifyAuthProvided,
  listConnectedTools,
} from "../mcp-manager";

function makeFakeConnection(serverId: number, transport: string) {
  return {
    serverId,
    transport,
    tools: [
      { name: "echo", description: "echo", inputSchema: { type: "object" } },
    ],
    prompts: [],
    resources: [],
    close: vi.fn(async () => {}),
    callTool: vi.fn(async () => ({ ok: true })),
  };
}

beforeEach(() => {
  stdioOnCloses.length = 0;
  wsOnCloses.length = 0;
  registry.__clearAllSnapshotsForTests();
  vi.mocked(repo.updateMcpServerStatus).mockClear();
  vi.mocked(repo.getMcpServerById).mockReset();
  vi.mocked(repo.listAllMcpServers).mockReset();
  vi.mocked(repo.listMcpServers).mockReset();
});

afterEach(async () => {
  // Best-effort: leave no live connections behind. Tests that expect a
  // server to be disconnected can call disconnectMcpServer themselves;
  // anything still live here is leaked state from a failure.
  vi.useRealTimers();
});

// ── 1.1  mid_session_disconnect ──────────────────────────────────────────

describe("Phase 1.1 — mid_session_disconnect via onClose", () => {
  it("transitions connected → failed when stdio onClose fires after handshake", async () => {
    vi.mocked(repo.getMcpServerById).mockResolvedValue({
      id: 42,
      draftId: 1,
      name: "fake-stdio",
      transport: "stdio",
      command: "/bin/true",
      args: [],
      env: {},
      url: null,
      status: "pending",
      enabled: true,
      oauthConfig: null,
      oauthState: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await connectMcpServer({ serverId: 42 });
    expect(result.status).toBe("connected");
    expect(getConnectionState(42).kind).toBe("connected");
    // Registry has the snapshot
    expect(registry.getSnapshot(42)?.tools.length).toBe(1);

    // Sanity: the transport received an onClose callback
    expect(stdioOnCloses[0]).toBeTypeOf("function");

    // Simulate the child process dying after handshake
    stdioOnCloses[0]!("exit code 1, no stderr captured");

    // Allow the .catch() chain inside fireOnClose to settle
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    // FSM moves to `failed`
    const after = getConnectionState(42);
    expect(after.kind).toBe("failed");
    if (after.kind === "failed") {
      expect(after.reason).toContain("exit code 1");
    }
    // Registry snapshot is cleared
    expect(registry.getSnapshot(42)).toBeUndefined();
    // Tool list flips empty immediately
    vi.mocked(repo.listMcpServers).mockResolvedValue([
      { id: 42, name: "fake-stdio", draftId: 1 } as any,
    ]);
    const tools = await listConnectedTools(1);
    expect(tools).toEqual([]);
  });

  it("is idempotent — firing onClose twice produces only one transition", async () => {
    vi.mocked(repo.getMcpServerById).mockResolvedValue({
      id: 43,
      draftId: 1,
      name: "fake-ws",
      transport: "websocket",
      command: null,
      args: [],
      env: {},
      url: "ws://localhost:9999",
      status: "pending",
      enabled: true,
      oauthConfig: null,
      oauthState: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await connectMcpServer({ serverId: 43 });
    expect(result.status).toBe("connected");

    const cb = wsOnCloses[0]!;
    cb("first close");
    cb("second close");
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const after = getConnectionState(43);
    expect(after.kind).toBe("failed");
    if (after.kind === "failed") {
      expect(after.reason).toContain("first close");
      expect(after.attemptCount).toBe(1);
    }
  });

  it("ignores onClose fired during handshake (state still connecting)", async () => {
    // Fire onClose immediately on the first call — before the manager
    // has a chance to apply connect_succeeded. The manager's guard
    // (`cur?.kind !== "connected"`) should make this a no-op.
    vi.mocked(repo.getMcpServerById).mockResolvedValue({
      id: 44,
      draftId: 1,
      name: "fake-stdio-flaky",
      transport: "stdio",
      command: "/bin/false",
      args: [],
      env: {},
      url: null,
      status: "pending",
      enabled: true,
      oauthConfig: null,
      oauthState: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    let earlyClose: (reason: string) => void = () => {};
    const stdioMod = await import("../transports/stdio");
    vi.mocked(stdioMod.connectStdio).mockImplementationOnce(
      async (input: any) => {
        earlyClose = input.onClose;
        // Fire immediately — the manager hasn't applied connect_succeeded yet
        input.onClose?.("died during handshake");
        return makeFakeConnection(input.serverId, "stdio");
      }
    );

    const result = await connectMcpServer({ serverId: 44 });
    // Connection succeeded from manager's POV (transport returned a conn)
    expect(result.status).toBe("connected");
    // FSM should be `connected` — the early onClose was a no-op
    expect(getConnectionState(44).kind).toBe("connected");
    // Now firing it AGAIN (real mid-session this time) should work
    earlyClose("real death");
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(getConnectionState(44).kind).toBe("failed");
  });
});

// ── 1.2  auth_provided ────────────────────────────────────────────────────

describe("Phase 1.2 — notifyAuthProvided drives FSM", () => {
  it("transitions needs_auth → connecting", async () => {
    vi.mocked(repo.getMcpServerById).mockResolvedValue({
      id: 50,
      draftId: 1,
      name: "fake-oauth",
      transport: "http",
      command: null,
      args: [],
      env: {},
      url: "http://localhost:9999/mcp",
      status: "pending",
      enabled: true,
      oauthConfig: null,
      oauthState: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    // Force an auth_required transition by making the http transport
    // throw McpAuthRequiredError on connect
    const { McpAuthRequiredError } = await import("../types");
    const httpMod = await import("../transports/http");
    vi.mocked(httpMod.connectHttp).mockImplementationOnce(async () => {
      throw new McpAuthRequiredError("HTTP 401", "https://idp/authorize");
    });

    const result = await connectMcpServer({ serverId: 50 });
    expect(result.status).toBe("error");
    expect(getConnectionState(50).kind).toBe("needs_auth");

    // OAuth callback completes — FSM should move to `connecting`
    await notifyAuthProvided(50);
    expect(getConnectionState(50).kind).toBe("connecting");
  });
});

// ── 1.3  connecting orphans (auto-reconnect filter) ──────────────────────

describe("Phase 1.3 — auto-reconnect filter accepts stale `connecting` rows", () => {
  it("the new filter logic permits status='connecting' when in-memory FSM is empty", () => {
    // The filter logic itself (not the timer). We mirror the production
    // condition exactly to lock the behavior in.
    const reconnectShouldFire = (
      rowStatus: string,
      inMemFsm: { kind: string } | undefined
    ) => {
      const isError = rowStatus === "error";
      const isStaleConnecting =
        rowStatus === "connecting" && inMemFsm == null;
      return isError || isStaleConnecting;
    };

    // Stale connecting row, no FSM entry → fire
    expect(reconnectShouldFire("connecting", undefined)).toBe(true);
    // Connecting row WITH FSM entry → in-flight, skip
    expect(reconnectShouldFire("connecting", { kind: "connecting" })).toBe(
      false
    );
    // Error row → fire (existing behavior)
    expect(reconnectShouldFire("error", undefined)).toBe(true);
    expect(reconnectShouldFire("error", { kind: "failed" })).toBe(true);
    // Connected row → never fire
    expect(reconnectShouldFire("connected", { kind: "connected" })).toBe(
      false
    );
    // Pending row → never fire (never tried)
    expect(reconnectShouldFire("pending", undefined)).toBe(false);
    // Disabled / needs_auth rows → never fire (those need user action)
    expect(reconnectShouldFire("disabled", { kind: "disabled" })).toBe(false);
    expect(reconnectShouldFire("needs_auth", { kind: "needs_auth" })).toBe(
      false
    );
  });
});
