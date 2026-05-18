/**
 * Vault — tRPC Router.
 *
 * MVP 1. Mounts vault operations into the Agent Studio tRPC tree.
 *
 * The repository is selected at call time:
 *   - process.env.AGS_VAULT_REPO === "stub" → VaultRepositoryStub (dev/tests)
 *   - otherwise → AsdbVaultRepository (production)
 *
 * Mounting:
 *   server/agent-studio/router.ts spreads `vault: vaultRouter` into the
 *   agentStudio.* tree.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../../../_core/trpc.js";
import { NoteCreateInput, NoteDeleteInput, NoteUpdateInput, VaultCreateInput, VaultMemberAddInput, SearchInput } from "./contracts.js";
import { VaultRepositoryStub } from "./repository.js";
import { AsdbVaultRepository } from "./repository-asdb.js";
import type { VaultRepository } from "./repository.js";
import { extractLinksFromMarkdown } from "./links.js";
import {
  createTemplate,
  listTemplates,
  getTemplateById,
  renderTemplate,
} from "./templates.js";
import {
  computeTemplateDigest,
  countDistinctDigestsForTemplate,
  listInstantiationsByNote,
  listInstantiationsByTemplate,
  recordTemplateInstantiation,
} from "./template-instantiations.js";
import {
  exportNoteAsMarkdown,
  parseMarkdownBlob,
} from "./markdown-import-export.js";
import {
  AttachmentQuotaExceededError,
  resolveDefaultAttachmentBytesLimit,
} from "./attachment-quota-guard.js";
import {
  createAttachment,
  getAttachmentById,
  listAttachments,
  linkAttachmentToNote,
  unlinkAttachmentFromNote,
  markAttachmentAsSourceArtifact,
  buildAttachmentEmbedSnippet,
  AttachmentNotFoundError,
} from "./attachments.js";
import { computeAttachmentQuota } from "./attachment-library.js";
import {
  createSavedView,
  getSavedViewById,
  listSavedViews,
  listVisibleSavedViewsForUser,
  listSavedViewVersions,
  getSavedViewVersionById,
  updateSavedView,
  deleteSavedView,
  deleteSavedViews,
  SavedViewNotFoundError,
} from "./saved-views.js";
import {
  getViewKindBlueprint,
  listViewKindBlueprints,
} from "./view-kind-blueprints.js";
import { captureUnexpectedTrpcError } from "../workspace-observability/public-api.js";

/**
 * Fire-and-forget observability capture before throwing the TRPCError.
 * Same pattern as graph-correction (#491) / workspace-observability
 * (#492) / graph-change-proposals (#493). The classifier inside
 * captureUnexpectedTrpcError filters out expected operator-side codes
 * (BAD_REQUEST / NOT_FOUND / etc.) and only persists
 * INTERNAL_SERVER_ERROR + raw Errors.
 */
function throwTrpcAndCapture(trpcErr: TRPCError): never {
  void captureUnexpectedTrpcError("vault.router", trpcErr);
  throw trpcErr;
}

let cachedRepo: VaultRepository | null = null;
function getRepo(): VaultRepository {
  if (cachedRepo) return cachedRepo;
  if (process.env.AGS_VAULT_REPO === "stub") {
    cachedRepo = new VaultRepositoryStub();
  } else {
    cachedRepo = new AsdbVaultRepository();
  }
  return cachedRepo;
}

/**
 * Test helper. Allows tests to inject a custom repository implementation
 * and reset between cases.
 */
export function _setVaultRepositoryForTests(repo: VaultRepository | null): void {
  cachedRepo = repo;
}

/**
 * Track A — A6 — fire-and-forget FS-sync flush helpers. Mutations
 * (createNote / updateNote / deleteNote) call these without awaiting
 * so the operator's tRPC response returns immediately; failures are
 * logged but do not roll back the DB mutation. FS-sync no-ops when
 * the vault has no `fs_sync_path` set.
 *
 * Importing lazily (inside the helpers) keeps the router cold-import
 * cost low and avoids a circular dep between router ↔ fs-sync-
 * integration ↔ markdown-import-export.
 */
function fireFsFlush(vaultId: number, noteId: number): void {
  void (async () => {
    try {
      const { flushNoteToDisk } = await import("./fs-sync-integration.js");
      const result = await flushNoteToDisk(getRepo(), vaultId, noteId);
      if (result.kind === "error") {
        console.warn(
          `[fs-sync] flushNoteToDisk noteId=${noteId} error: ${result.error}`,
        );
      }
    } catch (e) {
      console.warn(
        `[fs-sync] unexpected error during FS flush noteId=${noteId}:`,
        e,
      );
    }
  })();
}

