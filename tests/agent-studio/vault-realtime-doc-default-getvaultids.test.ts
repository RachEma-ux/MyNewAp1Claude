/**
 * Realtime-doc — production `getVaultIdsForUser` factory tests
 * (PR-V1-51).
 *
 * Covers `createDefaultGetVaultIdsForUser`:
 *   - happy path: closure calls repo.listVaultsForUser(userId) and
 *     projects row ids.
 *   - test seam (`getRepo` override) bypasses the lazy ASDB import.
 *   - lookup throw propagates to the caller (defensive deny in the
 *     upgrade handler downstream).
 *   - repo is cached: subsequent invocations don't re-construct.
 *   - empty rows → empty number[] (not undefined).
 *
 * Plus source-scan boundaries so the file stays inside the hard-rule
 * envelope (no credential-resolver / *_API_KEY / neo4j-driver /
 * openrouter / dispatchMcpToolCall imports, no mutation methods on
 * the repo seam).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import { createDefaultGetVaultIdsForUser } from "../../server/agent-studio/services/vault/realtime-doc-default-getvaultids.js";
import type { VaultRepository } from "../../server/agent-studio/services/vault/repository.js";

function makeStubRepo(
  rows: Array<{ id: number; name: string; slug: string }>,
): Pick<VaultRepository, "listVaultsForUser"> {
  return {
    async listVaultsForUser(_userId: number) {
      return rows;
    },
  };
}

describe("createDefaultGetVaultIdsForUser — happy path", () => {
  it("returns the row ids projected from listVaultsForUser", async () => {
    const stub = makeStubRepo([
      { id: 11, name: "Vault A", slug: "a" },
      { id: 22, name: "Vault B", slug: "b" },
      { id: 33, name: "Vault C", slug: "c" },
    ]);
    const fn = createDefaultGetVaultIdsForUser({ getRepo: () => stub });
    const ids = await fn(42);
    expect(ids).toEqual([11, 22, 33]);
  });

  it("returns empty array when the user has no vault memberships", async () => {
    const stub = makeStubRepo([]);
    const fn = createDefaultGetVaultIdsForUser({ getRepo: () => stub });
    const ids = await fn(7);
    expect(ids).toEqual([]);
  });

  it("invokes the repo with the supplied userId", async () => {
    const spy = vi.fn(async (_userId: number) => []);
    const stub: Pick<VaultRepository, "listVaultsForUser"> = {
      listVaultsForUser: spy,
    };
    const fn = createDefaultGetVaultIdsForUser({ getRepo: () => stub });
    await fn(123);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(123);
  });
});

describe("createDefaultGetVaultIdsForUser — repository caching", () => {
  it("calls the `getRepo` test seam at most once across invocations", async () => {
    const stub = makeStubRepo([{ id: 1, name: "v", slug: "v" }]);
    const getRepo = vi.fn(() => stub);
    const fn = createDefaultGetVaultIdsForUser({ getRepo });
    await fn(1);
    await fn(2);
    await fn(3);
    expect(getRepo).toHaveBeenCalledTimes(1);
  });
});

describe("createDefaultGetVaultIdsForUser — defensive throw propagation", () => {
  it("propagates a repository throw to the caller (no silent allow)", async () => {
    const boom: Pick<VaultRepository, "listVaultsForUser"> = {
      async listVaultsForUser(_userId: number) {
        throw new Error("ASDB unavailable");
      },
    };
    const fn = createDefaultGetVaultIdsForUser({ getRepo: () => boom });
    await expect(fn(99)).rejects.toThrow("ASDB unavailable");
  });
});

describe("createDefaultGetVaultIdsForUser — source-scan boundaries", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/realtime-doc-default-getvaultids.ts",
  );
  const src = readFileSync(file, "utf8");
  // Strip comments so docstring mentions of forbidden names (e.g.
  // the hard-rule list quoted in the file header) don't trip the
  // boundary checks. The checks should only fail on real code.
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

  it("only calls VaultRepository.listVaultsForUser (no mutation methods)", () => {
    const mutationMethods = [
      "createVault",
      "addMember",
      "createNote",
      "updateNote",
      "deleteNote",
    ];
    for (const m of mutationMethods) {
      expect(code.includes(`.${m}(`)).toBe(false);
    }
  });
});
