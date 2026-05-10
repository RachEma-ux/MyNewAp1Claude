/**
 * Phase 2 — vault repository stub tests.
 *
 * Verifies the in-memory stub used in dev mode + tests behaves correctly
 * for the MVP 1 happy paths.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  VaultRepositoryStub,
  computeContentHash,
} from "../../server/agent-studio/services/vault/public-api.js";

describe("VaultRepositoryStub", () => {
  let repo: VaultRepositoryStub;

  beforeEach(() => {
    repo = new VaultRepositoryStub();
  });

  it("createVault returns an id", async () => {
    const r = await repo.createVault({ name: "Test", slug: "test" }, 1);
    expect(r.id).toBeGreaterThan(0);
  });

  it("createNote stores v1 and is retrievable", async () => {
    const v = await repo.createVault({ name: "T", slug: "t" }, 1);
    const n = await repo.createNote(
      { vaultId: v.id, slug: "hello", title: "Hello", contentMd: "# Hello\n\nWorld" },
      1,
    );
    const note = await repo.getNoteById(n.id);
    expect(note?.title).toBe("Hello");
    expect(note?.currentVersionId).toBe(n.versionId);
    const version = await repo.getNoteVersion(n.id, 1);
    expect(version?.contentMd).toBe("# Hello\n\nWorld");
    expect(version?.contentHash).toBe(computeContentHash("# Hello\n\nWorld"));
  });

  it("updateNote creates v2 when expectedVersion matches", async () => {
    const v = await repo.createVault({ name: "T", slug: "t" }, 1);
    const n = await repo.createNote(
      { vaultId: v.id, slug: "hello", title: "Hello", contentMd: "v1" },
      1,
    );
    const r = await repo.updateNote(
      { noteId: n.id, expectedVersion: 1, contentMd: "v2" },
      1,
    );
    expect(r.conflict).toBeUndefined();
    expect(r.versionId).toBeGreaterThan(0);
    const latest = await repo.getLatestNoteVersion(n.id);
    expect(latest?.version).toBe(2);
    expect(latest?.contentMd).toBe("v2");
  });

  it("updateNote returns conflict when expectedVersion is stale", async () => {
    const v = await repo.createVault({ name: "T", slug: "t" }, 1);
    const n = await repo.createNote(
      { vaultId: v.id, slug: "hello", title: "Hello", contentMd: "v1" },
      1,
    );
    await repo.updateNote({ noteId: n.id, expectedVersion: 1, contentMd: "v2" }, 1);
    const r = await repo.updateNote(
      { noteId: n.id, expectedVersion: 1, contentMd: "v2-attempt2" },
      2,
    );
    expect(r.conflict).toBe(true);
    expect(r.latestVersion).toBe(2);
  });

  it("listNotesInVault filters by vault and respects limit", async () => {
    const v1 = await repo.createVault({ name: "V1", slug: "v1" }, 1);
    const v2 = await repo.createVault({ name: "V2", slug: "v2" }, 1);
    for (let i = 0; i < 5; i++) {
      await repo.createNote({ vaultId: v1.id, slug: `n${i}`, title: `N${i}`, contentMd: "" }, 1);
    }
    await repo.createNote({ vaultId: v2.id, slug: "other", title: "Other", contentMd: "" }, 1);
    const r = await repo.listNotesInVault(v1.id, { limit: 3 });
    expect(r.length).toBe(3);
    expect(r.every((n) => n.vaultId === v1.id)).toBe(true);
  });
});
