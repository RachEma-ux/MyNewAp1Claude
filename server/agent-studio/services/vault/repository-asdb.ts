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
import { getAsDb, getAsDbForWorkspace } from "../../db/connection.js";
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
    // V1+ MR-3 second batch: workspaceId is on the input schema
    // (optional). Phase-1 shim delegates to default DB; Phase-2 will
    // route to the workspace's home region (or default when null).
    const conn = getAsDbForWorkspace(input.workspaceId);
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
    // V1+ MR-3 thirty-second batch (PR-V1-101): vault→workspace split-
    // handle. agsVaultMembers does not carry workspaceId; the parent
    // vault does. Discovery SELECT pulls workspaceId, INSERT routes
    // via getAsDbForWorkspace. Fall back to the default handle when
    // the vault is missing OR vault.workspaceId IS NULL — the FK
    // constraint on the INSERT will surface the missing-vault error
    // (preserves pre-migration unhappy-path semantics).
    const lookupConn = getAsDb();
    if (!lookupConn) throw new Error("ASDB unavailable");
    const lookup = await lookupConn
      .select({ workspaceId: agsVaults.workspaceId })
      .from(agsVaults)
      .where(eq(agsVaults.id, input.vaultId))
      .limit(1);
    const workspaceId = lookup[0]?.workspaceId ?? null;
    const conn =
      workspaceId != null ? getAsDbForWorkspace(workspaceId) : lookupConn;
    if (!conn) throw new Error("ASDB unavailable");
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
    // V1+ MR-3 thirty-third batch (PR-V1-102): vault→workspace split-
    // handle. Three child-table writes all route to the same handle
    // resolved once at the top of the function via the vault lookup
    // — preserves atomicity (a node, its version, and the
    // currentVersionId backfill all hit the same handle).
    const lookupConn = getAsDb();
    if (!lookupConn) throw new Error("ASDB unavailable");
    const lookup = await lookupConn
      .select({ workspaceId: agsVaults.workspaceId })
      .from(agsVaults)
      .where(eq(agsVaults.id, input.vaultId))
      .limit(1);
    const workspaceId = lookup[0]?.workspaceId ?? null;
    const conn =
      workspaceId != null ? getAsDbForWorkspace(workspaceId) : lookupConn;
    if (!conn) throw new Error("ASDB unavailable");
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
    // V1+ MR-3 seventieth batch (PR-V1-140): Path-A read consumer.
    // Notes × Vaults JOIN keyed on noteId pulls workspaceId up in
    // one round-trip, then the projected SELECT routes via
    // getAsDbForWorkspace.
    const lookupConn = getAsDb();
    if (!lookupConn) return null;
    const ws = await lookupConn
      .select({ workspaceId: agsVaults.workspaceId })
      .from(agsVaultNotes)
      .innerJoin(agsVaults, eq(agsVaultNotes.vaultId, agsVaults.id))
      .where(eq(agsVaultNotes.id, noteId))
      .limit(1);
    if (ws.length === 0) return null;
    const conn = getAsDbForWorkspace(ws[0].workspaceId) ?? lookupConn;
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
    // V1+ MR-3 seventieth batch (PR-V1-140): Path-A read consumer.
    // noteVersion's workspace lookup walks
    // agsVaultNoteVersions.noteId → agsVaultNotes.vaultId →
    // agsVaults.workspaceId. Three-table JOIN-via-INNER would also
    // work; we do the simpler 2-step (Notes × Vaults keyed by
    // noteId) since noteId is already in scope.
    const lookupConn = getAsDb();
    if (!lookupConn) return null;
    const ws = await lookupConn
      .select({ workspaceId: agsVaults.workspaceId })
      .from(agsVaultNotes)
      .innerJoin(agsVaults, eq(agsVaultNotes.vaultId, agsVaults.id))
      .where(eq(agsVaultNotes.id, noteId))
      .limit(1);
    const conn =
      ws.length > 0
        ? (getAsDbForWorkspace(ws[0].workspaceId) ?? lookupConn)
        : lookupConn;
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
    // V1+ MR-3 seventieth batch (PR-V1-140): Path-A read consumer.
    // Same Notes × Vaults JOIN as getNoteVersion.
    const lookupConn = getAsDb();
    if (!lookupConn) return null;
    const ws = await lookupConn
      .select({ workspaceId: agsVaults.workspaceId })
      .from(agsVaultNotes)
      .innerJoin(agsVaults, eq(agsVaultNotes.vaultId, agsVaults.id))
      .where(eq(agsVaultNotes.id, noteId))
      .limit(1);
    const conn =
      ws.length > 0
        ? (getAsDbForWorkspace(ws[0].workspaceId) ?? lookupConn)
        : lookupConn;
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
    // V1+ MR-3 thirty-fourth batch (PR-V1-103): note→vault→workspace
    // split-handle. updateNote performs up to three writes (conflict
    // ledger row, version INSERT, currentVersionId UPDATE) plus a
    // read-only getLatestNoteVersion. All routed via a single conn
    // resolved once at the top by JOIN-ing agsVaultNotes × agsVaults
    // on vaultId. Falls back to bootstrap handle when note missing OR
    // workspaceId IS NULL.
    const lookupConn = getAsDb();
    if (!lookupConn) throw new Error("ASDB unavailable");
    const lookup = await lookupConn
      .select({ workspaceId: agsVaults.workspaceId })
      .from(agsVaultNotes)
      .innerJoin(agsVaults, eq(agsVaultNotes.vaultId, agsVaults.id))
      .where(eq(agsVaultNotes.id, input.noteId))
      .limit(1);
    const workspaceId = lookup[0]?.workspaceId ?? null;
    const conn =
      workspaceId != null ? getAsDbForWorkspace(workspaceId) : lookupConn;
    if (!conn) throw new Error("ASDB unavailable");
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
    // V1+ MR-3 seventy-first batch (PR-V1-141): Path-A read consumer.
    // vaultId → agsVaults.workspaceId in a single pre-projection
    // SELECT, then route the SELECT on agsVaultNotes to the home
    // region. Falls back to bootstrap when the vault row is missing
    // OR vault.workspaceId IS NULL.
    const lookupConn = getAsDb();
    if (!lookupConn) return [];
    const ws = await lookupConn
      .select({ workspaceId: agsVaults.workspaceId })
      .from(agsVaults)
      .where(eq(agsVaults.id, vaultId))
      .limit(1);
    const conn =
      ws.length > 0
        ? (getAsDbForWorkspace(ws[0].workspaceId) ?? lookupConn)
        : lookupConn;
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
    // V1+ MR-3 thirty-fifth batch (PR-V1-104): note→vault→workspace
    // split-handle. The pre-existing SELECT-by-noteId is widened to
    // also pull vault.workspaceId in the same round-trip via an
    // innerJoin on agsVaults — no additional latency cost vs. the
    // pre-migration single SELECT. The subsequent soft-delete UPDATE
    // routes via getAsDbForWorkspace. Falls back to the bootstrap
    // handle when workspaceId IS NULL.
    const lookupConn = getAsDb();
    if (!lookupConn) throw new Error("ASDB unavailable");

    const [row] = await lookupConn
      .select({
        id: agsVaultNotes.id,
        deletedAt: agsVaultNotes.deletedAt,
        workspaceId: agsVaults.workspaceId,
      })
      .from(agsVaultNotes)
      .innerJoin(agsVaults, eq(agsVaultNotes.vaultId, agsVaults.id))
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

    const conn =
      row.workspaceId != null
        ? getAsDbForWorkspace(row.workspaceId)
        : lookupConn;
    if (!conn) throw new Error("ASDB unavailable");

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
