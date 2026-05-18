/**
 * Vault FS-sync integration — DB ↔ FS bridging.
 *
 * Track A — A6. Bridges the FS-sync core (writer + watcher) to the
 * vault repository (DB). Two directions:
 *
 *   - **DB → FS**: `flushNoteToDisk(repo, vaultId, noteId)` is called
 *     fire-and-forget from `createNote` / `updateNote` /
 *     `deleteNote` post-commit. Reads the latest version + the
 *     stored hash + the vault's `fs_sync_path` from the repository,
 *     atomically writes via `writeMarkdownAtomic`, persists the new
 *     hash. No-ops when `fs_sync_path` is null.
 *
 *   - **FS → DB**: `handleWatcherEvent(repo, event)` is the handler
 *     wired into `WatcherManager.getOrStart`. Resolves the slug from
 *     the absolute path, looks up the matching note (or creates one
 *     for `add`), and upserts a new version via the existing
 *     `updateNote` repository method with the `fs-sync` author
 *     marker.
 *
 * Both directions are debounced one level up (writer at 2s/note
 * implicit via the auto-save layer; watcher at 250ms per file) — this
 * module is the synchronous handler, not the debouncer.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { unlink } from "node:fs/promises";

import type { VaultRepository } from "./repository.js";
import {
  parseNotePathFromAbs,
  readMarkdownFile,
  resolveNoteFilePath,
  writeMarkdownAtomic,
  type FsSyncWatcherEvent,
} from "./fs-sync/index.js";
import { renderNoteAsMarkdownForFsSync } from "./fs-sync-backfill.js";

/** Sentinel user id used as the `author` when FS→DB upserts the note. */
export const FS_SYNC_AUTHOR_USER_ID = -1;

export interface FlushNoteToDiskResult {
  readonly kind:
    | "written"
    | "skipped_echo"
    | "skipped_disabled"
    | "skipped_missing_version"
    | "error";
  readonly noteId: number;
  readonly absPath?: string;
  readonly hash?: string;
  readonly error?: string;
}

/**
 * DB → FS flush. Called fire-and-forget after a successful
 * `createNote` / `updateNote`. The caller does NOT await this
 * promise — the mutation response is returned to the client
 * immediately. Errors are surfaced via the optional `onError`
 * callback.
 */
export async function flushNoteToDisk(
  repo: VaultRepository,
  vaultId: number,
  noteId: number,
): Promise<FlushNoteToDiskResult> {
  const vaultRoot = await repo.getVaultFsSyncPath(vaultId);
  if (vaultRoot === null) {
    return { kind: "skipped_disabled", noteId };
  }

  const note = await repo.getNoteById(noteId);
  if (!note) {
    return {
      kind: "error",
      noteId,
      error: `note ${noteId} not found for FS flush`,
    };
  }

  const latest = await repo.getLatestNoteVersion(noteId);
  if (!latest) {
    return { kind: "skipped_missing_version", noteId };
  }

  const lookup = await repo.findNoteBySlugInVault(vaultId, note.slug);
  const absPath = resolveNoteFilePath(vaultRoot, [], note.slug);
  const contentMd = renderNoteAsMarkdownForFsSync({
    title: note.title,
    slug: note.slug,
    contentMd: latest.contentMd,
    frontmatter: (latest.frontmatter ?? {}) as Record<string, unknown>,
    version: latest.version,
    noteId,
  });

  const result = await writeMarkdownAtomic({
    vaultRoot,
    absPath,
    contentMd,
    lastHash: lookup?.fsSyncLastHash ?? null,
  });

  switch (result.kind) {
    case "written":
      await repo.setNoteFsSyncLastHash(noteId, result.hash);
      return { kind: "written", noteId, absPath: result.absPath, hash: result.hash };
    case "skipped_echo":
      return {
        kind: "skipped_echo",
        noteId,
        absPath: result.absPath,
        hash: result.hash,
      };
    case "skipped_disabled":
      return { kind: "skipped_disabled", noteId };
    case "error":
      return { kind: "error", noteId, absPath: result.absPath, error: result.error };
  }
}

