import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import * as llmDb from './db';

/**
 * LLM Control Plane Router
 * Manages LLM configurations with immutable versioning
 */
export const llmRouter = router({
  // ============================================================================
  // LLM Management
  // ============================================================================

  /**
   * List all LLMs
   */
  list: protectedProcedure
    .input(z.object({
      includeArchived: z.boolean().optional().default(false),
    }))
    .query(async ({ input }) => {
      return await llmDb.listLlms(input.includeArchived);
    }),

  /**
   * List all LLMs with their latest versions
   */
  listWithVersions: protectedProcedure
    .input(z.object({
      includeArchived: z.boolean().optional().default(false),
    }))
    .query(async ({ input }) => {
      return await llmDb.listLlmsWithLatestVersions(input.includeArchived);
    }),

  /**
   * Get a single LLM by ID
   */
  get: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ input }) => {
      const llm = await llmDb.getLlmById(input.id);
      if (!llm) {
        throw new Error(`LLM not found: ${input.id}`);
      }
      return llm;
    }),

  /**
   * Get an LLM with its latest version
   */
  getWithLatestVersion: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ input }) => {
      const result = await llmDb.getLlmWithLatestVersion(input.id);
      if (!result) {
        throw new Error(`LLM not found: ${input.id}`);
      }
      return result;
    }),

  /**
   * Create a new LLM with its first version
   */
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      runtime: z.enum(['local', 'cloud']),
      provider: z.string().optional(),
      config: z.record(z.any()), // Full configuration as JSON
      changeNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Create the LLM
      const llm = await llmDb.createLlm({
        name: input.name,
        description: input.description,
        runtime: input.runtime,
        provider: input.provider,
        createdBy: ctx.user.id,
      });

      // Create the first version
      const version = await llmDb.createLlmVersion({
        llmId: llm.id,
        version: 1,
        config: input.config,
        changeNotes: input.changeNotes || 'Initial version',
        changeType: 'created',
        createdBy: ctx.user.id,
      });

      return { llm, version };
    }),

  /**
   * Create a new version of an existing LLM (immutable edit)
   */
  createVersion: protectedProcedure
    .input(z.object({
      llmId: z.number(),
      config: z.record(z.any()), // Full configuration as JSON
      changeNotes: z.string().optional(),
      changeType: z.enum(['created', 'edited', 'cloned']).optional().default('edited'),
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify LLM exists
      const llm = await llmDb.getLlmById(input.llmId);
      if (!llm) {
        throw new Error(`LLM not found: ${input.llmId}`);
      }

      // Get next version number
      const nextVersion = await llmDb.getNextVersionNumber(input.llmId);

      // Create new version
      const version = await llmDb.createLlmVersion({
        llmId: input.llmId,
        version: nextVersion,
        config: input.config,
        changeNotes: input.changeNotes || `Version ${nextVersion}`,
        changeType: input.changeType,
        createdBy: ctx.user.id,
      });

      return { llm, version };
    }),

  /**
   * Clone an existing LLM (creates a new LLM with copied config)
   */
  clone: protectedProcedure
    .input(z.object({
      sourceId: z.number(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      changeNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Get source LLM with its latest version
      const source = await llmDb.getLlmWithLatestVersion(input.sourceId);
      if (!source) {
        throw new Error(`Source LLM not found: ${input.sourceId}`);
      }

      // Create new LLM
      const llm = await llmDb.createLlm({
        name: input.name,
        description: input.description || `Cloned from ${source.llm.name}`,
        runtime: source.llm.runtime,
        provider: source.llm.provider,
        createdBy: ctx.user.id,
      });

      // Create first version with cloned config
      const version = await llmDb.createLlmVersion({
        llmId: llm.id,
        version: 1,
        config: source.version.config,
        changeNotes: input.changeNotes || `Cloned from ${source.llm.name} (version ${source.version.version})`,
        changeType: 'cloned',
        createdBy: ctx.user.id,
      });

      return { llm, version, source };
    }),

  /**
   * Archive an LLM (soft delete)
   */
  archive: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ input }) => {
      await llmDb.archiveLlm(input.id);
      return { success: true };
    }),

  /**
   * Delete an LLM permanently (including all versions)
   */
  delete: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ input }) => {
      await llmDb.deleteLlm(input.id);
      return { success: true };
    }),

  // ============================================================================
  // Version Management
  // ============================================================================

  /**
   * Get all versions of an LLM
   */
  listVersions: protectedProcedure
    .input(z.object({
      llmId: z.number(),
    }))
    .query(async ({ input }) => {
      return await llmDb.listLlmVersions(input.llmId);
    }),

  /**
   * Get a specific version
   */
  getVersion: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ input }) => {
      const version = await llmDb.getLlmVersionById(input.id);
      if (!version) {
        throw new Error(`Version not found: ${input.id}`);
      }
      return version;
    }),

  /**
   * Get the latest version of an LLM
   */
  getLatestVersion: protectedProcedure
    .input(z.object({
      llmId: z.number(),
    }))
    .query(async ({ input }) => {
      const version = await llmDb.getLatestLlmVersion(input.llmId);
      if (!version) {
        throw new Error(`No versions found for LLM: ${input.llmId}`);
      }
      return version;
    }),
});
