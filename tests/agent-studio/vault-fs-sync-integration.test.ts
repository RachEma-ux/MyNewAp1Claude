/**
 * Track A — A6 — Vault FS-sync DB ↔ FS integration tests.
 *
 * Exercises the bridge between the vault repository (stubbed) and
 * the FS-sync writer/reader (real, against a per-test tmpdir):
 *
 *  - flushNoteToDisk: DB → FS write happens after createNote /
 *    updateNote; idempotent re-runs are echo-skipped.
 *  - deleteNoteFromDisk: missing-file errors swallowed (idempotent).
 *  - handleWatcherEvent: FS-originating add/change → DB upsert with
 *    fs-sync author marker; unlink → soft-delete; echo writes
 *    short-circuited.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteNoteFromDisk,
  FS_SYNC_AUTHOR_USER_ID,
  flushNoteToDisk,
  handleWatcherEvent,
} from "../../server/agent-studio/services/vault/fs-sync-integration";
import { VaultRepositoryStub } from "../../server/agent-studio/services/vault/repository";

let tmpRoot: string;
let repo: VaultRepositoryStub;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "vault-fs-sync-integration-"));
  repo = new VaultRepositoryStub();
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

async function seedNote(opts: {
  vaultId?: number;
  slug?: string;
  title?: string;
  contentMd?: string;
} = {}) {
  const vaultId = opts.vaultId ?? 1;
  const slug = opts.slug ?? "test-note";
  const title = opts.title ?? "Test Note";
  const contentMd = opts.contentMd ?? "# Body\n\nText.";
  const note = await repo.createNote(
    { vaultId, slug, title, contentMd, frontmatter: {} },
    99,
  );
  return { ...note, vaultId, slug, title, contentMd };
}

describe("A6 — flushNoteToDisk", () => {
  it("no-ops when fs_sync_path is null", async () => {
    const note = await seedNote();
    const r = await flushNoteToDisk(repo, note.vaultId, note.id);
    expect(r.kind).toBe("skipped_disabled");
  });

  it("writes the note to disk when fs_sync_path is set", async () => {
    const note = await seedNote();
    await repo.setVaultFsSyncPath(note.vaultId, tmpRoot);
    const r = await flushNoteToDisk(repo, note.vaultId, note.id);
    expect(r.kind).toBe("written");
    if (r.kind !== "written") throw new Error("unreachable");
    expect(r.absPath).toBe(join(tmpRoot, `${note.slug}.md`));
    const onDisk = await readFile(r.absPath!, "utf8");
    expect(onDisk).toContain("# Body");
    expect(onDisk).toContain("title: Test Note");
    expect(onDisk).toContain(`slug: ${note.slug}`);
  });

  it("persists the new hash to ags_notes.fs_sync_last_hash", async () => {
    const note = await seedNote();
    await repo.setVaultFsSyncPath(note.vaultId, tmpRoot);
    await flushNoteToDisk(repo, note.vaultId, note.id);
    const lookup = await repo.findNoteBySlugInVault(note.vaultId, note.slug);
    expect(lookup?.fsSyncLastHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("skips re-writes when hash unchanged (echo skip)", async () => {
    const note = await seedNote();
    await repo.setVaultFsSyncPath(note.vaultId, tmpRoot);
    const first = await flushNoteToDisk(repo, note.vaultId, note.id);
    expect(first.kind).toBe("written");
    const second = await flushNoteToDisk(repo, note.vaultId, note.id);
    expect(second.kind).toBe("skipped_echo");
  });
});

describe("A6 — deleteNoteFromDisk", () => {
  it("no-ops when fs_sync_path is null", async () => {
    const r = await deleteNoteFromDisk(repo, 1, "missing");
    expect(r.kind).toBe("skipped_disabled");
  });

  it("removes the .md file when present", async () => {
    await repo.setVaultFsSyncPath(1, tmpRoot);
    const path = join(tmpRoot, "doomed.md");
    await writeFile(path, "x", "utf8");
    const r = await deleteNoteFromDisk(repo, 1, "doomed");
    expect(r.kind).toBe("deleted");
  });

  it("treats missing files as idempotent success", async () => {
    await repo.setVaultFsSyncPath(1, tmpRoot);
    const r = await deleteNoteFromDisk(repo, 1, "never-existed");
    expect(r.kind).toBe("missing");
  });
});

describe("A6 — handleWatcherEvent", () => {
  it("FS add → DB createNote with fs-sync author marker", async () => {
    const vaultId = 1;
    await repo.setVaultFsSyncPath(vaultId, tmpRoot);
    const path = join(tmpRoot, "from-disk.md");
    const blob = "---\ntitle: From Disk\n---\n\n# Body\n\nText.";
    await writeFile(path, blob, "utf8");
    await handleWatcherEvent(repo, {
      vaultId,
      vaultRoot: tmpRoot,
      absPath: path,
      kind: "add",
    });
    const lookup = await repo.findNoteBySlugInVault(vaultId, "from-disk");
    expect(lookup).not.toBeNull();
    expect(lookup!.fsSyncLastHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("FS change on existing slug → DB updateNote (new version)", async () => {
    const vaultId = 1;
    const note = await seedNote({ vaultId, slug: "shared", title: "V1" });
    await repo.setVaultFsSyncPath(vaultId, tmpRoot);
    const path = join(tmpRoot, "shared.md");
    await writeFile(path, "# Edited from disk", "utf8");
    await handleWatcherEvent(repo, {
      vaultId,
      vaultRoot: tmpRoot,
      absPath: path,
      kind: "change",
    });
    const latest = await repo.getLatestNoteVersion(note.id);
    expect(latest?.contentMd).toContain("Edited from disk");
  });

  it("FS unlink → DB deleteNote (soft delete)", async () => {
    const vaultId = 1;
    const note = await seedNote({ vaultId, slug: "delete-me" });
    await repo.setVaultFsSyncPath(vaultId, tmpRoot);
    const path = join(tmpRoot, "delete-me.md");
    await writeFile(path, "x", "utf8");
    await handleWatcherEvent(repo, {
      vaultId,
      vaultRoot: tmpRoot,
      absPath: path,
      kind: "unlink",
    });
    const lookup = await repo.findNoteBySlugInVault(vaultId, "delete-me");
    expect(lookup).toBeNull();
  });

  it("echo guard: same-hash add does not double-write to DB", async () => {
    const vaultId = 1;
    const note = await seedNote({ vaultId, slug: "echo-test" });
    await repo.setVaultFsSyncPath(vaultId, tmpRoot);
    await flushNoteToDisk(repo, vaultId, note.id);
    // Now simulate chokidar firing 'change' on the file we just wrote.
    const path = join(tmpRoot, "echo-test.md");
    const versionsBefore = (await repo.getLatestNoteVersion(note.id))?.version ?? 0;
    await handleWatcherEvent(repo, {
      vaultId,
      vaultRoot: tmpRoot,
      absPath: path,
      kind: "change",
    });
    const versionsAfter = (await repo.getLatestNoteVersion(note.id))?.version ?? 0;
    // Echo skip: no new version row created.
    expect(versionsAfter).toBe(versionsBefore);
  });

  it("FS_SYNC_AUTHOR_USER_ID is the sentinel marker (-1)", () => {
    expect(FS_SYNC_AUTHOR_USER_ID).toBe(-1);
  });
});
