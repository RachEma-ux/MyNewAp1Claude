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
import { router, protectedProcedure } from "../../../_core/trpc.js";
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
  assertWithinQuota,
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
      // Side-effect: extract links and stage projection event payload.
      // The projection sync worker (when wired) picks this up.
      const extraction = extractLinksFromMarkdown(input.contentMd);
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
      return { conflict: false, versionId: result.versionId };
    }),

  deleteNote: protectedProcedure
    .input(NoteDeleteInput)
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as unknown as { user?: { id?: number } }).user?.id ?? 1;
      const result = await getRepo().deleteNote(input, userId);
      if (result.deleted) {
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
      // V1+ Phase 15-γ wire-up (#770): enforce attachment quota
      // BEFORE the insert. The default bytes limit is resolved from
      // `AGS_VAULT_ATTACHMENT_BYTES_LIMIT`; unset → null → guard is
      // a no-op (unlimited storage, pre-15-γ default).
      try {
        await assertWithinQuota({
          vaultId: input.vaultId,
          sizeBytesAdded: input.sizeBytes,
          bytesLimit: resolveDefaultAttachmentBytesLimit(),
        });
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
      try {
        const attachment = await createAttachment(input, userId);
        return {
          ...attachment,
          embedSnippet: buildAttachmentEmbedSnippet(attachment),
        };
      } catch (e) {
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
