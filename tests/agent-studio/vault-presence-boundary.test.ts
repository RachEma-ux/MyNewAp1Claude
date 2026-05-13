// Vault presence — V2 Phase CRDT-α first slice tests.
//
// Covers:
//   - `isPresenceStale` pure TTL predicate (boundary cases)
//   - PRESENCE_IDLE_TTL_MS lockstep with the ADR (5 min)
//   - ASDB-unavailable fall-through (no live DB)
//   - Source-scan boundary:
//     * No concurrent-write bypass of `agsNoteVersions`
//     * No graph mutation imports
//     * No raw env reads
//     * No credential-resolver imports (Plan v3 D2)
//     * No dispatchMcpToolCall imports

import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: () => null,
}));

import {
  PRESENCE_IDLE_TTL_MS,
  enterPresence,
  heartbeat,
  isPresenceStale,
  leavePresence,
  listPresence,
} from "../../server/agent-studio/services/vault/presence.js";

describe("isPresenceStale (pure TTL predicate)", () => {
  it("fresh activity is not stale", () => {
    const now = new Date("2026-05-13T20:00:00Z");
    const lastActive = new Date("2026-05-13T19:58:00Z"); // 2 min ago
    expect(isPresenceStale(lastActive, now)).toBe(false);
  });

  it("exactly at the TTL is not stale (boundary)", () => {
    const now = new Date("2026-05-13T20:00:00Z");
    const lastActive = new Date(now.getTime() - PRESENCE_IDLE_TTL_MS);
    expect(isPresenceStale(lastActive, now)).toBe(false);
  });

  it("1ms past the TTL IS stale", () => {
    const now = new Date("2026-05-13T20:00:00Z");
    const lastActive = new Date(now.getTime() - PRESENCE_IDLE_TTL_MS - 1);
    expect(isPresenceStale(lastActive, now)).toBe(true);
  });

  it("default `now` argument uses wall-clock when omitted", () => {
    const long = new Date("2024-01-01T00:00:00Z");
    expect(isPresenceStale(long)).toBe(true);
  });
});

describe("PRESENCE_IDLE_TTL_MS lockstep", () => {
  it("matches the V2 CRDT ADR — 5 minutes", () => {
    expect(PRESENCE_IDLE_TTL_MS).toBe(5 * 60 * 1000);
  });
});

describe("presence service — ASDB unavailable fall-through", () => {
  it("enterPresence returns null", async () => {
    expect(
      await enterPresence({
        noteId: 1,
        userId: 1,
        sessionToken: "tok",
      }),
    ).toBeNull();
  });

  it("heartbeat resolves without throwing", async () => {
    await expect(
      heartbeat({ noteId: 1, userId: 1, sessionToken: "tok" }),
    ).resolves.toBeUndefined();
  });

  it("leavePresence resolves without throwing", async () => {
    await expect(
      leavePresence({ noteId: 1, userId: 1, sessionToken: "tok" }),
    ).resolves.toBeUndefined();
  });

  it("listPresence returns []", async () => {
    expect(await listPresence(1)).toEqual([]);
  });
});

describe("presence service — hard-rule boundary scan", () => {
  async function readPresence(): Promise<string> {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    return readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "server/agent-studio/services/vault/presence.ts",
      ),
      "utf8",
    );
  }

  it("presence service must NOT write to agsNoteVersions (no concurrent-write bypass)", async () => {
    const src = await readPresence();
    // The CRDT ADR pins Postgres as source of truth — presence is
    // ephemeral and MUST NOT touch the canonical version table.
    // Strip comments first so the ADR-mention in the doc-block
    // doesn't false-positive (the rule is about actual code use).
    const code = src
      .split("\n")
      .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .join("\n");
    expect(
      /agsNoteVersions\b/.exec(code),
      "presence references the canonical note-version table",
    ).toBeNull();
  });

  it("presence service must NOT import neo4j-driver", async () => {
    const src = await readPresence();
    expect(/from\s+["']neo4j-driver["']/.exec(src)).toBeNull();
  });

  it("presence service must NOT import the credential resolver (Plan v3 D2)", async () => {
    const src = await readPresence();
    const code = src
      .split("\n")
      .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .join("\n");
    expect(/from\s+["'][^"']*credential-resolver/.exec(code)).toBeNull();
  });

  it("presence service must NOT import dispatchMcpToolCall", async () => {
    const src = await readPresence();
    const code = src
      .split("\n")
      .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .join("\n");
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.exec(
        code,
      ),
    ).toBeNull();
  });

  it("presence service body must NOT read process.env.*_API_KEY", async () => {
    const src = await readPresence();
    const code = src
      .split("\n")
      .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .join("\n");
    expect(/process\.env\.[A-Z_]+_API_KEY/.exec(code)).toBeNull();
  });

  it("CRDT ADR exists at the canonical path", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const adr = readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "docs/architecture/agent-studio-realtime-collab-crdt.md",
      ),
      "utf8",
    );
    expect(adr).toMatch(/CRDT/);
    expect(adr).toMatch(/Yjs/);
    expect(adr).toMatch(/Postgres/);
  });
});
