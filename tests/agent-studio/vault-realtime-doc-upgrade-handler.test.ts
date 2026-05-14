/**
 * handleRealtimeDocUpgrade — V1+ CRDT-γ-3-upgrade-handler (PR-V1-37).
 *
 * Covers:
 *   - REALTIME_DOC_DENY_CLOSE_CODES taxonomy (4401 / 4403 / 4500)
 *   - allow → transport.attachConnection invoked with sessionKey;
 *     returns { attached: true, disposer }
 *   - deny → conn.close(code, reason) invoked; NO attach; returns
 *     { attached: false, reason, closeCode }
 *   - getVaultIdsForUser default-authorize path is exercised
 *     end-to-end (no `authorize` override)
 *   - Must supply either `authorize` or `getVaultIdsForUser` (throws
 *     when neither)
 *   - conn.close failure tolerated (close-then-throw race)
 *   - Source-scan boundary
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REALTIME_DOC_DENY_CLOSE_CODES,
  handleRealtimeDocUpgrade,
  type AuthorizeRealtimeDocConnectionFn,
  type HandleRealtimeDocUpgradeInput,
} from "../../server/agent-studio/services/vault/realtime-doc-upgrade-handler.js";
import type {
  RealtimeDocConnection,
  RealtimeDocTransport,
} from "../../server/agent-studio/services/vault/realtime-doc-transport.js";
import { __resetRealtimeDocTransportForTests } from "../../server/agent-studio/services/vault/realtime-doc-transport.js";

afterEach(() => {
  __resetRealtimeDocTransportForTests();
});

function fakeConnection(): RealtimeDocConnection & {
  closeCalls: Array<{ code?: number; reason?: string }>;
  sentMessages: Uint8Array[];
} {
  const closeCalls: Array<{ code?: number; reason?: string }> = [];
  const sentMessages: Uint8Array[] = [];
  const handlers: { message?: Function; close?: Function } = {};
  return {
    send(data: Uint8Array) {
      sentMessages.push(data);
    },
    on(event: "message" | "close", handler: (...args: unknown[]) => void) {
      handlers[event] = handler;
    },
    close(code?: number, reason?: string) {
      closeCalls.push({ code, reason });
    },
    closeCalls,
    sentMessages,
  };
}

function fakeTransport(): Pick<RealtimeDocTransport, "attachConnection"> & {
  attachCalls: Array<{ conn: RealtimeDocConnection; sessionKey: unknown }>;
  disposerCalls: number;
} {
  const attachCalls: Array<{ conn: RealtimeDocConnection; sessionKey: unknown }> = [];
  let disposerCalls = 0;
  const transport = {
    attachConnection(
      conn: RealtimeDocConnection,
      options: { sessionKey: unknown },
    ): () => void {
      attachCalls.push({ conn, sessionKey: options.sessionKey });
      return () => {
        disposerCalls += 1;
      };
    },
    attachCalls,
    get disposerCalls() {
      return disposerCalls;
    },
  };
  return transport as unknown as Pick<
    RealtimeDocTransport,
    "attachConnection"
  > & {
    attachCalls: typeof attachCalls;
    disposerCalls: number;
  };
}

const KEY = { vaultId: 7, noteId: 42 } as const;

describe("REALTIME_DOC_DENY_CLOSE_CODES taxonomy", () => {
  it("maps the 3 deny reasons to stable WebSocket close codes", () => {
    expect(REALTIME_DOC_DENY_CLOSE_CODES.missing_user_id).toBe(4401);
    expect(REALTIME_DOC_DENY_CLOSE_CODES.not_a_vault_member).toBe(4403);
    expect(REALTIME_DOC_DENY_CLOSE_CODES.vault_membership_lookup_failed).toBe(
      4500,
    );
  });
});

describe("handleRealtimeDocUpgrade — allow path", () => {
  it("attaches via transport.attachConnection with sessionKey + returns disposer", async () => {
    const conn = fakeConnection();
    const transport = fakeTransport();
    const authorize: AuthorizeRealtimeDocConnectionFn = vi.fn(async () => ({
      allow: true,
    }));
    const res = await handleRealtimeDocUpgrade({
      conn,
      sessionKey: KEY,
      userId: 100,
      transport,
      authorize,
    });
    expect(res.attached).toBe(true);
    expect(transport.attachCalls).toHaveLength(1);
    expect(transport.attachCalls[0].conn).toBe(conn);
    expect(transport.attachCalls[0].sessionKey).toEqual(KEY);
    expect(conn.closeCalls).toEqual([]);
    if (res.attached) {
      res.disposer();
      expect(transport.disposerCalls).toBe(1);
    }
  });

  it("invokes authorize with sessionKey + userId", async () => {
    const authorize: AuthorizeRealtimeDocConnectionFn = vi.fn(async () => ({
      allow: true,
    }));
    await handleRealtimeDocUpgrade({
      conn: fakeConnection(),
      sessionKey: KEY,
      userId: 100,
      transport: fakeTransport(),
      authorize,
    });
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenCalledWith({
      sessionKey: KEY,
      userId: 100,
    });
  });
});

describe("handleRealtimeDocUpgrade — deny paths", () => {
  it.each([
    ["missing_user_id", 4401],
    ["not_a_vault_member", 4403],
    ["vault_membership_lookup_failed", 4500],
  ] as const)(
    "deny %s closes conn with code %i and the reason as message; no attach",
    async (reason, expectedCode) => {
      const conn = fakeConnection();
      const transport = fakeTransport();
      const authorize: AuthorizeRealtimeDocConnectionFn = async () => ({
        allow: false,
        reason,
      });
      const res = await handleRealtimeDocUpgrade({
        conn,
        sessionKey: KEY,
        userId: 100,
        transport,
        authorize,
      });
      expect(res).toEqual({
        attached: false,
        reason,
        closeCode: expectedCode,
      });
      expect(transport.attachCalls).toEqual([]);
      expect(conn.closeCalls).toEqual([{ code: expectedCode, reason }]);
    },
  );

  it("tolerates conn.close throwing (race against client-side abort)", async () => {
    const conn = fakeConnection();
    conn.close = () => {
      throw new Error("already closed");
    };
    const authorize: AuthorizeRealtimeDocConnectionFn = async () => ({
      allow: false,
      reason: "not_a_vault_member",
    });
    const res = await handleRealtimeDocUpgrade({
      conn,
      sessionKey: KEY,
      userId: 100,
      transport: fakeTransport(),
      authorize,
    });
    expect(res.attached).toBe(false);
    if (!res.attached) {
      expect(res.reason).toBe("not_a_vault_member");
      expect(res.closeCode).toBe(4403);
    }
  });
});

describe("handleRealtimeDocUpgrade — default-authorize wiring", () => {
  it("uses getVaultIdsForUser closure to build the default authorizer (allow path)", async () => {
    const conn = fakeConnection();
    const transport = fakeTransport();
    const lookup = vi.fn(async () => [7]);
    const res = await handleRealtimeDocUpgrade({
      conn,
      sessionKey: KEY,
      userId: 100,
      transport,
      getVaultIdsForUser: lookup,
    });
    expect(res.attached).toBe(true);
    expect(lookup).toHaveBeenCalledWith(100);
    expect(transport.attachCalls).toHaveLength(1);
  });

  it("uses getVaultIdsForUser closure → deny when vault not in list", async () => {
    const conn = fakeConnection();
    const transport = fakeTransport();
    const res = await handleRealtimeDocUpgrade({
      conn,
      sessionKey: KEY,
      userId: 100,
      transport,
      getVaultIdsForUser: async () => [1, 2, 3],
    });
    expect(res).toEqual({
      attached: false,
      reason: "not_a_vault_member",
      closeCode: 4403,
    });
    expect(transport.attachCalls).toEqual([]);
    expect(conn.closeCalls).toEqual([
      { code: 4403, reason: "not_a_vault_member" },
    ]);
  });

  it("throws when neither authorize nor getVaultIdsForUser is supplied", async () => {
    const input: HandleRealtimeDocUpgradeInput = {
      conn: fakeConnection(),
      sessionKey: KEY,
      userId: 100,
      transport: fakeTransport(),
    };
    await expect(handleRealtimeDocUpgrade(input)).rejects.toThrow(
      /authorize.*getVaultIdsForUser/,
    );
  });

  it("authorize override wins over getVaultIdsForUser when both are supplied", async () => {
    const lookup = vi.fn(async () => [7]);
    const authorize: AuthorizeRealtimeDocConnectionFn = vi.fn(async () => ({
      allow: false,
      reason: "not_a_vault_member",
    }));
    const res = await handleRealtimeDocUpgrade({
      conn: fakeConnection(),
      sessionKey: KEY,
      userId: 100,
      transport: fakeTransport(),
      authorize,
      getVaultIdsForUser: lookup,
    });
    expect(res.attached).toBe(false);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("source-scan boundary", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/realtime-doc-upgrade-handler.ts",
  );
  const src = readFileSync(file, "utf8");

  it("does not import credential-resolver", () => {
    expect(/from\s+["'][^"']*credential-resolver/.test(src)).toBe(false);
  });

  it("does not import dispatchMcpToolCall", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        src,
      ),
    ).toBe(false);
  });

  it("does not read process.env.*_API_KEY", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(src)).toBe(false);
  });

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(src)).toBe(false);
  });

  it("does not import drizzle-orm (composition module, no DB)", () => {
    expect(/from\s+["']drizzle-orm/.test(src)).toBe(false);
  });

  it("does not import the vault repository (closure DI only)", () => {
    expect(/from\s+["'][^"']*vault\/repository/.test(src)).toBe(false);
  });
});
