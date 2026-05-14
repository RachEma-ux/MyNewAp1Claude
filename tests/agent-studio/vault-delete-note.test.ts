/**
 * Vault note delete — V1+ Phase NV-1 (PR-V1-29).
 *
 * Covers the contract gap surfaced during OL-5:
 * `OFFLINE_OPERATION_KINDS` declares `vault.note.delete` but there
 * was no server-side procedure. This PR ships the procedure +
 * stub-impl semantics + ASDB soft-delete + router router-procedure
 * wire-up.
 *
 * Test layers (no live tRPC tree, no ASDB):
 *   1. VaultRepositoryStub semantics (pure unit tests)
 *   2. NoteDeleteInput Zod contract shape
 *   3. Source-scan integrity on the router wire-up
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { VaultRepositoryStub } from "../../server/agent-studio/services/vault/repository.js";
import { NoteDeleteInput } from "../../server/agent-studio/services/vault/contracts.js";

async function makeStubWithNote(): Promise<{
  repo: VaultRepositoryStub;
  noteId: number;
}> {
  const repo = new VaultRepositoryStub();
  await repo.createVault({ name: "v", slug: "v" }, 1);
  const created = await repo.createNote(
    { vaultId: 1, slug: "n", title: "n", contentMd: "x" },
    1,
  );
  return { repo, noteId: created.id };
}

describe("NoteDeleteInput contract", () => {
  it("accepts a noteId-only input (offline-drain path)", () => {
    const parsed = NoteDeleteInput.parse({ noteId: 42 });
    expect(parsed.noteId).toBe(42);
    expect(parsed.expectedVersion).toBeUndefined();
  });

  it("accepts noteId + expectedVersion (online optimistic-lock path)", () => {
    const parsed = NoteDeleteInput.parse({
      noteId: 42,
      expectedVersion: 3,
    });
    expect(parsed.expectedVersion).toBe(3);
  });

  it("rejects when noteId is missing", () => {
    expect(() => NoteDeleteInput.parse({})).toThrow();
  });

  it("rejects when noteId is not an integer", () => {
    expect(() =>
      NoteDeleteInput.parse({ noteId: "abc" as unknown }),
    ).toThrow();
  });
});

describe("VaultRepositoryStub.deleteNote — semantics", () => {
  it("returns deleted:true on a fresh note", async () => {
    const { repo, noteId } = await makeStubWithNote();
    const result = await repo.deleteNote({ noteId }, 1);
    expect(result).toEqual({ deleted: true });
  });

  it("returns alreadyDeleted:true on second delete (idempotent)", async () => {
    const { repo, noteId } = await makeStubWithNote();
    await repo.deleteNote({ noteId }, 1);
    const second = await repo.deleteNote({ noteId }, 1);
    expect(second).toEqual({ deleted: false, alreadyDeleted: true });
  });

  it("returns notFound:true when the note id never existed", async () => {
    const repo = new VaultRepositoryStub();
    await repo.createVault({ name: "v", slug: "v" }, 1);
    const result = await repo.deleteNote({ noteId: 9999 }, 1);
    expect(result).toEqual({ deleted: false, notFound: true });
  });

  it("returns conflict when expectedVersion mismatches latest", async () => {
    const { repo, noteId } = await makeStubWithNote();
    // Note was created at version 1; pass expectedVersion=99
    const result = await repo.deleteNote(
      { noteId, expectedVersion: 99 },
      1,
    );
    expect(result).toEqual({
      deleted: false,
      conflict: true,
      latestVersion: 1,
    });
  });

  it("permits delete when expectedVersion matches latest", async () => {
    const { repo, noteId } = await makeStubWithNote();
    const result = await repo.deleteNote(
      { noteId, expectedVersion: 1 },
      1,
    );
    expect(result).toEqual({ deleted: true });
  });

  it("subsequent listNotesInVault excludes the deleted note", async () => {
    const { repo, noteId } = await makeStubWithNote();
    await repo.deleteNote({ noteId }, 1);
    const list = await repo.listNotesInVault(1);
    expect(list.find((n) => n.id === noteId)).toBeUndefined();
  });

  it("does NOT delete notes that were not requested", async () => {
    const repo = new VaultRepositoryStub();
    await repo.createVault({ name: "v", slug: "v" }, 1);
    const a = await repo.createNote(
      { vaultId: 1, slug: "a", title: "a", contentMd: "x" },
      1,
    );
    const b = await repo.createNote(
      { vaultId: 1, slug: "b", title: "b", contentMd: "x" },
      1,
    );
    await repo.deleteNote({ noteId: a.id }, 1);
    const list = await repo.listNotesInVault(1);
    const ids = list.map((n) => n.id).sort();
    expect(ids).toEqual([b.id]);
  });
});

describe("vault router — deleteNote wire-up (source-scan)", () => {
  const ROUTER_PATH = join(
    __dirname,
    "..",
    "..",
    "server/agent-studio/services/vault/router.ts",
  );
  const src = readFileSync(ROUTER_PATH, "utf8");

  it("imports NoteDeleteInput from contracts", () => {
    expect(/NoteDeleteInput/.test(src)).toBe(true);
    expect(
      /import[^;]*NoteDeleteInput[^;]*from\s+["']\.\/contracts\.js["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("registers the deleteNote procedure as a mutation", () => {
    expect(
      /deleteNote\s*:\s*protectedProcedure\s*\.input\(\s*NoteDeleteInput\s*\)\s*\.mutation\(/.test(
        src,
      ),
    ).toBe(true);
  });

  it("calls getRepo().deleteNote with the validated input + userId", () => {
    expect(/getRepo\(\)\.deleteNote\(input,\s*userId\)/.test(src)).toBe(true);
  });

  it("maps notFound to NOT_FOUND TRPCError", () => {
    expect(/code:\s*["']NOT_FOUND["']/.test(src)).toBe(true);
  });

  it("returns alreadyDeleted: true for idempotent success (no 404)", () => {
    expect(/alreadyDeleted:\s*true/.test(src)).toBe(true);
  });

  it("hard-rule compliance: no neo4j-driver import in router", () => {
    expect(/from\s+["']neo4j-driver["']/.test(src)).toBe(false);
  });
});

describe("source-scan boundary — repository-asdb.ts deleteNote", () => {
  const ASDB_PATH = join(
    __dirname,
    "..",
    "..",
    "server/agent-studio/services/vault/repository-asdb.ts",
  );
  const src = readFileSync(ASDB_PATH, "utf8");

  it("declares the deleteNote method on AsdbVaultRepository", () => {
    expect(/async\s+deleteNote\s*\(/.test(src)).toBe(true);
  });

  it("uses soft-delete (UPDATE ... SET deletedAt)", () => {
    expect(/\.update\(\s*agsVaultNotes\s*\)/.test(src)).toBe(true);
    expect(/deletedAt:\s*new\s+Date\(\)/.test(src)).toBe(true);
  });

  it("does NOT use .delete() to hard-remove the row", () => {
    expect(/\.delete\(\s*agsVaultNotes\s*\)/.test(src)).toBe(false);
  });

  it("respects deletedAt IS NULL precondition (idempotent)", () => {
    expect(/agsVaultNotes\.deletedAt[^;]*IS\s+NULL/.test(src)).toBe(true);
  });
});
