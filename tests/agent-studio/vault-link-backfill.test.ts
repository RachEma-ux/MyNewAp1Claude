/**
 * Vault — link backfill orchestrator + admin tRPC.
 *
 * Closes the prerequisite for migrating WikilinksBacklinksPanel off
 * live parsing: notes created BEFORE #1482 have no rows in
 * `ags_vault_wikilinks` / `ags_vault_embeds`. The backfill walks
 * every note in the vault and calls persistNoteLinks for its
 * latest version. REPLACE pattern means it's idempotent + safe to
 * re-run.
 *
 * Structural source-scan on the module shape + behavioral on the
 * orchestration logic (skipping notes without latest version,
 * accumulating counts, catching per-note errors without poisoning
 * the pass).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import { backfillVaultLinks } from "../../server/agent-studio/services/vault/link-persistence.js";
import type { VaultRepository } from "../../server/agent-studio/services/vault/repository.js";

// ---------------------------------------------------------------------------
// Behavioral — orchestration over DI'd repo
// ---------------------------------------------------------------------------

function buildRepoWithNotes(
  notes: Array<{ id: number; slug: string; contentMd?: string | null }>,
): VaultRepository {
  return {
    listNotesInVault: async () =>
      notes.map((n) => ({
        id: n.id,
        vaultId: 1,
        slug: n.slug,
        title: n.slug,
        currentVersionId: n.id * 10,
        governanceStatus: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    getLatestNoteVersion: async (noteId: number) => {
      const n = notes.find((x) => x.id === noteId);
      if (!n || n.contentMd == null) return null;
      return {
        id: n.id * 10,
        noteId: n.id,
        version: 1,
        contentMd: n.contentMd,
        contentHash: "",
        frontmatter: null,
        authorUserId: 1,
        createdAt: new Date(),
      };
    },
  } as unknown as VaultRepository;
}

describe("backfillVaultLinks — orchestration", () => {
  it("skips notes with no latest version (notesSkipped++)", async () => {
    const repo = buildRepoWithNotes([
      { id: 10, slug: "alpha", contentMd: null }, // no version
      { id: 11, slug: "beta", contentMd: null },
    ]);

    const result = await backfillVaultLinks({ vaultId: 1, repo });

    expect(result.notesProcessed).toBe(0);
    expect(result.notesSkipped).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it("processed/skipped counts are accumulators across the pass", async () => {
    const repo = buildRepoWithNotes([
      { id: 10, slug: "alpha", contentMd: "[[beta]]" },
      { id: 11, slug: "beta", contentMd: "[[alpha]]" },
      { id: 12, slug: "gamma", contentMd: null }, // skipped
    ]);
    // DI persistFn to avoid hitting ASDB; return a fixed counts payload
    // so the accumulators can be observed.
    const persistFn = async () => ({
      wikilinksWritten: 1,
      embedsWritten: 0,
      wikilinksDeleted: 0,
      embedsDeleted: 0,
    });

    const result = await backfillVaultLinks({ vaultId: 1, repo, persistFn });

    expect(result.notesProcessed).toBe(2);
    expect(result.notesSkipped).toBe(1);
    expect(result.wikilinksWritten).toBe(2);
  });

  it("per-note error is captured and the pass continues", async () => {
    let callCount = 0;
    const repo = {
      listNotesInVault: async () => [
        { id: 1, vaultId: 1, slug: "a", title: "a", currentVersionId: 10, governanceStatus: "active", createdAt: new Date(), updatedAt: new Date() },
        { id: 2, vaultId: 1, slug: "b", title: "b", currentVersionId: 20, governanceStatus: "active", createdAt: new Date(), updatedAt: new Date() },
      ],
      getLatestNoteVersion: async (noteId: number) => {
        callCount++;
        if (noteId === 1) throw new Error("simulated db failure on note 1");
        return {
          id: 20,
          noteId,
          version: 1,
          contentMd: "ok",
          contentHash: "",
          frontmatter: null,
          authorUserId: 1,
          createdAt: new Date(),
        };
      },
    } as unknown as VaultRepository;
    const persistFn = async () => ({
      wikilinksWritten: 0,
      embedsWritten: 0,
      wikilinksDeleted: 0,
      embedsDeleted: 0,
    });

    const result = await backfillVaultLinks({ vaultId: 1, repo, persistFn });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.noteId).toBe(1);
    expect(result.errors[0]!.error).toContain("simulated db failure");
    // The pass continued to note 2.
    expect(callCount).toBe(2);
  });

  it("respects the limit parameter (caps notes-listed)", async () => {
    let seenLimit: number | undefined;
    const repo = {
      listNotesInVault: async (_v: number, opts?: { limit?: number }) => {
        seenLimit = opts?.limit;
        return [];
      },
    } as unknown as VaultRepository;

    await backfillVaultLinks({ vaultId: 1, repo, limit: 250 });
    expect(seenLimit).toBe(250);
  });

  it("default limit is 1000 when not supplied", async () => {
    let seenLimit: number | undefined;
    const repo = {
      listNotesInVault: async (_v: number, opts?: { limit?: number }) => {
        seenLimit = opts?.limit;
        return [];
      },
    } as unknown as VaultRepository;

    await backfillVaultLinks({ vaultId: 1, repo });
    expect(seenLimit).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Structural — admin tRPC wiring
// ---------------------------------------------------------------------------

const ROUTER = resolve(
  __dirname,
  "../../server/agent-studio/services/vault/router.ts",
);
const routerSrc = readFileSync(ROUTER, "utf8");

describe("router — backfillLinks admin tRPC", () => {
  it("imports adminProcedure from the trpc core", () => {
    expect(routerSrc).toMatch(
      /import\s*\{[^}]*adminProcedure[\s\S]*?\}\s*from\s*["'][^"']*_core\/trpc/,
    );
  });

  it("declares `backfillLinks` as an admin mutation", () => {
    expect(routerSrc).toMatch(
      /backfillLinks:\s*adminProcedure[\s\S]*?\.mutation\(/,
    );
  });

  it("caps limit at 10_000 (admin safety)", () => {
    expect(routerSrc).toMatch(
      /backfillLinks:[\s\S]*?\.max\(10_000\)/,
    );
  });

  it("validates vaultId as positive integer", () => {
    expect(routerSrc).toMatch(
      /backfillLinks:[\s\S]*?vaultId:\s*z\.number\(\)\.int\(\)\.positive\(\)/,
    );
  });

  it("delegates to the link-persistence module via lazy import", () => {
    expect(routerSrc).toMatch(
      /backfillLinks:[\s\S]*?await import\(\s*["']\.\/link-persistence\.js["']\s*\)/,
    );
  });
});
