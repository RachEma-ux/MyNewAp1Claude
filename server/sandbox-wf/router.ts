/**
 * Sandbox WF — tRPC Router
 *
 * API surface for the WfDB module.
 * Namespace: sandboxWf.*
 */

import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import * as service from "./service";
import { seedWfDb } from "./seed";

export const sandboxWfRouter = router({
  // ── Workflows ──────────────────────────────────────────────────────────────
  workflows: router({
    list: publicProcedure
      .input(
        z.object({
          category: z.string().optional(),
          status: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        return service.listWorkflows(input?.category, input?.status);
      }),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return service.getWorkflow(input.id);
      }),

    create: publicProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          category: z.string(),
          status: z.string().optional(),
          tags: z.array(z.string()).optional(),
          updatedAgo: z.string().optional(),
          steps: z.array(
            z.object({
              key: z.string(),
              label: z.string(),
              description: z.string().optional(),
              status: z.string().optional(),
            })
          ).optional(),
        })
      )
      .mutation(async ({ input }) => {
        return service.createWorkflow(input);
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          category: z.string().optional(),
          status: z.string().optional(),
          tags: z.array(z.string()).optional(),
          updatedAgo: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return service.updateWorkflow(id, data);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return service.deleteWorkflow(input.id);
      }),
  }),

  // ── Steps ──────────────────────────────────────────────────────────────────
  steps: router({
    updateStatus: publicProcedure
      .input(
        z.object({
          workflowId: z.number(),
          stepKey: z.string(),
          status: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        return service.updateStepStatus(input.workflowId, input.stepKey, input.status);
      }),
  }),

  // ── Triggers ───────────────────────────────────────────────────────────────
  triggers: router({
    list: publicProcedure
      .input(z.object({ workflowId: z.number().optional() }).optional())
      .query(async ({ input }) => {
        return service.listTriggers(input?.workflowId);
      }),

    create: publicProcedure
      .input(
        z.object({
          workflowId: z.number(),
          name: z.string(),
          type: z.string(),
          config: z.record(z.any()).optional(),
          status: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return service.createTrigger(input);
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          type: z.string().optional(),
          config: z.record(z.any()).optional(),
          status: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return service.updateTrigger(id, data);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return service.deleteTrigger(input.id);
      }),
  }),

  // ── Executions ─────────────────────────────────────────────────────────────
  executions: router({
    list: publicProcedure
      .input(z.object({ workflowId: z.number().optional() }).optional())
      .query(async ({ input }) => {
        return service.listExecutions(input?.workflowId);
      }),

    create: publicProcedure
      .input(
        z.object({
          workflowId: z.number(),
          triggerType: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return service.createExecution(input.workflowId, input.triggerType);
      }),

    getLogs: publicProcedure
      .input(z.object({ executionId: z.number() }))
      .query(async ({ input }) => {
        return service.getExecutionLogs(input.executionId);
      }),
  }),

  // ── Versions ───────────────────────────────────────────────────────────────
  versions: router({
    list: publicProcedure
      .input(z.object({ workflowId: z.number() }))
      .query(async ({ input }) => {
        return service.listVersions(input.workflowId);
      }),

    create: publicProcedure
      .input(z.object({ workflowId: z.number() }))
      .mutation(async ({ input }) => {
        return service.createVersion(input.workflowId);
      }),

    restore: publicProcedure
      .input(z.object({ workflowId: z.number(), versionId: z.number() }))
      .mutation(async ({ input }) => {
        return service.restoreVersion(input.workflowId, input.versionId);
      }),
  }),

  // ── Templates ──────────────────────────────────────────────────────────────
  templates: router({
    list: publicProcedure.query(async () => {
      return service.listTemplates();
    }),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return service.getTemplate(input.id);
      }),

    createFrom: publicProcedure
      .input(z.object({ templateId: z.number(), name: z.string().optional() }))
      .mutation(async ({ input }) => {
        return service.createFromTemplate(input.templateId, input.name || "");
      }),
  }),

  // ── Catalog Imports ────────────────────────────────────────────────────────
  catalogImports: router({
    list: publicProcedure.query(async () => {
      return service.listCatalogImports();
    }),

    import: publicProcedure
      .input(
        z.object({
          catalogEntryId: z.number(),
          entryType: z.string(),
          name: z.string(),
          description: z.string().optional(),
          category: z.string().optional(),
          tags: z.array(z.string()).optional(),
          config: z.record(z.any()).optional(),
        })
      )
      .mutation(async ({ input }) => {
        return service.importCatalogEntry(input);
      }),

    remove: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return service.removeCatalogImport(input.id);
      }),
  }),

  // ── Stats ──────────────────────────────────────────────────────────────────
  stats: publicProcedure.query(async () => {
    return service.getStats();
  }),

  // ── Seed (idempotent) ──────────────────────────────────────────────────────
  seed: publicProcedure.mutation(async () => {
    const result = await seedWfDb();
    return { success: true, ...result };
  }),
});
