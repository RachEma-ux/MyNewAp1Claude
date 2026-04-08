/**
 * PRM Router — Top-level tRPC router for Problem Resolution Methods
 *
 * Mounted as `prm` in appRouter.
 * All data flows through PRMDB via getPrmDb().
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import * as repo from "./prm.repository";
import * as service from "./prm.service";
import * as analytics from "./prm.analytics";
import * as governance from "./prm.governance";
import * as catalog from "./prm.catalog";
import { METHOD_CATALOG } from "./prm.methods";
import {
  createCaseSchema,
  updateCaseSchema,
  setStatusSchema,
  reopenCaseSchema,
  closeCaseSchema,
  listCasesSchema,
  listEventsSchema,
  createMethodRunSchema,
  updateMethodRunSchema,
  completeMethodRunSchema,
  addDecisionSchema,
  approveDecisionSchema,
  addActionSchema,
  updateActionSchema,
  completeActionSchema,
  addEvidenceSchema,
  validateEvidenceSchema,
  addVerificationSchema,
  signOffVerificationSchema,
  addPreventionSchema,
  updatePreventionSchema,
  addLessonSchema,
  updateLessonSchema,
  createPlaybookSchema,
  updatePlaybookSchema,
  addExternalRefSchema,
  runMaturitySchema,
  byIdSchema,
  byCaseIdSchema,
} from "./prm.validation";

// ── Sub-routers ─────────────────────────────────────────────────────────────

const casesRouter = router({
  list: protectedProcedure.input(listCasesSchema).query(({ input }) => {
    return repo.listCases(input);
  }),

  getById: protectedProcedure.input(byIdSchema).query(({ input }) => {
    return repo.getCaseById(input.id);
  }),

  create: protectedProcedure.input(createCaseSchema).mutation(async ({ input, ctx }) => {
    const caseRow = await repo.createCase({
      ...input,
      reporterUserId: input.reporterUserId || (ctx as any).user?.id,
    });
    await repo.createEvent({
      caseId: caseRow.id,
      eventType: "status_change",
      toStatus: "draft",
      actorUserId: (ctx as any).user?.id,
    });
    return caseRow;
  }),

  update: protectedProcedure.input(updateCaseSchema).mutation(async ({ input }) => {
    const { id, ...data } = input;
    return repo.updateCase(id, data as any);
  }),

  setStatus: protectedProcedure.input(setStatusSchema).mutation(async ({ input, ctx }) => {
    return service.advanceStatus(input.id, input.status, (ctx as any).user?.id, input.reason);
  }),

  reopen: protectedProcedure.input(reopenCaseSchema).mutation(async ({ input, ctx }) => {
    return service.reopenCase(input.id, input.reason, (ctx as any).user?.id);
  }),

  close: protectedProcedure.input(closeCaseSchema).mutation(async ({ input, ctx }) => {
    return service.closeCase(input.id, input.closureReason, (ctx as any).user?.id);
  }),

  delete: protectedProcedure.input(byIdSchema).mutation(async ({ input }) => {
    return repo.deleteCase(input.id);
  }),
});

const eventsRouter = router({
  list: protectedProcedure.input(listEventsSchema).query(({ input }) => {
    return repo.listEvents(input.caseId, input.limit);
  }),
});

const methodsRouter = router({
  listTemplates: protectedProcedure.query(() => {
    return repo.listMethodTemplates();
  }),

  catalog: protectedProcedure.query(() => {
    return METHOD_CATALOG;
  }),

  getRun: protectedProcedure.input(byIdSchema).query(({ input }) => {
    return repo.getMethodRun(input.id);
  }),

  listRuns: protectedProcedure.input(byCaseIdSchema).query(({ input }) => {
    return repo.listMethodRunsByCaseId(input.caseId);
  }),

  createRun: protectedProcedure.input(createMethodRunSchema).mutation(async ({ input, ctx }) => {
    const run = await repo.createMethodRun({
      ...input,
      startedBy: (ctx as any).user?.id,
    });
    await repo.createEvent({
      caseId: input.caseId,
      eventType: "method_started",
      actorUserId: (ctx as any).user?.id,
      metadata: { methodType: input.methodType, runId: run.id },
    });
    return run;
  }),

  updateRun: protectedProcedure.input(updateMethodRunSchema).mutation(({ input }) => {
    const { id, ...data } = input;
    return repo.updateMethodRun(id, data);
  }),

  completeRun: protectedProcedure.input(completeMethodRunSchema).mutation(({ input }) => {
    return service.completeMethodRun(input.id, input.narrativeSummary);
  }),
});

const decisionsRouter = router({
  list: protectedProcedure.input(byCaseIdSchema).query(({ input }) => {
    return repo.listDecisions(input.caseId);
  }),

  add: protectedProcedure.input(addDecisionSchema).mutation(async ({ input, ctx }) => {
    const decision = await repo.addDecision(input);
    await repo.createEvent({
      caseId: input.caseId,
      eventType: "decision_added",
      actorUserId: (ctx as any).user?.id,
      metadata: { decisionId: decision.id, title: input.title },
    });
    return decision;
  }),

  approve: protectedProcedure.input(approveDecisionSchema).mutation(async ({ input, ctx }) => {
    return repo.updateDecision(input.id, {
      approvedBy: (ctx as any).user?.id,
      approvedAt: new Date(),
    });
  }),
});

const actionsRouter = router({
  list: protectedProcedure.input(byCaseIdSchema).query(({ input }) => {
    return repo.listActions(input.caseId);
  }),

  add: protectedProcedure.input(addActionSchema).mutation(async ({ input, ctx }) => {
    const action = await repo.addAction({
      ...input,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
    });
    await repo.createEvent({
      caseId: input.caseId,
      eventType: "action_added",
      actorUserId: (ctx as any).user?.id,
      metadata: { actionId: action.id, actionType: input.actionType },
    });
    return action;
  }),

  update: protectedProcedure.input(updateActionSchema).mutation(({ input }) => {
    const { id, ...data } = input;
    return repo.updateAction(id, data as any);
  }),

  complete: protectedProcedure.input(completeActionSchema).mutation(({ input }) => {
    return service.completeAction(input.id, input.effectivenessResult);
  }),
});

const evidenceRouter = router({
  list: protectedProcedure.input(byCaseIdSchema).query(({ input }) => {
    return repo.listEvidence(input.caseId);
  }),

  add: protectedProcedure.input(addEvidenceSchema).mutation(async ({ input, ctx }) => {
    const evidence = await repo.addEvidence(input);
    await repo.createEvent({
      caseId: input.caseId,
      eventType: "evidence_added",
      actorUserId: (ctx as any).user?.id,
      metadata: { evidenceId: evidence.id, evidenceType: input.evidenceType },
    });
    return evidence;
  }),

  validate: protectedProcedure.input(validateEvidenceSchema).mutation(async ({ input, ctx }) => {
    return repo.updateEvidence(input.id, {
      isValidated: true,
      validatedBy: (ctx as any).user?.id,
      validatedAt: new Date(),
    });
  }),
});

const verificationsRouter = router({
  list: protectedProcedure.input(byCaseIdSchema).query(({ input }) => {
    return repo.listVerifications(input.caseId);
  }),

  add: protectedProcedure.input(addVerificationSchema).mutation(async ({ input, ctx }) => {
    const verification = await repo.addVerification(input);
    await repo.createEvent({
      caseId: input.caseId,
      eventType: "verification_added",
      actorUserId: (ctx as any).user?.id,
      metadata: { verificationId: verification.id },
    });
    return verification;
  }),

  signOff: protectedProcedure.input(signOffVerificationSchema).mutation(async ({ input, ctx }) => {
    return repo.updateVerification(input.id, {
      actualResult: input.actualResult,
      passed: input.passed,
      approverUserId: (ctx as any).user?.id,
      signedOffAt: new Date(),
    });
  }),
});

const preventionRouter = router({
  list: protectedProcedure.input(byCaseIdSchema).query(({ input }) => {
    return repo.listPreventionPlans(input.caseId);
  }),

  add: protectedProcedure.input(addPreventionSchema).mutation(({ input }) => {
    return repo.addPrevention(input);
  }),

  update: protectedProcedure.input(updatePreventionSchema).mutation(({ input }) => {
    const { id, ...data } = input;
    return repo.updatePrevention(id, data as any);
  }),
});

const lessonsRouter = router({
  list: protectedProcedure
    .input(z.object({ caseId: z.number().int().positive().optional() }))
    .query(({ input }) => {
      return repo.listLessons(input.caseId);
    }),

  add: protectedProcedure.input(addLessonSchema).mutation(({ input }) => {
    return repo.addLesson(input);
  }),

  update: protectedProcedure.input(updateLessonSchema).mutation(({ input }) => {
    const { id, ...data } = input;
    return repo.updateLesson(id, data);
  }),

  publish: protectedProcedure.input(byIdSchema).mutation(({ input }) => {
    return catalog.publishLesson(input.id);
  }),
});

const playbooksRouter = router({
  list: protectedProcedure
    .input(z.object({ domain: z.string().optional() }).optional())
    .query(({ input }) => {
      return repo.listPlaybooks(input?.domain);
    }),

  getById: protectedProcedure.input(byIdSchema).query(({ input }) => {
    return repo.getPlaybook(input.id);
  }),

  create: protectedProcedure.input(createPlaybookSchema).mutation(async ({ input, ctx }) => {
    return repo.createPlaybook({
      ...input,
      createdBy: (ctx as any).user?.id,
    });
  }),

  update: protectedProcedure.input(updatePlaybookSchema).mutation(({ input }) => {
    const { id, ...data } = input;
    return repo.updatePlaybook(id, data);
  }),

  publish: protectedProcedure.input(byIdSchema).mutation(({ input }) => {
    return catalog.publishPlaybook(input.id);
  }),
});

const catalogRouter = router({
  list: protectedProcedure
    .input(z.object({ itemType: z.string().optional() }).optional())
    .query(({ input }) => {
      return repo.listCatalogItems(input?.itemType);
    }),

  publish: protectedProcedure.input(byIdSchema).mutation(({ input }) => {
    return repo.updateCatalogItem(input.id, { publicationState: "published", publishedAt: new Date() });
  }),

  archive: protectedProcedure.input(byIdSchema).mutation(({ input }) => {
    return catalog.archiveCatalogItem(input.id);
  }),
});

const maturityRouter = router({
  runAssessment: protectedProcedure.input(runMaturitySchema).mutation(async ({ input, ctx }) => {
    // Normalize dimensionScores to Record<string, number>. zod 4 leaves
    // record values as `number | undefined` (partial record); coerce
    // once and use the narrowed shape downstream.
    const dimensionScores: Record<string, number> = {};
    for (const [k, v] of Object.entries(input.dimensionScores)) {
      if (typeof v === "number") dimensionScores[k] = v;
    }
    const scores = Object.values(dimensionScores);
    const totalScore = scores.reduce((a, b) => a + b, 0);
    const avgScore = scores.length > 0 ? totalScore / scores.length : 0;
    const maturityLevel = Math.min(5, Math.max(1, Math.round(avgScore)));

    return repo.createMaturityRun({
      assessorUserId: (ctx as any).user?.id,
      dimensionScores,
      totalScore,
      maturityLevel,
      gapNotes: input.gapNotes,
      nextActions: input.nextActions,
    });
  }),

  getHistory: protectedProcedure.query(() => {
    return repo.listMaturityRuns();
  }),
});

const analyticsRouter = router({
  dashboard: protectedProcedure.query(() => {
    return analytics.getDashboardKPIs();
  }),

  queueSummary: protectedProcedure.query(() => {
    return analytics.getQueueSummary();
  }),
});

const refsRouter = router({
  list: protectedProcedure.input(byCaseIdSchema).query(({ input }) => {
    return repo.listExternalRefs(input.caseId);
  }),

  add: protectedProcedure.input(addExternalRefSchema).mutation(({ input }) => {
    return repo.addExternalRef(input);
  }),

  remove: protectedProcedure.input(byIdSchema).mutation(({ input }) => {
    return repo.removeExternalRef(input.id);
  }),
});

// ── Main PRM Router ─────────────────────────────────────────────────────────

export const prmRouter = router({
  cases: casesRouter,
  events: eventsRouter,
  methods: methodsRouter,
  decisions: decisionsRouter,
  actions: actionsRouter,
  evidence: evidenceRouter,
  verifications: verificationsRouter,
  prevention: preventionRouter,
  lessons: lessonsRouter,
  playbooks: playbooksRouter,
  catalog: catalogRouter,
  maturity: maturityRouter,
  analytics: analyticsRouter,
  refs: refsRouter,

  // AI Catalog Imports
  catalogImports: router({
    list: protectedProcedure.query(() => {
      return repo.listCatalogImports();
    }),
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
      .mutation(({ input }) => {
        return repo.importCatalogEntry(input);
      }),
    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => {
        return repo.removeCatalogImport(input.id);
      }),
  }),

  // Health check
  health: protectedProcedure.query(() => {
    return repo.healthCheck();
  }),

  // Closure gate evaluation
  closureGate: protectedProcedure.input(byCaseIdSchema).query(({ input }) => {
    return governance.evaluateClosureGate(input.caseId);
  }),
});
