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
});

export type VaultRouter = typeof vaultRouter;
