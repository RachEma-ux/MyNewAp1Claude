/**
 * Vault service — repository contract.
 *
 * Defines the `VaultRepository` interface + the in-memory
 * `VaultRepositoryStub`. Production code wires
 * `AsdbVaultRepository` (in `repository-asdb.ts`) against the ASDB
 * Drizzle client; tests + `AGS_VAULT_REPO=stub` dev mode use the stub.
 *
 * The stub is intentionally kept lightweight (Maps + arrays) so unit
 * tests don't have to boot ASDB; production callers go through the
 * Drizzle-backed implementation per `router.ts:getRepo`.
 */

import { createHash } from "crypto";
import type {
  NoteCreateInput,
  NoteDeleteInput,
  NoteUpdateInput,
  VaultCreateInput,
  VaultMemberAddInput,
} from "./contracts.js";

export interface NoteSelectByIdResult {
  id: number;
  vaultId: number;
  slug: string;
  title: string;
  currentVersionId: number | null;
  governanceStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteVersionSelectResult {
  id: number;
  noteId: number;
  version: number;
  contentMd: string;
  contentHash: string;
  frontmatter: Record<string, unknown> | null;
  authorUserId: number | null;
  createdAt: Date;
}

export interface VaultRepository {
  createVault(input: VaultCreateInput, createdByUserId: number): Promise<{ id: number }>;
  addMember(input: VaultMemberAddInput, addedByUserId: number): Promise<{ id: number }>;
  listVaultsForUser(userId: number): Promise<Array<{ id: number; name: string; slug: string }>>;
  createNote(input: NoteCreateInput, createdByUserId: number): Promise<{ id: number; versionId: number }>;
  getNoteById(noteId: number): Promise<NoteSelectByIdResult | null>;
  getNoteVersion(noteId: number, version: number): Promise<NoteVersionSelectResult | null>;
  getLatestNoteVersion(noteId: number): Promise<NoteVersionSelectResult | null>;
  updateNote(input: NoteUpdateInput, userId: number): Promise<{ versionId: number; conflict?: true; latestVersion?: number }>;
  /**
   * Soft-deletes a note by setting `deletedAt = NOW()`. Existing
   * version rows are preserved for audit. Idempotent on already-
   * deleted notes (returns `{ deleted: false, alreadyDeleted: true }`).
   * Optimistic-lock check is optional — when supplied, mismatch
   * returns `{ deleted: false, conflict: true, latestVersion }`.
   */
  deleteNote(
    input: NoteDeleteInput,
    userId: number,
  ): Promise<
    | { deleted: true }
    | { deleted: false; alreadyDeleted: true }
    | { deleted: false; conflict: true; latestVersion: number }
    | { deleted: false; notFound: true }
  >;
  listNotesInVault(vaultId: number, options?: { folderId?: number; limit?: number }): Promise<NoteSelectByIdResult[]>;

  // Track A — FS-sync surface
  // ADR: docs/architecture/agent-studio-vault-fs-sync.md

  /** Returns the vault's current `fs_sync_path` (null = sync disabled). */
  getVaultFsSyncPath(vaultId: number): Promise<string | null>;

  /**
   * Sets / clears the vault's `fs_sync_path`. Passing `null` disables
   * sync; otherwise the caller is responsible for path validation
   * (`assertVaultRootIsConfigurable`) — this method is purely the
   * persistence step.
   */
  setVaultFsSyncPath(vaultId: number, path: string | null): Promise<void>;

  /**
   * Looks up a note by (vaultId, slug). Returns the noteId + the
   * current `fs_sync_last_hash` so the FS→DB reader can short-circuit
   * on echoes without an extra round-trip. Returns null on no match.
   */
  findNoteBySlugInVault(
    vaultId: number,
    slug: string,
  ): Promise<{ noteId: number; folderId: number | null; fsSyncLastHash: string | null } | null>;

  /**
   * Updates the `fs_sync_last_hash` on a note. Called after every
   * successful FS round-trip (both DB→FS write and FS→DB read).
   */
  setNoteFsSyncLastHash(noteId: number, hash: string | null): Promise<void>;
}

/**
 * Computes the SHA-256 content hash used for idempotency + dedup.
 */
export function computeContentHash(contentMd: string): string {
  return createHash("sha256").update(contentMd, "utf8").digest("hex");
}

/**
 * In-memory `VaultRepository` implementation used by unit tests +
 * `AGS_VAULT_REPO=stub` dev mode. Production code routes through
 * `AsdbVaultRepository` (`repository-asdb.ts`); the stub is the
 * deterministic in-process equivalent.
 */
export class VaultRepositoryStub implements VaultRepository {
  private nextId = 1;
  private vaults: Array<{ id: number; name: string; slug: string }> = [];
  private notes: NoteSelectByIdResult[] = [];
  private versions = new Map<number, NoteVersionSelectResult[]>();

