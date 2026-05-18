/**
 * Track A — A8 — Initial backfill (auto-fire + shared helper).
 *
 * Exercises the consolidated `runInitialBackfill` helper that both
 * the manual `triggerInitialBackfill` tRPC path and the auto-fire-
 * on-first-enable path in `setFsSyncPath` go through.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runInitialBackfill } from "../../server/agent-studio/services/vault/fs-sync-integration";
import { VaultRepositoryStub } from "../../server/agent-studio/services/vault/repository";

let tmpRoot: string;
let repo: VaultRepositoryStub;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "vault-fs-sync-backfill-"));
  repo = new VaultRepositoryStub();
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

async function seedVaultWithNotes(count: number, vaultId = 1): Promise<void> {
  for (let i = 1; i <= count; i++) {
    await repo.createNote(
      {
        vaultId,
        slug: `note-${i}`,
        title: `Note ${i}`,
        contentMd: `# Note ${i}\n\nBody ${i}.`,
        frontmatter: {},
      },
      99,
    );
  }
}

describe("A8 — runInitialBackfill", () => {
  it("returns null when fs_sync_path is not set", async () => {
    await seedVaultWithNotes(3);
    const r = await runInitialBackfill(repo, 1);
    expect(r).toBeNull();
  });

  it("writes every note to disk on first run", async () => {
    await seedVaultWithNotes(3);
    await repo.setVaultFsSyncPath(1, tmpRoot);
    const r = await runInitialBackfill(repo, 1);
    expect(r).not.toBeNull();
    expect(r!.notesTotal).toBe(3);
    expect(r!.written).toBe(3);
    expect(r!.skippedEcho).toBe(0);
    const files = (await readdir(tmpRoot)).sort();
    expect(files).toEqual(["note-1.md", "note-2.md", "note-3.md"]);
  });

  it("persists fs_sync_last_hash for every written note", async () => {
    await seedVaultWithNotes(2);
    await repo.setVaultFsSyncPath(1, tmpRoot);
    await runInitialBackfill(repo, 1);
    for (const slug of ["note-1", "note-2"]) {
      const lookup = await repo.findNoteBySlugInVault(1, slug);
      expect(lookup?.fsSyncLastHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("idempotent: re-running skips all notes via echo guard", async () => {
    await seedVaultWithNotes(2);
    await repo.setVaultFsSyncPath(1, tmpRoot);
    const first = await runInitialBackfill(repo, 1);
    expect(first!.written).toBe(2);
    const second = await runInitialBackfill(repo, 1);
    expect(second!.written).toBe(0);
    expect(second!.skippedEcho).toBe(2);
  });

  it("written .md files contain the FS-sync frontmatter (title + slug + version)", async () => {
    await seedVaultWithNotes(1);
    await repo.setVaultFsSyncPath(1, tmpRoot);
    await runInitialBackfill(repo, 1);
    const content = await readFile(join(tmpRoot, "note-1.md"), "utf8");
    expect(content).toContain("title: Note 1");
    expect(content).toContain("slug: note-1");
    expect(content).toMatch(/version:\s*\d+/);
    expect(content).toContain("# Note 1");
  });

  it("aggregates an empty result for a vault with zero notes", async () => {
    await repo.setVaultFsSyncPath(1, tmpRoot);
    const r = await runInitialBackfill(repo, 1);
    expect(r).not.toBeNull();
    expect(r!.notesTotal).toBe(0);
    expect(r!.written).toBe(0);
    expect(r!.errors).toEqual([]);
  });
});

describe("A8 — router wiring (source-scan)", () => {
  it("setFsSyncPath returns autoBackfillFired + priorPath in the response", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/vault/router.ts",
      ),
      "utf8",
    );
    expect(src).toContain("autoBackfillFired:");
    expect(src).toContain("priorPath");
    // The auto-fire branch is gated on priorPath === null AND
    // input.path !== null — lock the predicate.
    expect(src).toMatch(/priorPath === null && input\.path !== null/);
  });

  it("triggerInitialBackfill delegates to runInitialBackfill (no duplication)", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/vault/router.ts",
      ),
      "utf8",
    );
    // The triggerInitialBackfill body should now be a thin wrapper
    // around runInitialBackfill, not a re-implementation. The old
    // inline materializeNotes call should be gone from this proc.
    const triggerBlock =
      src.match(/triggerInitialBackfill:[\s\S]*?\}\),/)?.[0] ?? "";
    expect(triggerBlock).toContain("runInitialBackfill(repo");
    expect(triggerBlock).not.toContain("materializeNotes(");
  });
});
