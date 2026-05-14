/**
 * Vault — ASDB-backed repository.
 *
 * Drizzle-backed implementation of VaultRepository. Phase 2 / 5.
 * Replaces VaultRepositoryStub for production use; tests still use the stub.
 *
 * Uses the existing asdb client (`getAsDb()`) and Drizzle table definitions
 * from `drizzle/tables/agent-studio-vault.ts`.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsVaults,
  agsVaultMembers,
  agsVaultNotes,
  agsVaultNoteVersions,
  agsVaultNoteConflicts,
} from "../../../../drizzle/tables/agent-studio-vault.js";
import type {
  VaultRepository,
  NoteSelectByIdResult,
  NoteVersionSelectResult,
} from "./repository.js";
import { computeContentHash } from "./repository.js";
import type {
  NoteCreateInput,
  NoteDeleteInput,
  NoteUpdateInput,
  VaultCreateInput,
  VaultMemberAddInput,
} from "./contracts.js";

export class AsdbVaultRepository implements VaultRepository {
  async createVault(input: VaultCreateInput, createdByUserId: number): Promise<{ id: number }> {
    const conn = getAsDb();
    const [row] = await conn
      .insert(agsVaults)
      .values({
        workspaceId: input.workspaceId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        createdByUserId,
      })
      .returning({ id: agsVaults.id });
    if (!row) throw new Error("Failed to create vault");
    return { id: row.id };
  }

  async addMember(input: VaultMemberAddInput, addedByUserId: number): Promise<{ id: number }> {
    const conn = getAsDb();
    const [row] = await conn
      .insert(agsVaultMembers)
      .values({
        vaultId: input.vaultId,
        userId: input.userId,
        role: input.role,
        addedByUserId,
      })
      .returning({ id: agsVaultMembers.id });
    if (!row) throw new Error("Failed to add member");
    return { id: row.id };
  }

  async listVaultsForUser(userId: number) {
    const conn = getAsDb();
    const rows = await conn
      .select({
        id: agsVaults.id,
        name: agsVaults.name,
        slug: agsVaults.slug,
      })
      .from(agsVaults)
      .innerJoin(agsVaultMembers, eq(agsVaultMembers.vaultId, agsVaults.id))
      .where(eq(agsVaultMembers.userId, userId))
      .orderBy(desc(agsVaults.createdAt));
    return rows;
  }

  async createNote(input: NoteCreateInput, createdByUserId: number): Promise<{ id: number; versionId: number }> {
    const conn = getAsDb();
    const [note] = await conn
      .insert(agsVaultNotes)
      .values({
        vaultId: input.vaultId,
        folderId: input.folderId,
        slug: input.slug,
        title: input.title,
        createdByUserId,
        governanceStatus: "active",
      })
      .returning({ id: agsVaultNotes.id });
    if (!note) throw new Error("Failed to create note");

    const [version] = await conn
      .insert(agsVaultNoteVersions)
      .values({
        noteId: note.id,
        version: 1,
        contentMd: input.contentMd,
        contentHash: computeContentHash(input.contentMd),
        frontmatter: input.frontmatter,
        authorUserId: createdByUserId,
        commitMessage: "Initial version",
      })
      .returning({ id: agsVaultNoteVersions.id });
    if (!version) throw new Error("Failed to create note version");

    await conn
      .update(agsVaultNotes)
      .set({ currentVersionId: version.id })
      .where(eq(agsVaultNotes.id, note.id));

    return { id: note.id, versionId: version.id };
  }

  async getNoteById(noteId: number): Promise<NoteSelectByIdResult | null> {
    const conn = getAsDb();
    const [row] = await conn
      .select({
        id: agsVaultNotes.id,
        vaultId: agsVaultNotes.vaultId,
        slug: agsVaultNotes.slug,
        title: agsVaultNotes.title,
        currentVersionId: agsVaultNotes.currentVersionId,
        governanceStatus: agsVaultNotes.governanceStatus,
        createdAt: agsVaultNotes.createdAt,
        updatedAt: agsVaultNotes.updatedAt,
      })
      .from(agsVaultNotes)
      .where(eq(agsVaultNotes.id, noteId))
      .limit(1);
    return row ?? null;
  }

  async getNoteVersion(noteId: number, version: number): Promise<NoteVersionSelectResult | null> {
    const conn = getAsDb();
    const [row] = await conn
      .select({
        id: agsVaultNoteVersions.id,
        noteId: agsVaultNoteVersions.noteId,
        version: agsVaultNoteVersions.version,
        contentMd: agsVaultNoteVersions.contentMd,
        contentHash: agsVaultNoteVersions.contentHash,
        frontmatter: agsVaultNoteVersions.frontmatter,
        authorUserId: agsVaultNoteVersions.authorUserId,
        createdAt: agsVaultNoteVersions.createdAt,
      })
      .from(agsVaultNoteVersions)
      .where(
        and(
          eq(agsVaultNoteVersions.noteId, noteId),
          eq(agsVaultNoteVersions.version, version),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async getLatestNoteVersion(noteId: number): Promise<NoteVersionSelectResult | null> {
    const conn = getAsDb();
    const [row] = await conn
      .select({
        id: agsVaultNoteVersions.id,
        noteId: agsVaultNoteVersions.noteId,
        version: agsVaultNoteVersions.version,
        contentMd: agsVaultNoteVersions.contentMd,
        contentHash: agsVaultNoteVersions.contentHash,
        frontmatter: agsVaultNoteVersions.frontmatter,
        authorUserId: agsVaultNoteVersions.authorUserId,
        createdAt: agsVaultNoteVersions.createdAt,
      })
      .from(agsVaultNoteVersions)
      .where(eq(agsVaultNoteVersions.noteId, noteId))
      .orderBy(desc(agsVaultNoteVersions.version))
      .limit(1);
    return row ?? null;
  }

  async updateNote(input: NoteUpdateInput, userId: number): Promise<{ versionId: number; conflict?: true; latestVersion?: number }> {
    const conn = getAsDb();
    const latest = await this.getLatestNoteVersion(input.noteId);
    if (!latest) {
      throw new Error(`Note ${input.noteId} not found`);
    }
    if (latest.version !== input.expectedVersion) {
      // Optimistic-lock conflict; record it.
      await conn.insert(agsVaultNoteConflicts).values({
        noteId: input.noteId,
        expectedVersion: input.expectedVersion,
        submittedVersion: latest.version,
        submitterUserId: userId,
        metadata: { contentMdHash: computeContentHash(input.contentMd) },
      });
      return { versionId: -1, conflict: true as const, latestVersion: latest.version };
    }
    const nextVersionNumber = latest.version + 1;
    const [version] = await conn
      .insert(agsVaultNoteVersions)
      .values({
        noteId: input.noteId,
        version: nextVersionNumber,
        contentMd: input.contentMd,
        contentHash: computeContentHash(input.contentMd),
        frontmatter: input.frontmatter,
        authorUserId: userId,
        commitMessage: input.commitMessage,
      })
      .returning({ id: agsVaultNoteVersions.id });
    if (!version) throw new Error("Failed to create new note version");

    await conn
      .update(agsVaultNotes)
      .set({ currentVersionId: version.id, updatedAt: new Date() })
      .where(eq(agsVaultNotes.id, input.noteId));

    return { versionId: version.id };
  }

  async listNotesInVault(
    vaultId: number,
    options?: { folderId?: number; limit?: number },
  ): Promise<NoteSelectByIdResult[]> {
    const conn = getAsDb();
    const conditions = [
      eq(agsVaultNotes.vaultId, vaultId),
      sql`${agsVaultNotes.deletedAt} IS NULL`,
    ];
    if (options?.folderId != null) {
      conditions.push(eq(agsVaultNotes.folderId, options.folderId));
    }
    const rows = await conn
      .select({
        id: agsVaultNotes.id,
        vaultId: agsVaultNotes.vaultId,
        slug: agsVaultNotes.slug,
        title: agsVaultNotes.title,
        currentVersionId: agsVaultNotes.currentVersionId,
        governanceStatus: agsVaultNotes.governanceStatus,
        createdAt: agsVaultNotes.createdAt,
        updatedAt: agsVaultNotes.updatedAt,
      })
      .from(agsVaultNotes)
      .where(and(...conditions))
      .orderBy(desc(agsVaultNotes.updatedAt))
      .limit(options?.limit ?? 100);
    return rows;
  }

  async deleteNote(
    input: NoteDeleteInput,
    _userId: number,
  ): Promise<
    | { deleted: true }
    | { deleted: false; alreadyDeleted: true }
    | { deleted: false; conflict: true; latestVersion: number }
    | { deleted: false; notFound: true }
  > {
    const conn = getAsDb();

    const [row] = await conn
      .select({
        id: agsVaultNotes.id,
        deletedAt: agsVaultNotes.deletedAt,
      })
      .from(agsVaultNotes)
      .where(eq(agsVaultNotes.id, input.noteId))
      .limit(1);

    if (!row) {
      return { deleted: false, notFound: true };
    }
    if (row.deletedAt != null) {
      return { deleted: false, alreadyDeleted: true };
    }

    if (input.expectedVersion != null) {
      const latest = await this.getLatestNoteVersion(input.noteId);
      if (latest && latest.version !== input.expectedVersion) {
        return {
          deleted: false,
          conflict: true,
          latestVersion: latest.version,
        };
      }
    }

    await conn
      .update(agsVaultNotes)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(agsVaultNotes.id, input.noteId),
          sql`${agsVaultNotes.deletedAt} IS NULL`,
        ),
      );

    return { deleted: true };
  }
}
