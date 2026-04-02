/**
 * PSM Router — Top-level tRPC router for Problem Solving Methods
 *
 * Mounted as `psm` in appRouter.
 * All data flows through PSMDB via getPsmDb().
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import * as repo from "./psm.repository";
import * as service from "./psm.service";
import * as selector from "./psm.selector";
import {
  byIdSchema, byCaseIdSchema, byRunIdSchema,
  listMethodsSchema, searchMethodsSchema,
  recommendSchema, compareMethodsSchema,
  createCaseSchema, updateCaseSchema, listCasesSchema, attachMethodSchema, saveCaseInputsSchema,
  startRunSchema, saveStepSchema, completeRunSchema,
  addNoteSchema, addDecisionSchema,
  createContentPackSchema, publishPackSchema, rollbackPackSchema,
  analyticsRangeSchema, listAuditSchema,
} from "./psm.validation";

// ── Catalog ─────────────────────────────────────────────────────────────────

const catalogRouter = router({
  list: protectedProcedure
    .input(listMethodsSchema)
    .query(({ input }) => repo.listMethods(input || {})),

  getCategories: protectedProcedure
    .query(() => repo.listCategories()),

  getMethods: protectedProcedure
    .input(listMethodsSchema)
    .query(({ input }) => repo.listMethods(input || {})),

  getMethodById: protectedProcedure
    .input(byIdSchema)
    .query(async ({ input }) => {
      const method = await repo.getMethodById(input.id);
      if (!method) return null;
      const definition = await repo.getMethodDefinition(input.id);
      const workflow = await repo.getMethodWorkflow(input.id);
      const aliases = await repo.getMethodAliases(input.id);
      const tags = await repo.getMethodTags(input.id);
      const relations = await repo.getMethodRelations(input.id);
      return {
        ...method,
        definition,
        workflow,
        aliases: aliases.map((a: any) => a.alias),
        tags: tags.map((t: any) => t.tag),
        relations,
      };
    }),

  search: protectedProcedure
    .input(searchMethodsSchema)
    .query(({ input }) => repo.searchMethods(input.query, input.categoryId, input.limit)),
});

// ── Selector ────────────────────────────────────────────────────────────────

const selectorRouter = router({
  recommend: protectedProcedure
    .input(recommendSchema)
    .mutation(async ({ input, ctx }) => {
      return service.getRecommendations(
        input.dimensions,
        input.caseId,
        input.problemDescription,
        input.limit,
        (ctx as any).user?.id,
      );
    }),

  explain: protectedProcedure
    .input(byCaseIdSchema)
    .query(async ({ input }) => {
      return repo.getCaseRecommendations(input.caseId);
    }),

  compare: protectedProcedure
    .input(compareMethodsSchema)
    .query(({ input }) => selector.compareMethodsDetail(input.methodIds)),
});

// ── Workflow ─────────────────────────────────────────────────────────────────

const workflowRouter = router({
  startRun: protectedProcedure
    .input(startRunSchema)
    .mutation(async ({ input, ctx }) => {
      return service.startWorkflowRun(input.caseId, input.methodId, (ctx as any).user?.id);
    }),

  getRun: protectedProcedure
    .input(byIdSchema)
    .query(async ({ input }) => {
      const run = await repo.getRun(input.id);
      if (!run) return null;
      const steps = await repo.getStepRuns(input.id);
      const method = await repo.getMethodById(run.methodId);
      const workflow = run.workflowId ? await repo.getMethodWorkflow(run.methodId) : null;
      return { ...run, steps, method, workflow };
    }),

  saveStep: protectedProcedure
    .input(saveStepSchema)
    .mutation(async ({ input, ctx }) => {
      return service.saveWorkflowStep(input.runId, input.stepNumber, {
        notes: input.notes,
        output: input.output,
        status: input.status,
      }, (ctx as any).user?.id);
    }),

  completeRun: protectedProcedure
    .input(completeRunSchema)
    .mutation(async ({ input, ctx }) => {
      return service.completeWorkflowRun(input.runId, input.summary, (ctx as any).user?.id);
    }),

  resumeRun: protectedProcedure
    .input(byIdSchema)
    .mutation(async ({ input }) => {
      return repo.updateRun(input.id, { status: "active" });
    }),
});

// ── Cases ───────────────────────────────────────────────────────────────────

const casesRouter = router({
  create: protectedProcedure
    .input(createCaseSchema)
    .mutation(async ({ input, ctx }) => {
      const caseRow = await repo.createCase({
        ...input,
        ownerUserId: (ctx as any).user?.id,
      });
      await repo.createAuditEvent({
        eventType: "case_created",
        entityType: "case",
        entityId: caseRow.id,
        actorUserId: (ctx as any).user?.id,
      });
      return caseRow;
    }),

  update: protectedProcedure
    .input(updateCaseSchema)
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const updated = await repo.updateCase(id, data);
      await repo.createAuditEvent({
        eventType: "case_updated",
        entityType: "case",
        entityId: id,
        actorUserId: (ctx as any).user?.id,
      });
      return updated;
    }),

  list: protectedProcedure
    .input(listCasesSchema)
    .query(({ input }) => repo.listCases(input || {})),

  getById: protectedProcedure
    .input(byIdSchema)
    .query(async ({ input }) => {
      const caseRow = await repo.getCaseById(input.id);
      if (!caseRow) return null;
      const inputs = await repo.getCaseInputs(input.id);
      const recommendations = await repo.getCaseRecommendations(input.id);
      const selectedMethods = await repo.getCaseSelectedMethods(input.id);
      const runs = await repo.listRunsByCaseId(input.id);
      const notes = await repo.listNotes(input.id);
      const decisions = await repo.listDecisions(input.id);
      return { ...caseRow, inputs, recommendations, selectedMethods, runs, notes, decisions };
    }),

  attachMethod: protectedProcedure
    .input(attachMethodSchema)
    .mutation(({ input }) => repo.attachMethod(input.caseId, input.methodId, input.reason)),

  saveInputs: protectedProcedure
    .input(saveCaseInputsSchema)
    .mutation(({ input }) => repo.saveCaseInputs(input.caseId, input.inputs)),

  listRuns: protectedProcedure
    .input(byCaseIdSchema)
    .query(({ input }) => repo.listRunsByCaseId(input.caseId)),

  listNotes: protectedProcedure
    .input(byCaseIdSchema)
    .query(({ input }) => repo.listNotes(input.caseId)),

  addNote: protectedProcedure
    .input(addNoteSchema)
    .mutation(async ({ input, ctx }) => {
      return repo.addNote({ ...input, authorUserId: (ctx as any).user?.id });
    }),

  listDecisions: protectedProcedure
    .input(byCaseIdSchema)
    .query(({ input }) => repo.listDecisions(input.caseId)),

  addDecision: protectedProcedure
    .input(addDecisionSchema)
    .mutation(({ input }) => repo.addDecision(input)),

  export: protectedProcedure
    .input(byIdSchema)
    .query(async ({ input }) => {
      const caseRow = await repo.getCaseById(input.id);
      if (!caseRow) return null;
      const inputs = await repo.getCaseInputs(input.id);
      const recommendations = await repo.getCaseRecommendations(input.id);
      const selectedMethods = await repo.getCaseSelectedMethods(input.id);
      const runs = await repo.listRunsByCaseId(input.id);
      const notes = await repo.listNotes(input.id);
      const decisions = await repo.listDecisions(input.id);
      return { case: caseRow, inputs, recommendations, selectedMethods, runs, notes, decisions, exportedAt: new Date() };
    }),
});

// ── Admin ───────────────────────────────────────────────────────────────────

const adminRouter = router({
  import: router({
    preview: protectedProcedure
      .input(createContentPackSchema)
      .mutation(async ({ input, ctx }) => {
        const pack = await repo.createContentPack({ ...input, createdBy: (ctx as any).user?.id });
        return { packId: pack.id, status: "preview" };
      }),

    commit: protectedProcedure
      .input(z.object({ packId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const updated = await repo.updateContentPack(input.packId, { status: "committed" });
        await repo.createAuditEvent({
          eventType: "content_imported",
          entityType: "content_pack",
          entityId: input.packId,
          actorUserId: (ctx as any).user?.id,
        });
        return updated;
      }),
  }),

  content: router({
    publish: protectedProcedure
      .input(publishPackSchema)
      .mutation(async ({ input, ctx }) => {
        return service.publishContentPack(input.packId, (ctx as any).user?.id, input.reason);
      }),

    rollback: protectedProcedure
      .input(rollbackPackSchema)
      .mutation(async ({ input, ctx }) => {
        return service.rollbackContentPack(input.packId, (ctx as any).user?.id, input.reason);
      }),
  }),

  contentPacks: protectedProcedure
    .query(() => repo.listContentPacks()),

  quality: router({
    report: protectedProcedure.query(async () => {
      const summary = await repo.getAnalyticsSummary();
      const packs = await repo.listContentPacks();
      return { ...summary, contentPackCount: packs.length };
    }),
  }),
});

// ── Analytics ───────────────────────────────────────────────────────────────

const analyticsRouter = router({
  summary: protectedProcedure
    .input(analyticsRangeSchema)
    .query(() => repo.getAnalyticsSummary()),

  methodUsage: protectedProcedure
    .query(() => repo.getMethodUsageCounts()),

  selectorAccuracy: protectedProcedure
    .query(async () => {
      // Calculate how often the top-1 recommendation was selected
      const db = (await import("./connection")).getPsmDb();
      if (!db) return { accuracy: 0, total: 0 };
      try {
        const { sql: sqlTag } = await import("drizzle-orm");
        const result = await db.execute(
          sqlTag`SELECT count(*)::int as total,
                 count(CASE WHEN r.rank = 1 THEN 1 END)::int as top1_selected
                 FROM psm_case_selected_methods s
                 JOIN psm_case_recommendations r ON r.case_id = s.case_id AND r.method_id = s.method_id`,
        );
        const rows = (result as any).rows ?? [];
        const { total = 0, top1_selected = 0 } = rows[0] || {};
        return { accuracy: total > 0 ? Math.round((top1_selected / total) * 100) : 0, total };
      } catch {
        return { accuracy: 0, total: 0 };
      }
    }),

  workflowCompletion: protectedProcedure
    .query(async () => {
      const db = (await import("./connection")).getPsmDb();
      if (!db) return { completionRate: 0, total: 0, completed: 0, abandoned: 0 };
      try {
        const { sql: sqlTag } = await import("drizzle-orm");
        const result = await db.execute(
          sqlTag`SELECT count(*)::int as total,
                 count(CASE WHEN status = 'completed' THEN 1 END)::int as completed,
                 count(CASE WHEN status = 'abandoned' THEN 1 END)::int as abandoned
                 FROM psm_case_runs`,
        );
        const rows = (result as any).rows ?? [];
        const { total = 0, completed = 0, abandoned = 0 } = rows[0] || {};
        return {
          completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
          total, completed, abandoned,
        };
      } catch {
        return { completionRate: 0, total: 0, completed: 0, abandoned: 0 };
      }
    }),
});

// ── Audit / Operations ──────────────────────────────────────────────────────

const auditRouter = router({
  list: protectedProcedure
    .input(listAuditSchema)
    .query(({ input }) => repo.listAuditEvents(input || {})),
});

const jobsRouter = router({
  list: protectedProcedure
    .query(async () => {
      const db = (await import("./connection")).getPsmDb();
      if (!db) return [];
      try {
        const { desc: descOrder } = await import("drizzle-orm");
        const { psmImportRuns } = await import("../../drizzle/tables/psmdb");
        return db.select().from(psmImportRuns).orderBy(descOrder(psmImportRuns.createdAt)).limit(20);
      } catch {
        return [];
      }
    }),
});

// ── Problem Types ───────────────────────────────────────────────────────────

const problemTypesRouter = router({
  list: protectedProcedure.query(() => repo.listProblemTypes()),
});

// ── Main PSM Router ─────────────────────────────────────────────────────────

export const psmRouter = router({
  catalog: catalogRouter,
  selector: selectorRouter,
  workflow: workflowRouter,
  cases: casesRouter,
  admin: adminRouter,
  analytics: analyticsRouter,
  audit: auditRouter,
  jobs: jobsRouter,
  problemTypes: problemTypesRouter,

  // AI Catalog Imports
  catalogImports: router({
    list: protectedProcedure.query(() => repo.listCatalogImports()),
    import: protectedProcedure
      .input(
        z.object({
          catalogEntryId: z.number(),
          entryType: z.string(),
          name: z.string(),
          description: z.string().optional(),
          category: z.string().optional(),
          tags: z.array(z.string()).optional(),
          config: z.any().optional(),
        })
      )
      .mutation(({ input }) => repo.importCatalogEntry(input)),
    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => repo.removeCatalogImport(input.id)),
  }),

  // Health check
  health: protectedProcedure.query(() => repo.healthCheck()),
});