/**
 * Knowledge Graph projection enqueue — closes step 8 of the Phase 5b
 * note-version pipeline. Pushes a `note.created` / `note.updated`
 * sync-job + one `wikilink.changed` job per resolved `[[wikilink]]`
 * onto `ags_graph_projection_sync_jobs`. Phase 7.5 sync-worker reads
 * the queue and renders into Neo4j. Lazy-imported for the same
 * cold-import reasons as the FS-sync helpers.
 */
function fireGraphProjection(
  vaultId: number,
  noteId: number,
  versionId: number,
  slug: string,
  title: string,
  contentMd: string,
  eventKind: "note.created" | "note.updated",
): void {
  void (async () => {
    try {
      const { enqueueVaultNoteProjection } = await import(
        "./graph-projection.js"
      );
      await enqueueVaultNoteProjection(
        { vaultId, noteId, versionId, slug, title, contentMd, eventKind },
        { repo: getRepo() },
      );
    } catch (e) {
      console.warn(
        `[graph-projection] enqueue failed noteId=${noteId} versionId=${versionId} kind=${eventKind}:`,
        e,
      );
    }
  })();
}

/**
 * Outbound link persistence — writes `ags_vault_wikilinks` +
 * `ags_vault_embeds` rows for the new note version. REPLACE strategy:
 * deletes the prior rows for the note then inserts the new set.
 * Fire-and-forget; failures don't block the response (graph projection
 * is enqueued separately via `fireGraphProjection`).
 */
function fireLinkPersistence(
  vaultId: number,
  noteId: number,
  versionId: number,
  contentMd: string,
): void {
  void (async () => {
    try {
      const { persistNoteLinks } = await import("./link-persistence.js");
      await persistNoteLinks({
        vaultId,
        noteId,
        versionId,
        contentMd,
        repo: getRepo(),
      });
    } catch (e) {
      console.warn(
        `[link-persistence] write failed noteId=${noteId} versionId=${versionId}:`,
        e,
      );
    }
  })();
}

function fireGraphProjectionDeletion(noteId: number): void {
  void (async () => {
    try {
      const { enqueueVaultNoteDeletion } = await import(
        "./graph-projection.js"
      );
      await enqueueVaultNoteDeletion({ noteId });
    } catch (e) {
      console.warn(
        `[graph-projection] deletion enqueue failed noteId=${noteId}:`,
        e,
      );
    }
  })();
}

function fireFsDelete(vaultId: number, noteSlug: string): void {
  void (async () => {
    try {
      const { deleteNoteFromDisk } = await import(
        "./fs-sync-integration.js"
      );
      const result = await deleteNoteFromDisk(getRepo(), vaultId, noteSlug);
      if (result.kind === "error") {
        console.warn(
          `[fs-sync] deleteNoteFromDisk slug=${noteSlug} error: ${result.error}`,
        );
      }
    } catch (e) {
      console.warn(
        `[fs-sync] unexpected error during FS delete slug=${noteSlug}:`,
        e,
      );
    }
  })();
}

