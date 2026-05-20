/**
 * No-Deferral continuation-9 slice 60 — vault/presence.ts listPresence
 * caller-migration source-scan lockstep.
 *
 * Extends the PR-V1-132 Path-A migration (which covered heartbeat /
 * removePresence / updatePresence) to cover the last remaining
 * `getAsDb()` call site in `services/vault/presence.ts`. The reused
 * helper `resolveNoteRoutedConn` already does the noteId → vaultId →
 * workspaceId chain — `listPresence` now rides it for both the
 * eviction DELETE and the listing SELECT.
 *
 * Source-scan only — behavioral correctness is exercised by the
 * existing presence integration tests + region-routing tests on
 * `getAsDbForWorkspace` itself.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const SERVICE = join(
  resolve(__dirname, "../.."),
  "server/agent-studio/services/vault/presence.ts",
);

const src = readFileSync(SERVICE, "utf8");

describe("slice 60 — listPresence caller migration", () => {
  it("listPresence uses lookupDb → resolveNoteRoutedConn pattern", () => {
    const block = src.match(
      /export async function listPresence[\s\S]+?\n\}\n/,
    );
    expect(block).not.toBeNull();
    const body = block?.[0] ?? "";
    expect(/const lookupDb = getAsDb\(\);/.test(body)).toBe(true);
    expect(
      /const db = await resolveNoteRoutedConn\(lookupDb,\s*noteId\)/.test(body),
    ).toBe(true);
  });

  it("listPresence eviction DELETE rides the routed db handle", () => {
    const block = src.match(
      /export async function listPresence[\s\S]+?\n\}\n/,
    );
    const body = block?.[0] ?? "";
    expect(/await db\s*\n?\s*\.delete\(agsVaultNotePresence\)/.test(body)).toBe(
      true,
    );
  });

  it("listPresence listing SELECT rides the same routed db handle", () => {
    const block = src.match(
      /export async function listPresence[\s\S]+?\n\}\n/,
    );
    const body = block?.[0] ?? "";
    expect(
      /const rows = await db\s*\n?\s*\.select\(\)\s*\n?\s*\.from\(agsVaultNotePresence\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("no raw getAsDb() calls remain (all 4 are lookupDb assignments)", () => {
    const code = src
      .split("\n")
      .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .map((l) => l.replace(/`[^`]*`/g, ""))
      .join("\n");
    const directCalls = code.match(/getAsDb\(\)/g) ?? [];
    expect(directCalls.length).toBe(4);
    // Every direct call should be paired with a `lookupDb =`
    // assignment — sanity check.
    const lookupDbAssignments = code.match(
      /const lookupDb = getAsDb\(\);/g,
    ) ?? [];
    expect(lookupDbAssignments.length).toBe(4);
  });
});
