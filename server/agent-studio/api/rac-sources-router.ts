/**
 * Agent Studio — RAC Source Registry tRPC sub-router.
 *
 * RAC Phase 2. Backend surface for the source-registry CRUD that
 * lets an agent declare its retrieval profile, sources, and policy
 * overrides ahead of P3 ingestion / P4 retrieval.
 *
 * Procedures (all `protectedProcedure`; mutations carry no high
 * blast-radius — a row in ags_rac_* can be edited freely. The
 * D-EMB-5 fail-closed gate lives in the store, not here):
 *
 *   profile.create / get / listForDraft / update
 *   source.create / get / listForProfile / listForWorkspace / update / delete
 *   policy.get / upsert
 *   workspaceEmbeddingDefault.get / upsert
 *
 * `EmbeddingDefaultRequiredError` from the store surfaces here as a
 * tRPC `BAD_REQUEST` with code `embedding_default_required`, so the
 * UI can prompt the operator to register a workspace default.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../_core/trpc";
import {
  createProfile,
  getProfile,
  listProfilesForDraft,
  updateProfile,
  createSource,
  getSource,
  listSourcesForProfile,
  listSourcesForWorkspace,
  updateSource,
  deleteSource,
  getPolicyForProfile,
  upsertPolicy,
  getWorkspaceEmbeddingDefault,
  upsertWorkspaceEmbeddingDefault,
  EmbeddingDefaultRequiredError,
  RAC_SOURCE_TYPES,
} from "../services/rac/sources";

const sourceTypeSchema = z.enum(RAC_SOURCE_TYPES);
const ownerModuleSchema = z.enum([
  "agentStudio",
  "dataAnalysis",
  "projectsSystem",
  "external",
]);
const policyVerdictSchema = z.enum(["warn", "block", "none"]);

const profileIdSchema = z.object({ profileId: z.number().int().positive() });
const sourceIdSchema = z.object({ sourceId: z.number().int().positive() });

export const racSourcesRouter = router({
  // ── Profile ──────────────────────────────────────────────────────
  profile: router({
    create: protectedProcedure
      .input(
        z.object({
          workspaceId: z.number().int().positive(),
          agentId: z.number().int().positive(),
          agentDraftId: z.number().int().positive(),
          profileKey: z.string().min(1).max(64).optional(),
          enabled: z.boolean().optional(),
          timeoutMs: z.number().int().positive().nullable().optional(),
          notes: z.string().max(2048).nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return createProfile({ ...input, createdBy: ctx.user.id });
      }),

    get: protectedProcedure
      .input(profileIdSchema)
      .query(async ({ input }) => {
        const p = await getProfile(input.profileId);
        if (!p) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `RAC profile ${input.profileId} not found`,
          });
        }
        return p;
      }),

    listForDraft: protectedProcedure
      .input(z.object({ agentDraftId: z.number().int().positive() }))
      .query(async ({ input }) => {
        return listProfilesForDraft(input.agentDraftId);
      }),

    update: protectedProcedure
      .input(
        profileIdSchema.extend({
          enabled: z.boolean().optional(),
          timeoutMs: z.number().int().positive().nullable().optional(),
          notes: z.string().max(2048).nullable().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        return updateProfile(input);
      }),
  }),

  // ── Source ───────────────────────────────────────────────────────
  source: router({
    create: protectedProcedure
      .input(
        z.object({
          workspaceId: z.number().int().positive(),
          profileId: z.number().int().positive(),
          sourceType: sourceTypeSchema,
          ownerModule: ownerModuleSchema,
          externalRefId: z.string().max(255).nullable().optional(),
          displayName: z.string().max(255).nullable().optional(),
          enabled: z.boolean().optional(),
          priority: z.number().int().min(0).max(100).optional(),
          embeddingProviderConnectionId: z.number().int().positive().nullable().optional(),
          embeddingModelRef: z.string().max(255).nullable().optional(),
          embeddingModelDim: z.number().int().positive().nullable().optional(),
          embeddingModelVersion: z.string().max(64).nullable().optional(),
          chunkSizeOverride: z.number().int().positive().nullable().optional(),
          chunkOverlapOverride: z.number().int().min(0).nullable().optional(),
          metadataJson: z.record(z.string(), z.unknown()).nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await createSource({ ...input, createdBy: ctx.user.id });
        } catch (err) {
          if (err instanceof EmbeddingDefaultRequiredError) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: err.message,
              cause: { code: err.code },
            });
          }
          throw err;
        }
      }),

    get: protectedProcedure
      .input(sourceIdSchema)
      .query(async ({ input }) => {
        const s = await getSource(input.sourceId);
        if (!s) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `RAC source ${input.sourceId} not found`,
          });
        }
        return s;
      }),

    listForProfile: protectedProcedure
      .input(profileIdSchema)
      .query(async ({ input }) => {
        return listSourcesForProfile(input.profileId);
      }),

    listForWorkspace: protectedProcedure
      .input(
        z.object({
          workspaceId: z.number().int().positive(),
          sourceType: sourceTypeSchema.optional(),
        }),
      )
      .query(async ({ input }) => {
        return listSourcesForWorkspace(input.workspaceId, input.sourceType);
      }),

    update: protectedProcedure
      .input(
        sourceIdSchema.extend({
          enabled: z.boolean().optional(),
          priority: z.number().int().min(0).max(100).optional(),
          displayName: z.string().max(255).nullable().optional(),
          embeddingProviderConnectionId: z.number().int().positive().nullable().optional(),
          embeddingModelRef: z.string().max(255).nullable().optional(),
          embeddingModelDim: z.number().int().positive().nullable().optional(),
          embeddingModelVersion: z.string().max(64).nullable().optional(),
          chunkSizeOverride: z.number().int().positive().nullable().optional(),
          chunkOverlapOverride: z.number().int().min(0).nullable().optional(),
          metadataJson: z.record(z.string(), z.unknown()).nullable().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        return updateSource(input);
      }),

    delete: protectedProcedure
      .input(sourceIdSchema)
      .mutation(async ({ input }) => {
        await deleteSource(input.sourceId);
        return { sourceId: input.sourceId, deleted: true };
      }),
  }),

  // ── Policy ───────────────────────────────────────────────────────
  policy: router({
    get: protectedProcedure
      .input(profileIdSchema)
      .query(async ({ input }) => {
        return getPolicyForProfile(input.profileId);
      }),

    upsert: protectedProcedure
      .input(
        z.object({
          workspaceId: z.number().int().positive(),
          profileId: z.number().int().positive(),
          minScore: z.number().min(0).max(1).nullable().optional(),
          maxChunks: z.number().int().positive().nullable().optional(),
          dedupeBy: z.string().max(32).nullable().optional(),
          freshnessMaxAgeDays: z.number().int().positive().nullable().optional(),
          citationRequired: z.boolean().nullable().optional(),
          sourcePermissionFilter: z.string().max(64).nullable().optional(),
          piiPolicy: policyVerdictSchema.nullable().optional(),
          licensePolicy: policyVerdictSchema.nullable().optional(),
          // U5-b.3: per-policy license blocklist consumed by the
          // retrieval filter when licensePolicy="block". Bounded to
          // 32 entries × 64 chars to match the column shape; longer
          // lists indicate a policy-design mismatch.
          licenseBlocklist: z
            .array(z.string().min(1).max(64))
            .max(32)
            .nullable()
            .optional(),
          timeoutMs: z.number().int().positive().nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return upsertPolicy({ ...input, createdBy: ctx.user.id });
      }),
  }),

  // ── Workspace embedding default (D-EMB-4) ────────────────────────
  workspaceEmbeddingDefault: router({
    get: protectedProcedure
      .input(z.object({ workspaceId: z.number().int().positive() }))
      .query(async ({ input }) => {
        return getWorkspaceEmbeddingDefault(input.workspaceId);
      }),

    upsert: protectedProcedure
      .input(
        z.object({
          workspaceId: z.number().int().positive(),
          embeddingProviderConnectionId: z.number().int().positive(),
          embeddingModelRef: z.string().min(1).max(255),
          embeddingModelDim: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return upsertWorkspaceEmbeddingDefault({
          ...input,
          createdBy: ctx.user.id,
        });
      }),
  }),
});