export const vaultRouter = router({
  createVault: protectedProcedure
    .input(VaultCreateInput)
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as unknown as { user?: { id?: number } }).user?.id ?? 1;
      try {
        return await getRepo().createVault(input, userId);
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e instanceof Error ? e.message : String(e) }));
      }
    }),

  addMember: protectedProcedure
    .input(VaultMemberAddInput)
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as unknown as { user?: { id?: number } }).user?.id ?? 1;
      return await getRepo().addMember(input, userId);
    }),

  listMyVaults: protectedProcedure.query(async ({ ctx }) => {
    const userId = (ctx as unknown as { user?: { id?: number } }).user?.id;
    if (userId == null) return [];
    return await getRepo().listVaultsForUser(userId);
  }),

  createNote: protectedProcedure
    .input(NoteCreateInput)
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as unknown as { user?: { id?: number } }).user?.id ?? 1;
      const note = await getRepo().createNote(input, userId);
      // Side-effect: extract links for the projection event payload + the
      // operator-facing counts on the response.
      const extraction = extractLinksFromMarkdown(input.contentMd);
      // Track A — A6 — DB → FS flush (fire-and-forget). The flush
      // is non-blocking (the operator's response returns before disk
      // I/O completes). FS sync no-ops when fs_sync_path is null.
      void fireFsFlush(input.vaultId, note.id);
      // Knowledge Graph projection — fire-and-forget. Pushes the new
      // note (and its outbound wikilinks) onto ags_graph_projection_
      // sync_jobs so the Phase 7.5 sync-worker can render Note +
      // NoteVersion + LINKS_TO into Neo4j.
      void fireGraphProjection(
        input.vaultId,
        note.id,
        note.versionId,
        input.slug,
        input.title,
        input.contentMd,
        "note.created",
      );
      // Outbound link persistence — writes Postgres rows for the
      // operator-visible wikilinks/embeds. Independent from the graph
      // projection; both fire concurrently.
      void fireLinkPersistence(
        input.vaultId,
        note.id,
        note.versionId,
        input.contentMd,
      );
      return {
        ...note,
        wikilinkCount: extraction.wikilinks.length,
        tagCount: extraction.tagSlugs.length,
      };
    }),

  updateNote: protectedProcedure
    .input(NoteUpdateInput)
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as unknown as { user?: { id?: number } }).user?.id ?? 1;
      const result = await getRepo().updateNote(input, userId);
      if (result.conflict) {
        return { conflict: true, latestVersion: result.latestVersion };
      }
      // Track A — A6 — DB → FS flush. Look up the note's vaultId
      // (the update input only carries noteId) before firing.
      const note = await getRepo().getNoteById(input.noteId);
      if (note) {
        void fireFsFlush(note.vaultId, input.noteId);
        // Knowledge Graph projection — wikilink set in the new
        // contentMd may differ from the previous version, so re-enqueue
        // on every update. The sync-worker dedups by projectionKey.
        void fireGraphProjection(
          note.vaultId,
          input.noteId,
          result.versionId,
          note.slug,
          note.title,
          input.contentMd,
          "note.updated",
        );
        // Link persistence — REPLACE the prior version's rows with the
        // newly-extracted wikilinks/embeds.
        void fireLinkPersistence(
          note.vaultId,
          input.noteId,
          result.versionId,
          input.contentMd,
        );
      }
      return { conflict: false, versionId: result.versionId };
    }),

  deleteNote: protectedProcedure
    .input(NoteDeleteInput)
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as unknown as { user?: { id?: number } }).user?.id ?? 1;
      // Look up the note BEFORE delete so we can resolve the slug
      // for the FS-side unlink.
      const beforeDelete = await getRepo().getNoteById(input.noteId);
      const result = await getRepo().deleteNote(input, userId);
      if (result.deleted) {
        // Track A — A6 — DB → FS delete.
        if (beforeDelete) {
          void fireFsDelete(beforeDelete.vaultId, beforeDelete.slug);
        }
        // Knowledge Graph projection — emit `note.deleted` so the
        // sync-worker purges the Note (and DETACH-cascades the
        // NoteVersion + LINKS_TO + VERSION_OF edges) from Neo4j.
        void fireGraphProjectionDeletion(input.noteId);
        return { deleted: true as const };
      }
      if ("notFound" in result) {
        throwTrpcAndCapture(
          new TRPCError({
            code: "NOT_FOUND",
            message: `Note ${input.noteId} not found`,
          }),
        );
      }
      if ("conflict" in result) {
        return {
          deleted: false as const,
          conflict: true as const,
          latestVersion: result.latestVersion,
        };
      }
      // alreadyDeleted — idempotent success
      return {
        deleted: false as const,
        alreadyDeleted: true as const,
      };
    }),

  getNote: protectedProcedure
    .input(z.object({ noteId: z.number().int() }))
    .query(async ({ input }) => {
      const note = await getRepo().getNoteById(input.noteId);
      if (!note) {
        throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: `Note ${input.noteId} not found` }));
      }
      const latest = await getRepo().getLatestNoteVersion(input.noteId);
      return { note, latestVersion: latest };
    }),

  getNoteVersion: protectedProcedure
    .input(z.object({ noteId: z.number().int(), version: z.number().int() }))
    .query(async ({ input }) => {
      const version = await getRepo().getNoteVersion(input.noteId, input.version);
      if (!version) {
        throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: `Version ${input.version} not found for note ${input.noteId}` }));
      }
      return version;
    }),

  listNotes: protectedProcedure
    .input(z.object({
      vaultId: z.number().int(),
      folderId: z.number().int().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      return await getRepo().listNotesInVault(input.vaultId, { folderId: input.folderId, limit: input.limit });
    }),

  /**
   * Notes that link TO the given note via `[[<this-note's-slug>]]`.
   * Backed by `ags_vault_wikilinks` (populated on every
   * createNote/updateNote since #1482). Replaces the
   * WikilinksBacklinksPanel's client-side all-vault markdown scan;
   * one indexed JOIN instead of shipping N notes of contentMd to
   * the browser.
   */
  listBacklinks: protectedProcedure
    .input(z.object({
      noteId: z.number().int().positive(),
    }))
    .query(async ({ input }) => {
      const { listBacklinksForNote } = await import("./link-queries.js");
      return await listBacklinksForNote(input.noteId);
    }),

  /**
   * Outgoing wikilinks from the given note. LEFT JOIN against
   * `ags_vault_notes` so resolved + unresolved both surface (the
   * latter with `targetNoteId=null` / `targetTitle=null`).
   */
  listOutgoingWikilinks: protectedProcedure
    .input(z.object({
      noteId: z.number().int().positive(),
    }))
    .query(async ({ input }) => {
      const { listOutgoingWikilinksForNote } = await import("./link-queries.js");
      return await listOutgoingWikilinksForNote(input.noteId);
    }),

  /**
   * One-shot link backfill — re-runs `persistNoteLinks` for every
   * note in the vault using its latest version's contentMd. Use cases:
   *   - Vault existed before #1482 (link tables were never populated)
   *   - Operator suspects link drift (rare but possible if an
   *     out-of-band edit bypassed the router hooks)
   *
   * Idempotent: REPLACE pattern in persistNoteLinks means re-runs are
   * safe. Per-note exceptions are caught and recorded; the backfill
   * continues. Admin-only because it touches every row in the vault's
   * link tables.
   */
  backfillLinks: adminProcedure
    .input(z.object({
      vaultId: z.number().int().positive(),
      limit: z.number().int().positive().max(10_000).optional(),
    }))
    .mutation(async ({ input }) => {
      const { backfillVaultLinks } = await import("./link-persistence.js");
      return await backfillVaultLinks({
        vaultId: input.vaultId,
        repo: getRepo(),
        limit: input.limit,
      });
    }),

  /**
   * Track B — B4 — aggregate tags across a vault for the in-app
   * `#tag` autocomplete. Scans the latest version of every note,
   * runs the existing extractLinksFromMarkdown over each contentMd,
   * returns the unique tag list with occurrence counts.
   *
   * Performance: caps the scan at 500 notes per vault (any larger
   * and we'd want a denormalized tags table; that's a follow-on
   * slice). Operator latency is acceptable for the typical vault
   * size; the response is cached client-side via TanStack.
   */
  listTagsForVault: protectedProcedure
    .input(z.object({
      vaultId: z.number().int().positive(),
      limit: z.number().int().min(1).max(2000).default(500),
    }))
    .query(async ({ input }) => {
      const repo = getRepo();
      const notes = await repo.listNotesInVault(input.vaultId, {
        limit: input.limit,
      });
      const counts = new Map<string, number>();
      for (const note of notes) {
        const latest = await repo.getLatestNoteVersion(note.id);
        if (!latest) continue;
        const { tagSlugs } = extractLinksFromMarkdown(latest.contentMd);
        for (const tag of tagSlugs) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
      // Sort by count desc, then alpha asc.
      const sorted = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([tag, count]) => ({ tag, count }));
      return { tags: sorted };
    }),

  search: protectedProcedure
    .input(SearchInput)
    .query(async ({ input: _input }) => {
      // Phase 6 wires the tsvector search via AsdbVaultRepository.
      // MVP returns empty until then.
      return [] as Array<{ noteId: number; title: string; snippet: string; score: number }>;
    }),

  // ============================================================
  // Phase 15 §1 + §2 — Templates
  // ============================================================

  createTemplate: protectedProcedure
    .input(
      z.object({
        vaultId: z.number().int().positive().optional(),
        templateKey: z.string().min(1).max(100),
        name: z.string().min(1).max(255),
        contentMd: z.string().max(200_000),
        frontmatterDefaults: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await createTemplate({
          vaultId: input.vaultId,
          templateKey: input.templateKey,
          name: input.name,
          contentMd: input.contentMd,
          frontmatterDefaults: input.frontmatterDefaults,
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  listTemplates: protectedProcedure
    .input(
      z
        .object({
          vaultId: z.number().int().positive().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      try {
        return await listTemplates({ vaultId: input?.vaultId });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  // ============================================================
  // Phase 15 — Markdown import / export
  // ============================================================

  exportNote: protectedProcedure
    .input(z.object({ noteId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        const result = await exportNoteAsMarkdown(input.noteId, {
          repository: getRepo(),
        });
        if (!result) {
          throwTrpcAndCapture(new TRPCError({
            code: "NOT_FOUND",
            message: `Note ${input.noteId} not found`,
          }));
        }
        return result;
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  importNoteFromMarkdown: protectedProcedure
    .input(
      z.object({
        rawMd: z.string().min(1).max(2_000_000),
        vaultId: z.number().int().positive(),
        slug: z.string().min(1).max(255),
        title: z.string().min(1).max(500).optional(),
        folderId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id ?? 1;
      const parsed = parseMarkdownBlob(input.rawMd);
      // Prefer the caller-supplied title; fall back to frontmatter.title;
      // finally fall back to the slug. The fallback chain mirrors the
      // pasted-from-Obsidian flow operators expect.
      const title =
        input.title ??
        (typeof parsed.frontmatter.title === "string"
          ? parsed.frontmatter.title
          : input.slug);
      // Strip the title field from frontmatter we persist — the note
      // row's title column is the source of truth.
      const { title: _omitTitle, ...persistedFrontmatter } =
        parsed.frontmatter;
      const note = await getRepo().createNote(
        {
          vaultId: input.vaultId,
          folderId: input.folderId,
          slug: input.slug,
          title,
          contentMd: parsed.contentMd,
          frontmatter: persistedFrontmatter,
        },
        userId,
      );
      return {
        noteId: note.id,
        versionId: note.versionId,
        frontmatterKeyCount: Object.keys(persistedFrontmatter).length,
      };
    }),

  // ============================================================
  // Track A — Obsidian-style FS-sync surface
  // ADR: docs/architecture/agent-studio-vault-fs-sync.md
  // ============================================================

  /**
   * Set or clear a vault's on-disk sync path. Admin-gated by the
   * caller (the procedure itself is `protectedProcedure`; the future
   * admin role check lives one layer up alongside other admin
   * gates). Passing `path: null` disables sync and stops the watcher.
   *
   * Validation pipeline:
   *  1. Path string shape (absolute, no obvious traversal).
   *  2. `assertVaultRootIsConfigurable` enforces the
   *     VAULT_FS_SYNC_ALLOWED_ROOTS env contract.
   *  3. Persist via `setVaultFsSyncPath`.
   *  4. Restart the watcher manager so the new root (or null) takes
   *     effect immediately.
   */
  setFsSyncPath: protectedProcedure
    .input(
      z.object({
        vaultId: z.number().int().positive(),
        path: z.string().min(1).max(2048).nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      const { assertVaultRootIsConfigurable, defaultWatcherManager, FsSyncError } =
        await import("./fs-sync/index.js");
      const repo = getRepo();
      if (input.path !== null) {
        try {
          assertVaultRootIsConfigurable(input.path);
        } catch (e) {
          if (e instanceof FsSyncError) {
            throwTrpcAndCapture(
              new TRPCError({ code: "BAD_REQUEST", message: e.message }),
            );
          }
          throw e;
        }
      }
      // Track A — A8 — capture prior state BEFORE the persistence
      // step so we can detect the disabled → enabled transition and
      // auto-fire the initial backfill (in the background).
      const priorPath = await repo.getVaultFsSyncPath(input.vaultId);
      await repo.setVaultFsSyncPath(input.vaultId, input.path);
      if (input.path === null) {
        await defaultWatcherManager.stop(input.vaultId);
      } else {
        // Track A — A6 — wire the FS → DB upsert handler. Each
        // watcher event flows through handleWatcherEvent which does
        // hash-based echo prevention + parse + upsert.
        const { handleWatcherEvent, runInitialBackfill } = await import(
          "./fs-sync-integration.js"
        );
        await defaultWatcherManager.getOrStart({
          vaultId: input.vaultId,
          vaultRoot: input.path,
          onEvent: async (event) => {
            await handleWatcherEvent(repo, event);
          },
        });
        // Track A — A8 — auto-fire the initial backfill on the
        // disabled → enabled transition. Runs in the background so
        // the operator's mutation response returns immediately.
        // Failures are logged but don't fail the mutation. Re-
        // enabling the same path is idempotent — the writer's echo
        // guard skips notes whose hash already matches what's on
        // disk.
        if (priorPath === null) {
          void (async () => {
            try {
              await runInitialBackfill(repo, input.vaultId);
            } catch (e) {
              console.warn(
                `[fs-sync] auto-backfill failed for vaultId=${input.vaultId}:`,
                e,
              );
            }
          })();
        }
      }
      return {
        vaultId: input.vaultId,
        fsSyncPath: input.path,
        priorPath,
        autoBackfillFired: priorPath === null && input.path !== null,
      };
    }),

  /**
   * Returns the current FS-sync status for a vault. Used by the
   * settings UI (A7) to render the path + enabled-state + watcher-
   * running indicator.
   */
  getFsSyncStatus: protectedProcedure
    .input(z.object({ vaultId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const { defaultWatcherManager } = await import("./fs-sync/index.js");
      const repo = getRepo();
      const fsSyncPath = await repo.getVaultFsSyncPath(input.vaultId);
      return {
        vaultId: input.vaultId,
        enabled: fsSyncPath !== null,
        fsSyncPath,
        watcherRunning: defaultWatcherManager.has(input.vaultId),
        watcherRoot: defaultWatcherManager.vaultRootFor(input.vaultId),
      };
    }),

  /**
   * Manually trigger a one-shot export of every note in the vault to
   * disk. Idempotent — notes whose current contentMd hash matches
   * the stored `fs_sync_last_hash` are skipped. Operators invoke this
   * after a manual `rm -rf` of the vault folder or to verify the
   * sync state. A8 hardens the initial-backfill flow (auto-fire on
   * first `setFsSyncPath`); this PR ships the manual path.
   */
  triggerInitialBackfill: protectedProcedure
    .input(z.object({ vaultId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      // Track A — A8 — delegates to the shared runInitialBackfill
      // helper so the manual-trigger path and the auto-fire path in
      // setFsSyncPath go through the same code.
      const { runInitialBackfill } = await import(
        "./fs-sync-integration.js"
      );
      const repo = getRepo();
      const result = await runInitialBackfill(repo, input.vaultId);
      if (result === null) {
        throwTrpcAndCapture(
          new TRPCError({
            code: "BAD_REQUEST",
            message: `Vault ${input.vaultId} has no fs_sync_path set`,
          }),
        );
      }
      return result;
    }),

  // ============================================================
  // Phase 15 — Attachments
  // ============================================================

  createAttachment: protectedProcedure
    .input(
      z.object({
        vaultId: z.number().int().positive(),
        noteId: z.number().int().positive().optional(),
        filename: z.string().min(1).max(500),
        mimeType: z.string().min(1).max(100),
        sizeBytes: z.number().int().nonnegative(),
        storageUri: z.string().min(1),
        contentHash: z.string().min(1).max(64),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id ?? 1;
      // T-B.2 — the quota guard now lives INSIDE `createAttachment`
      // so every caller (router, future ingestion / seed paths, etc.)
      // gets the same defense. The router only translates the
      // service-thrown `AttachmentQuotaExceededError` to TRPCError
      // FORBIDDEN; bytesLimit resolution stays the env default.
      try {
        const attachment = await createAttachment(input, userId);
        return {
          ...attachment,
          embedSnippet: buildAttachmentEmbedSnippet(attachment),
        };
      } catch (e) {
        if (e instanceof AttachmentQuotaExceededError) {
          throwTrpcAndCapture(new TRPCError({
            code: "FORBIDDEN",
            message: e.message,
            cause: e,
          }));
        }
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  listAttachments: protectedProcedure
    .input(
      z
        .object({
          vaultId: z.number().int().positive().optional(),
          noteId: z.number().int().positive().optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .refine(
          (v) => v.vaultId !== undefined || v.noteId !== undefined,
          { message: "vaultId or noteId is required" },
        ),
    )
    .query(async ({ input }) => {
      try {
        const attachments = await listAttachments(input);
        return attachments.map((a) => ({
          ...a,
          embedSnippet: buildAttachmentEmbedSnippet(a),
        }));
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  /**
   * V1+ 15-δ (PR-V1-64): get a vault's attachment storage quota.
   * Wraps `computeAttachmentQuota` from #760's attachment-library
   * service. Reads `AGS_VAULT_ATTACHMENT_BYTES_LIMIT` via the same
   * `resolveDefaultAttachmentBytesLimit` helper #771 uses to enforce
   * the write-gate, so the panel's "X% used" line matches the actual
   * `createAttachment` rejection threshold bit-for-bit.
   */
  getAttachmentQuota: protectedProcedure
    .input(z.object({ vaultId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        return await computeAttachmentQuota(input.vaultId, {
          bytesLimit: resolveDefaultAttachmentBytesLimit(),
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  getAttachment: protectedProcedure
    .input(z.object({ attachmentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const attachment = await getAttachmentById(input.attachmentId);
      if (!attachment) {
        throwTrpcAndCapture(new TRPCError({
          code: "NOT_FOUND",
          message: `Attachment ${input.attachmentId} not found`,
        }));
      }
      return {
        ...attachment,
        embedSnippet: buildAttachmentEmbedSnippet(attachment),
      };
    }),

  linkAttachmentToNote: protectedProcedure
    .input(
      z.object({
        attachmentId: z.number().int().positive(),
        noteId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await linkAttachmentToNote(input.attachmentId, input.noteId);
      } catch (e) {
        if (e instanceof AttachmentNotFoundError) {
          throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: e.message }));
        }
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  unlinkAttachmentFromNote: protectedProcedure
    .input(z.object({ attachmentId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        return await unlinkAttachmentFromNote(input.attachmentId);
      } catch (e) {
        if (e instanceof AttachmentNotFoundError) {
          throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: e.message }));
        }
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  markAttachmentAsSourceArtifact: protectedProcedure
    .input(z.object({ attachmentId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        return await markAttachmentAsSourceArtifact(input.attachmentId);
      } catch (e) {
        if (e instanceof AttachmentNotFoundError) {
          throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: e.message }));
        }
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  // ============================================================
  // Phase 16 §1-§4 — Saved Views
  // ============================================================

  createSavedView: protectedProcedure
    .input(
      z.object({
        vaultId: z.number().int().positive(),
        name: z.string().min(1).max(255),
        viewKind: z.string().min(1).max(50),
        filters: z.record(z.string(), z.unknown()).optional(),
        sort: z.record(z.string(), z.unknown()).optional(),
        columns: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      try {
        return await createSavedView({
          vaultId: input.vaultId,
          ownerUserId: userId,
          name: input.name,
          viewKind: input.viewKind,
          filters: input.filters,
          sort: input.sort,
          columns: input.columns,
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  listSavedViews: protectedProcedure
    .input(
      z.object({
        vaultId: z.number().int().positive(),
        ownerScope: z.enum(["mine", "all"]).optional(),
        viewKind: z.string().min(1).max(50).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      const ownerUserId =
        input.ownerScope === "mine" ? userId ?? null : undefined;
      try {
        return await listSavedViews({
          vaultId: input.vaultId,
          ownerUserId,
          viewKind: input.viewKind,
          limit: input.limit,
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  getSavedView: protectedProcedure
    .input(z.object({ viewId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const view = await getSavedViewById(input.viewId);
      if (!view) {
        throwTrpcAndCapture(new TRPCError({
          code: "NOT_FOUND",
          message: `Saved view ${input.viewId} not found`,
        }));
      }
      return view;
    }),

  // V1+ Phase 16-β follow-up: viewer-scoped saved-view listing.
  // Wraps the service-layer `listVisibleSavedViewsForUser` so the
  // client can ask for "all saved views I'm allowed to see in this
  // vault" without thinking about visibility semantics.
  listVisibleSavedViews: protectedProcedure
    .input(
      z.object({
        vaultId: z.number().int().positive(),
        ownerScope: z.enum(["mine", "all"]).optional(),
        viewKind: z.string().min(1).max(50).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id ?? null;
      const ownerUserId =
        input.ownerScope === "mine" ? userId : undefined;
      try {
        return await listVisibleSavedViewsForUser({
          vaultId: input.vaultId,
          ownerUserId,
          viewKind: input.viewKind,
          limit: input.limit,
          viewerUserId: userId,
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  // V1+ Phase 16-γ surface: version history.
  listSavedViewVersions: protectedProcedure
    .input(z.object({ savedViewId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        return await listSavedViewVersions(input.savedViewId);
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  getSavedViewVersion: protectedProcedure
    .input(z.object({ versionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const version = await getSavedViewVersionById(input.versionId);
      if (!version) {
        throwTrpcAndCapture(new TRPCError({
          code: "NOT_FOUND",
          message: `Saved view version ${input.versionId} not found`,
        }));
      }
      return version;
    }),

  updateSavedView: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(255).optional(),
        filters: z.record(z.string(), z.unknown()).optional(),
        sort: z.record(z.string(), z.unknown()).optional(),
        columns: z.array(z.string()).optional(),
        // T-F.97 (T-F.2-θ): operator-facing visibility flip. The
        // service-level `updateSavedView()` has accepted `visibility`
        // since Phase 16-α; only the tRPC Zod schema was missing it.
        visibility: z
          .enum(["personal", "workspace_shared"])
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await updateSavedView(input);
      } catch (e) {
        if (e instanceof SavedViewNotFoundError) {
          throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: e.message }));
        }
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  deleteSavedView: protectedProcedure
    .input(z.object({ viewId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        return await deleteSavedView(input.viewId);
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  // T-F.118 (T-F.2-ζ.2): bulk-delete saved views. Cap at 200 IDs
  // per call (Postgres `IN (...)` parameter explosion stays
  // bounded; consistent with `bulkDismissFindings.max(500)` shape
  // but lower since saved-view deletions are operator-driven
  // bulk-cleanup, not a Quality-Lens-scale finding stream).
  deleteSavedViews: protectedProcedure
    .input(
      z.object({
        viewIds: z.array(z.number().int().positive()).min(0).max(200),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await deleteSavedViews(input.viewIds);
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  // ============================================================
  // Phase 16 §5-§7 — View-kind blueprints (UI starting shapes)
  // ============================================================

  listViewKindBlueprints: protectedProcedure.query(() => {
    return listViewKindBlueprints();
  }),

  getViewKindBlueprint: protectedProcedure
    .input(z.object({ viewKind: z.string().min(1).max(50) }))
    .query(({ input }) => {
      const blueprint = getViewKindBlueprint(input.viewKind);
      if (!blueprint) {
        throwTrpcAndCapture(new TRPCError({
          code: "NOT_FOUND",
          message: `No blueprint registered for viewKind="${input.viewKind}"`,
        }));
      }
      return blueprint;
    }),

  createNoteFromTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.number().int().positive(),
        vaultId: z.number().int().positive(),
        folderId: z.number().int().positive().optional(),
        slug: z.string().min(1).max(255),
        title: z.string().min(1).max(500),
        variables: z
          .record(
            z.string(),
            z.union([
              z.string(),
              z.number(),
              z.boolean(),
              z.null(),
            ]),
          )
          .optional(),
        frontmatterOverrides: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id ?? 1;

      const template = await getTemplateById(input.templateId);
      if (!template) {
        throwTrpcAndCapture(new TRPCError({
          code: "NOT_FOUND",
          message: `Template ${input.templateId} not found`,
        }));
      }

      const rendered = renderTemplate({
        contentMd: template.contentMd,
        frontmatterDefaults: template.frontmatterDefaults,
        variables: input.variables,
        frontmatterOverrides: input.frontmatterOverrides,
      });

      const note = await getRepo().createNote(
        {
          vaultId: input.vaultId,
          folderId: input.folderId,
          slug: input.slug,
          title: input.title,
          contentMd: rendered.contentMd,
          frontmatter: rendered.frontmatter,
        },
        userId,
      );
      // Phase 15-α — record the instantiation in the ledger so
      // future refactors can find every note created from this
      // template version. ASDB-unavailable paths no-op.
      await recordTemplateInstantiation({
        templateId: input.templateId,
        noteId: note.id,
        noteVersionId: note.versionId,
        templateVersionDigest: computeTemplateDigest(template.contentMd),
        instantiatedByUserId: userId,
        context: {
          variables: input.variables ?? null,
          frontmatterOverrides: input.frontmatterOverrides ?? null,
        },
      });
      return {
        noteId: note.id,
        versionId: note.versionId,
        templateKey: template.templateKey,
      };
    }),

  /**
   * V1+ Phase 15-δ follow-up (PR-V1-164): expose the existing
   * `listInstantiationsByTemplate` / `listInstantiationsByNote` /
   * `countDistinctDigestsForTemplate` helpers via tRPC. The
   * underlying service has shipped since Phase 15-α (#750) but no
   * router exposure existed — operators couldn't ask "which notes
   * were created from template X?" or "how many distinct digests
   * has this template churned through?" without a direct DB query.
   *
   * All three are protected reads (any logged-in user can inspect
   * their workspace's vault history; the underlying ledger is
   * already workspace-scoped via the `templateId` FK).
   */
  listInstantiationsByTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.number().int().positive(),
        limit: z.number().int().positive().max(500).optional(),
      }),
    )
    .query(async ({ input }) => {
      return listInstantiationsByTemplate(input.templateId, input.limit ?? 100);
    }),

  listInstantiationsByNote: protectedProcedure
    .input(z.object({ noteId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return listInstantiationsByNote(input.noteId);
    }),

  countDistinctDigestsForTemplate: protectedProcedure
    .input(z.object({ templateId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return {
        templateId: input.templateId,
        distinctDigests: await countDistinctDigestsForTemplate(
          input.templateId,
        ),
      };
    }),
});

export type VaultRouter = typeof vaultRouter;
