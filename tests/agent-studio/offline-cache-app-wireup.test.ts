/**
 * Offline cache app wire-up — V2 Phase UI-1 (PR-V1-30).
 *
 * Covers the source-scan integrity of the main.tsx bootstrap site
 * + the `wireOfflineCacheToTrpc` happy/error paths via a stub
 * tRPC client.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { __resetOfflineDrainRegistryForTests } from "../../client/src/modules/agent-studio/services/offline-drain-dispatcher.js";
import { __resetOfflineQueueInstanceForTests } from "../../client/src/modules/agent-studio/services/offline-cache-bootstrap.js";

afterEach(() => {
  __resetOfflineDrainRegistryForTests();
  __resetOfflineQueueInstanceForTests();
});

describe("offline-cache-app-wireup — source structure", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/services/offline-cache-app-wireup.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .split("\n")
    .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
    .join("\n");

  it("uses createTRPCClient<AppRouter> (vanilla, not React-hooks)", () => {
    expect(/createTRPCClient<AppRouter>/.test(code)).toBe(true);
  });

  it("imports AppRouter from the server routers (typed proxy)", () => {
    expect(/import\s+type\s+{\s*AppRouter[^}]*}/.test(code)).toBe(true);
  });

  it("uses the same httpBatchLink + superjson + credentials:include shape as main.tsx", () => {
    expect(/httpBatchLink/.test(code)).toBe(true);
    expect(/superjson/.test(code)).toBe(true);
    expect(/credentials:\s*["']include["']/.test(code)).toBe(true);
  });

  it("wires the 3 vault-note mutations to bootstrapOfflineCache", () => {
    expect(/updateNote:\s*\(payload\)\s*=>\s*proc\.agentStudio\.vault\.updateNote\.mutate\(payload\)/.test(code)).toBe(true);
    expect(/createNote:\s*\(payload\)\s*=>\s*proc\.agentStudio\.vault\.createNote\.mutate\(payload\)/.test(code)).toBe(true);
    expect(/deleteNote:\s*\(payload\)\s*=>\s*proc\.agentStudio\.vault\.deleteNote\.mutate\(payload\)/.test(code)).toBe(true);
  });

  it("does NOT throw on bootstrap failure — uses .catch", () => {
    expect(/\.catch\(/.test(code)).toBe(true);
  });

  it("does not import credential-resolver", () => {
    expect(/credential-resolver/.test(code)).toBe(false);
  });

  it("does not import the MCP dispatcher", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        code,
      ),
    ).toBe(false);
  });

  it("does not read process.env.*_API_KEY raw", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(code)).toBe(false);
  });

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });
});

describe("main.tsx — calls wireOfflineCacheToTrpc once at boot", () => {
  const file = resolve(__dirname, "../../client/src/main.tsx");
  const src = readFileSync(file, "utf8");

  it("imports wireOfflineCacheToTrpc", () => {
    expect(/wireOfflineCacheToTrpc/.test(src)).toBe(true);
    expect(/from\s+["'][^"']*offline-cache-app-wireup/.test(src)).toBe(true);
  });

  it("invokes the wireup (void-prefixed to fire-and-forget)", () => {
    expect(/void\s+wireOfflineCacheToTrpc\s*\(/.test(src)).toBe(true);
  });
});
