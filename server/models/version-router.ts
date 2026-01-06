import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as versionService from "./version-service";

/**
 * Model Version tRPC Router
 * Handles model version management, changelogs, and version switching
 */

export const modelVersionRouter = router({
  // Get all versions for a model
  getVersions: protectedProcedure
    .input(z.object({ modelId: z.number() }))
    .query(async ({ input }) => {
      return versionService.getModelVersions(input.modelId);
    }),

  // Get a specific version
  getVersion: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .query(async ({ input }) => {
      return versionService.getModelVersion(input.versionId);
    }),

  // Get the latest version for a model
  getLatest: protectedProcedure
    .input(z.object({ modelId: z.number() }))
    .query(async ({ input }) => {
      return versionService.getLatestModelVersion(input.modelId);
    }),

  // Create a new version
  create: protectedProcedure
    .input(
      z.object({
        modelId: z.number(),
        version: z.string(),
        releaseDate: z.date().optional(),
        sourceUrl: z.string().optional(),
        fileSize: z.string().optional(),
        checksum: z.string().optional(),
        changelog: z.string().optional(),
        isLatest: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const versionId = await versionService.createModelVersion(input);
      return { versionId };
    }),

  // Set a version as latest
  setLatest: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .mutation(async ({ input }) => {
      await versionService.setLatestVersion(input.versionId);
      return { success: true };
    }),

  // Deprecate a version
  deprecate: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .mutation(async ({ input }) => {
      await versionService.deprecateVersion(input.versionId);
      return { success: true };
    }),

  // Update version changelog
  updateChangelog: protectedProcedure
    .input(
      z.object({
        versionId: z.number(),
        changelog: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      await versionService.updateVersionChangelog(input.versionId, input.changelog);
      return { success: true };
    }),

  // Delete a version
  delete: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .mutation(async ({ input }) => {
      await versionService.deleteModelVersion(input.versionId);
      return { success: true };
    }),
});