/**
 * DB → FS delete. Called fire-and-forget after a successful
 * `deleteNote`. Removes the on-disk `.md` if present; missing-file
 * errors are swallowed (the delete is idempotent).
 */
export async function deleteNoteFromDisk(
  repo: VaultRepository,
  vaultId: number,
  noteSlug: string,
): Promise<{ kind: "deleted" | "skipped_disabled" | "missing" | "error"; absPath?: string; error?: string }> {
  const vaultRoot = await repo.getVaultFsSyncPath(vaultId);
  if (vaultRoot === null) return { kind: "skipped_disabled" };
  const absPath = resolveNoteFilePath(vaultRoot, [], noteSlug);
  try {
    await unlink(absPath);
    return { kind: "deleted", absPath };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("ENOENT")) return { kind: "missing", absPath };
    return { kind: "error", absPath, error: msg };
  }
}

/**
 * FS → DB upsert. Wired into the WatcherManager's `onEvent` callback
 * when the vault's `fs_sync_path` is set (see router setFsSyncPath).
 *
 * - `add` / `change`: read the file, hash-check echo, parse, upsert
 *   the matching note row (or create if no slug match), persist the
 *   new hash.
 * - `unlink`: soft-delete the matching note row (existing
 *   `deleteNote` semantics).
 *
 * Errors are surfaced via the optional `onError` callback; the
 * watcher does not stop on handler errors.
 */
export async function handleWatcherEvent(
  repo: VaultRepository,
  event: FsSyncWatcherEvent,
): Promise<void> {
  const parsed = parseNotePathFromAbs(event.vaultRoot, event.absPath);
  if (!parsed) return; // not a .md file under the vault root
  const { slug } = parsed;
  const lookup = await repo.findNoteBySlugInVault(event.vaultId, slug);

  if (event.kind === "unlink") {
    if (lookup) {
      await repo.deleteNote({ noteId: lookup.noteId }, FS_SYNC_AUTHOR_USER_ID);
    }
    return;
  }

  // add / change — read + parse
  const read = await readMarkdownFile({
    vaultRoot: event.vaultRoot,
    absPath: event.absPath,
    lastHash: lookup?.fsSyncLastHash ?? null,
  });

  if (read.kind === "skipped_echo") return;
  if (read.kind === "error") {
    // Echo back via console; the watcher's onError surfaces the same.
    console.warn(
      `[fs-sync] read failed for ${event.absPath}: ${read.error}`,
    );
    return;
  }

  if (!lookup) {
    // New file dropped into the vault — create a fresh note.
    const titleFromFm = read.frontmatter.title;
    const title = typeof titleFromFm === "string" ? titleFromFm : slug;
    const created = await repo.createNote(
      {
        vaultId: event.vaultId,
        slug,
        title,
        contentMd: read.contentMd,
        frontmatter: read.frontmatter,
      },
      FS_SYNC_AUTHOR_USER_ID,
    );
    await repo.setNoteFsSyncLastHash(created.id, read.hash);
    return;
  }

  // Existing note — upsert as a new version. Look up the latest
  // version so the existing optimistic-lock contract holds; the FS
  // edit is treated as a write at the head of the version chain.
  // If a true conflict arises (rare — concurrent in-app edit while
  // an external editor is also writing), the Yjs layer is the merge
  // venue per the offline-local-first ADR.
  const latest = await repo.getLatestNoteVersion(lookup.noteId);
  const expectedVersion = latest?.version ?? 0;
  const updateResult = await repo.updateNote(
    {
      noteId: lookup.noteId,
      expectedVersion,
      contentMd: read.contentMd,
      frontmatter: read.frontmatter as Record<string, unknown>,
    },
    FS_SYNC_AUTHOR_USER_ID,
  );
  if (updateResult.conflict) {
    console.warn(
      `[fs-sync] updateNote conflict on noteId=${lookup.noteId}: expected v${expectedVersion} but latest is v${updateResult.latestVersion}; FS edit deferred to next pass`,
    );
    return;
  }
  await repo.setNoteFsSyncLastHash(lookup.noteId, read.hash);
}