  async createVault(input: VaultCreateInput): Promise<{ id: number }> {
    const id = this.nextId++;
    this.vaults.push({ id, name: input.name, slug: input.slug });
    return { id };
  }

  async addMember(_input: VaultMemberAddInput): Promise<{ id: number }> {
    return { id: this.nextId++ };
  }

  async listVaultsForUser(_userId: number) {
    return this.vaults.slice();
  }

  async createNote(input: NoteCreateInput, createdByUserId: number): Promise<{ id: number; versionId: number }> {
    const id = this.nextId++;
    const versionId = this.nextId++;
    const note: NoteSelectByIdResult = {
      id,
      vaultId: input.vaultId,
      slug: input.slug,
      title: input.title,
      currentVersionId: versionId,
      governanceStatus: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.notes.push(note);
    const version: NoteVersionSelectResult = {
      id: versionId,
      noteId: id,
      version: 1,
      contentMd: input.contentMd,
      contentHash: computeContentHash(input.contentMd),
      frontmatter: input.frontmatter ?? null,
      authorUserId: createdByUserId,
      createdAt: new Date(),
    };
    this.versions.set(id, [version]);
    return { id, versionId };
  }

  async getNoteById(noteId: number) {
    return this.notes.find((n) => n.id === noteId) ?? null;
  }

  async getNoteVersion(noteId: number, version: number) {
    const list = this.versions.get(noteId);
    return list?.find((v) => v.version === version) ?? null;
  }

  async getLatestNoteVersion(noteId: number) {
    const list = this.versions.get(noteId);
    if (!list?.length) return null;
    return list[list.length - 1] ?? null;
  }

  async updateNote(input: NoteUpdateInput, userId: number) {
    const list = this.versions.get(input.noteId);
    if (!list?.length) throw new Error(`note ${input.noteId} not found`);
    const latest = list[list.length - 1]!;
    if (latest.version !== input.expectedVersion) {
      return { versionId: -1, conflict: true as const, latestVersion: latest.version };
    }
    const nextVersionNumber = latest.version + 1;
    const versionId = this.nextId++;
    const version: NoteVersionSelectResult = {
      id: versionId,
      noteId: input.noteId,
      version: nextVersionNumber,
      contentMd: input.contentMd,
      contentHash: computeContentHash(input.contentMd),
      frontmatter: input.frontmatter ?? null,
      authorUserId: userId,
      createdAt: new Date(),
    };
    list.push(version);
    const note = this.notes.find((n) => n.id === input.noteId);
    if (note) {
      note.currentVersionId = versionId;
      note.updatedAt = new Date();
    }
    return { versionId };
  }

  async listNotesInVault(vaultId: number, options?: { folderId?: number; limit?: number }) {
    const filtered = this.notes.filter((n) => n.vaultId === vaultId);
    return filtered.slice(0, options?.limit ?? 100);
  }

  // Track A — FS-sync stub surface.
  private vaultFsSyncPaths = new Map<number, string | null>();
  private noteFsSyncHashes = new Map<number, string | null>();

  async getVaultFsSyncPath(vaultId: number): Promise<string | null> {
    return this.vaultFsSyncPaths.get(vaultId) ?? null;
  }

  async setVaultFsSyncPath(vaultId: number, path: string | null): Promise<void> {
    this.vaultFsSyncPaths.set(vaultId, path);
  }

  async findNoteBySlugInVault(
    vaultId: number,
    slug: string,
  ): Promise<{
    noteId: number;
    folderId: number | null;
    fsSyncLastHash: string | null;
  } | null> {
    const match = this.notes.find(
      (n) => n.vaultId === vaultId && n.slug === slug,
    );
    if (!match) return null;
    return {
      noteId: match.id,
      folderId: null,
      fsSyncLastHash: this.noteFsSyncHashes.get(match.id) ?? null,
    };
  }

  async setNoteFsSyncLastHash(noteId: number, hash: string | null): Promise<void> {
    this.noteFsSyncHashes.set(noteId, hash);
  }

  private deletedNoteIds = new Set<number>();

  async deleteNote(input: NoteDeleteInput, _userId: number) {
    if (this.deletedNoteIds.has(input.noteId)) {
      return { deleted: false as const, alreadyDeleted: true as const };
    }
    const noteIndex = this.notes.findIndex((n) => n.id === input.noteId);
    if (noteIndex === -1) {
      return { deleted: false as const, notFound: true as const };
    }
    if (input.expectedVersion != null) {
      const list = this.versions.get(input.noteId);
      const latest = list?.[list.length - 1];
      if (latest && latest.version !== input.expectedVersion) {
        return {
          deleted: false as const,
          conflict: true as const,
          latestVersion: latest.version,
        };
      }
    }
    this.deletedNoteIds.add(input.noteId);
    this.notes.splice(noteIndex, 1);
    return { deleted: true as const };
  }
}
