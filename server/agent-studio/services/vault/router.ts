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
import { NoteCreateInput, NoteUpdateInput, VaultCreateInput, VaultMemberAddInput, SearchInput } from "./contracts.js";
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
  exportNoteAsMarkdown,
  parseMarkdownBlob,
} from "./markdown-import-export.js";
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
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e instanceof Error ? e.message : String(e) });
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

  getNote: protectedProcedure
    .input(z.object({ noteId: z.number().int() }))
    .query(async ({ input }) => {
      const note = await getRepo().getNoteById(input.noteId);
      if (!note) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Note ${input.noteId} not found` });
      }
      const latest = await getRepo().getLatestNoteVersion(input.noteId);
      return { note, latestVersion: latest };
    }),

  getNoteVersion: protectedProcedure
    .input(z.object({ noteId: z.number().int(), version: z.number().int() }))
    .query(async ({ input }) => {
      const version = await getRepo().getNoteVersion(input.noteId, input.version);
      if (!version) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Version ${input.version} not found for note ${input.noteId}` });
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
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        });
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
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        });
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
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Note ${input.noteId} not found`,
          });
        }
        return result;
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        });
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
      try {
        const attachment = await createAttachment(input, userId);
        return {
          ...attachment,
          embedSnippet: buildAttachmentEmbedSnippet(attachment),
        };
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        });
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
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }),

  getAttachment: protectedProcedure
    .input(z.object({ attachmentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const attachment = await getAttachmentById(input.attachmentId);
      if (!attachment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Attachment ${input.attachmentId} not found`,
        });
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
          throw new TRPCError({ code: "NOT_FOUND", message: e.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }),

  unlinkAttachmentFromNote: protectedProcedure
    .input(z.object({ attachmentId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        return await unlinkAttachmentFromNote(input.attachmentId);
      } catch (e) {
        if (e instanceof AttachmentNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: e.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }),

  markAttachmentAsSourceArtifact: protectedProcedure
    .input(z.object({ attachmentId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        return await markAttachmentAsSourceArtifact(input.attachmentId);
      } catch (e) {
        if (e instanceof AttachmentNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: e.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        });
      }
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
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Template ${input.templateId} not found`,
        });
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
      return {
        noteId: note.id,
        versionId: note.versionId,
        templateKey: template.templateKey,
      };
    }),
});

export type VaultRouter = typeof vaultRouter;
