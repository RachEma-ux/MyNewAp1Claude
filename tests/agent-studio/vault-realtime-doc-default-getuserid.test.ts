/**
 * Realtime-doc — production `getUserIdFromUpgradeRequest` factory
 * tests (PR-V1-52).
 *
 * Covers `createDefaultGetUserIdFromUpgradeRequest`:
 *   - Authenticated path: closure returns `user.id`.
 *   - Unauthenticated path: authenticator returns null → closure
 *     returns null (no throw out of the resolver).
 *   - Auth throw: closure returns null (defensive deny — never
 *     silently allow).
 *   - Custom seam used exactly once per upgrade.
 *   - Source-scan boundaries (no credential-resolver,
 *     dispatchMcpToolCall, *_API_KEY, neo4j-driver, openrouter).
 *   - The resolver's return type accepts async — the bridge's
 *     widened signature works with the closure.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import type { IncomingMessage } from "http";
import { describe, expect, it, vi } from "vitest";

import { createDefaultGetUserIdFromUpgradeRequest } from "../../server/agent-studio/services/vault/realtime-doc-default-getuserid.js";

function fakeReq(): IncomingMessage {
  // Only the cookie field matters; the resolver passes through to
  // the authenticator without inspecting other fields.
  return { headers: { cookie: "session=stub" } } as unknown as IncomingMessage;
}

describe("createDefaultGetUserIdFromUpgradeRequest — authenticated path", () => {
  it("returns user.id when authenticator resolves with a user", async () => {
    const fn = createDefaultGetUserIdFromUpgradeRequest({
      authenticate: async () => ({ id: 42 }),
    });
    expect(await fn(fakeReq())).toBe(42);
  });

  it("invokes the authenticator with the upgrade request", async () => {
    const spy = vi.fn(async (_r: IncomingMessage) => ({ id: 1 }));
    const fn = createDefaultGetUserIdFromUpgradeRequest({ authenticate: spy });
    const req = fakeReq();
    await fn(req);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(req);
  });
});

describe("createDefaultGetUserIdFromUpgradeRequest — unauthenticated path", () => {
  it("returns null when authenticator resolves to null", async () => {
    const fn = createDefaultGetUserIdFromUpgradeRequest({
      authenticate: async () => null,
    });
    expect(await fn(fakeReq())).toBeNull();
  });
});

describe("createDefaultGetUserIdFromUpgradeRequest — defensive deny on throw", () => {
  it("returns null when authenticator throws", async () => {
    const fn = createDefaultGetUserIdFromUpgradeRequest({
      authenticate: async () => {
        throw new Error("Invalid session cookie");
      },
    });
    expect(await fn(fakeReq())).toBeNull();
  });

  it("returns null when authenticator throws synchronously (cast safety)", async () => {
    const fn = createDefaultGetUserIdFromUpgradeRequest({
      // Sync-throwing function is legal under the `AuthenticateUpgradeRequestFn`
      // promise-returning contract; the closure must still catch.
      authenticate: (() => {
        throw new Error("sync boom");
      }) as unknown as Parameters<
        typeof createDefaultGetUserIdFromUpgradeRequest
      >[0]["authenticate"],
    });
    expect(await fn(fakeReq())).toBeNull();
  });
});

describe("createDefaultGetUserIdFromUpgradeRequest — return type allows async", () => {
  it("matches the widened bridge signature (sync OR async return)", async () => {
    const fn = createDefaultGetUserIdFromUpgradeRequest({
      authenticate: async () => ({ id: 7 }),
    });
    // The bridge's getUserIdFromUpgradeRequest signature accepts
    // `number | null | Promise<number | null>` — the closure
    // returns the Promise variant, which is the production shape.
    const result: number | null | Promise<number | null> = fn(fakeReq());
    expect(await result).toBe(7);
  });
});

describe("createDefaultGetUserIdFromUpgradeRequest — source-scan boundaries", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/realtime-doc-default-getuserid.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");

  it("does not import credential-resolver", () => {
    expect(/from\s+["'][^"']*credential-resolver/.test(code)).toBe(false);
  });

  it("does not import or call dispatchMcpToolCall", () => {
    expect(/dispatchMcpToolCall\s*\(/.test(code)).toBe(false);
    expect(/import[^;]*dispatchMcpToolCall/.test(code)).toBe(false);
  });

  it("does not read *_API_KEY env vars", () => {
    expect(/process\.env\.[A-Z_]*API_KEY/.test(code)).toBe(false);
  });

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });

  it("does not import openrouter", () => {
    expect(/from\s+["'][^"']*openrouter/.test(code)).toBe(false);
  });
});
