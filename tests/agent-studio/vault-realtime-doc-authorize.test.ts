/**
 * authorizeRealtimeDocConnection — V1+ CRDT-γ-3-auth (PR-V1-36).
 *
 * Covers:
 *   - Closed deny-reason taxonomy (3 values)
 *   - allow: true when sessionKey.vaultId ∈ getVaultIdsForUser(userId)
 *   - allow: false / "not_a_vault_member" when vaultId not in user's list
 *   - allow: false / "missing_user_id" when userId is null OR undefined
 *   - allow: false / "vault_membership_lookup_failed" when DI throws
 *     (load-bearing: NEVER silent-approve on lookup failure)
 *   - Lookup called exactly once with the userId (no double-fetch)
 *   - Lookup NOT called when userId is missing (cheap short-circuit)
 *   - Source-scan boundary
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import {
  REALTIME_DOC_AUTHORIZATION_DENY_REASONS,
  authorizeRealtimeDocConnection,
  type GetVaultIdsForUserFn,
} from "../../server/agent-studio/services/vault/realtime-doc-authorize.js";

const KEY = { vaultId: 7, noteId: 42 } as const;

describe("REALTIME_DOC_AUTHORIZATION_DENY_REASONS taxonomy", () => {
  it("is a closed 3-value union", () => {
    expect([...REALTIME_DOC_AUTHORIZATION_DENY_REASONS]).toEqual([
      "missing_user_id",
      "not_a_vault_member",
      "vault_membership_lookup_failed",
    ]);
  });
});

describe("authorizeRealtimeDocConnection — allow path", () => {
  it("returns allow:true when vaultId ∈ getVaultIdsForUser(userId)", async () => {
    const lookup: GetVaultIdsForUserFn = vi.fn(async () => [3, 7, 9]);
    const res = await authorizeRealtimeDocConnection({
      sessionKey: KEY,
      userId: 100,
      getVaultIdsForUser: lookup,
    });
    expect(res).toEqual({ allow: true });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(100);
  });

  it("works for a single-vault user (boundary case)", async () => {
    const res = await authorizeRealtimeDocConnection({
      sessionKey: KEY,
      userId: 100,
      getVaultIdsForUser: async () => [7],
    });
    expect(res).toEqual({ allow: true });
  });
});

describe("authorizeRealtimeDocConnection — deny paths", () => {
  it("returns not_a_vault_member when vaultId is NOT in the user's list", async () => {
    const res = await authorizeRealtimeDocConnection({
      sessionKey: KEY,
      userId: 100,
      getVaultIdsForUser: async () => [3, 5, 9],
    });
    expect(res).toEqual({ allow: false, reason: "not_a_vault_member" });
  });

  it("returns not_a_vault_member for an empty membership list", async () => {
    const res = await authorizeRealtimeDocConnection({
      sessionKey: KEY,
      userId: 100,
      getVaultIdsForUser: async () => [],
    });
    expect(res).toEqual({ allow: false, reason: "not_a_vault_member" });
  });

  it("returns missing_user_id when userId is null", async () => {
    const lookup = vi.fn();
    const res = await authorizeRealtimeDocConnection({
      sessionKey: KEY,
      userId: null,
      getVaultIdsForUser: lookup as GetVaultIdsForUserFn,
    });
    expect(res).toEqual({ allow: false, reason: "missing_user_id" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns missing_user_id when userId is undefined", async () => {
    const lookup = vi.fn();
    const res = await authorizeRealtimeDocConnection({
      sessionKey: KEY,
      userId: undefined,
      getVaultIdsForUser: lookup as GetVaultIdsForUserFn,
    });
    expect(res).toEqual({ allow: false, reason: "missing_user_id" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns vault_membership_lookup_failed when DI throws (defensive deny — load-bearing)", async () => {
    const res = await authorizeRealtimeDocConnection({
      sessionKey: KEY,
      userId: 100,
      getVaultIdsForUser: async () => {
        throw new Error("DB down");
      },
    });
    expect(res).toEqual({
      allow: false,
      reason: "vault_membership_lookup_failed",
    });
  });

  it("returns vault_membership_lookup_failed on synchronous throw too", async () => {
    const res = await authorizeRealtimeDocConnection({
      sessionKey: KEY,
      userId: 100,
      getVaultIdsForUser: () => {
        throw new Error("sync throw");
      },
    });
    expect(res).toEqual({
      allow: false,
      reason: "vault_membership_lookup_failed",
    });
  });
});

describe("authorizeRealtimeDocConnection — DI lookup invocation", () => {
  it("invokes the lookup exactly once with the userId (no double-fetch)", async () => {
    const lookup = vi.fn(async (uid: number) => {
      expect(uid).toBe(100);
      return [7];
    });
    await authorizeRealtimeDocConnection({
      sessionKey: KEY,
      userId: 100,
      getVaultIdsForUser: lookup as GetVaultIdsForUserFn,
    });
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});

describe("source-scan boundary", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/realtime-doc-authorize.ts",
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

  it("does not import drizzle-orm (pure authorization rule)", () => {
    expect(/from\s+["']drizzle-orm/.test(src)).toBe(false);
  });

  it("does not import the vault repository (closure DI seam only)", () => {
    expect(/from\s+["'][^"']*vault\/repository/.test(src)).toBe(false);
  });
});
