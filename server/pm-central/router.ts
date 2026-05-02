/**
 * PM Central — tRPC Router
 *
 * Mounted at `appRouter.pmCentral` via the manifest. All mutations
 * are governed; all reads protected. Persistence goes through the
 * PM Central service (PMDB only).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  governedProcedure,
} from "../_core/trpc";
import * as svc from "./pm.service";
import {
  PmProjectStatusSchema,
  PmPrioritySchema,
  PmTaskStatusSchema,
  PmMilestoneStatusSchema,
  PmRiskSeveritySchema,
  PmRiskProbabilitySchema,
  ReceivePsHandoffInputSchema,
} from "./contracts";
import { pmHealth } from "./pm.health";

function wrap<T>(p: Promise<T>): Promise<T> {
  return p.catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not connected/i.test(msg)) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "PMDB unavailable",
      });
    }
    if (/not found/i.test(msg)) {
      throw new TRPCError({ code: "NOT_FOUND", message: msg });
    }
    if (/invalid .* transition/i.test(msg) || /not in '/i.test(msg) || /already /i.test(msg)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: msg });
    }
    throw err;
  });
}

// ── Sub-router: dashboard ───────────────────────────────────────────────────

const dashboardRouter = router({
  health: protectedProcedure.query(() => pmHealth()),
  summary: protectedProcedure
    .input(z.object({ workspaceId: z.number().int().positive() }))
    .query(({ input }) => wrap(svc.getSummary(input.workspaceId))),
});

// ── Sub-router: projects ────────────────────────────────────────────────────

const projectsRouter = router({
  create: governedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        name: z.string().min(1).max(500),
        description: z.string().optional(),
        priority: PmPrioritySchema.optional(),
        ownerUserId: z.number().int().positive().optional(),
      }),
    )
    .mutation(({ input, ctx }) => wrap(svc.createProject(input, ctx.user.id))),

  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        status: z.string().optional(),
        sourceModule: z.string().max(50).optional(),
        sourceRefId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(({ input }) => wrap(svc.listProjects(input))),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => wrap(svc.getProject(input.id))),

  update: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(500).optional(),
        description: z.string().optional(),
        priority: PmPrioritySchema.optional(),
        ownerUserId: z.number().int().positive().optional(),
      }),
    )
    .mutation(({ input, ctx }) => {
      const { id, ...patch } = input;
      return wrap(svc.updateProject(id, patch, ctx.user.id));
    }),

  updateStatus: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: PmProjectStatusSchema,
      }),
    )
    .mutation(({ input, ctx }) =>
      wrap(svc.updateProjectStatus(input.id, input.status, ctx.user.id)),
    ),

  archive: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      wrap(svc.archiveProject(input.id, ctx.user.id)),
    ),
});

// ── Sub-router: plans ───────────────────────────────────────────────────────

const plansRouter = router({
  create: governedProcedure
    .input(
      z.object({
        pmProjectId: z.number().int().positive(),
        title: z.string().min(1).max(500),
        description: z.string().optional(),
      }),
    )
    .mutation(({ input, ctx }) => wrap(svc.createPlan(input, ctx.user.id))),

  listByProject: protectedProcedure
    .input(z.object({ pmProjectId: z.number().int().positive() }))
    .query(({ input }) => wrap(svc.listPlansByProject(input.pmProjectId))),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => wrap(svc.getPlan(input.id))),

  approve: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) => wrap(svc.approvePlan(input.id, ctx.user.id))),

  activate: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      wrap(svc.activatePlan(input.id, ctx.user.id)),
    ),

  supersede: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      wrap(svc.supersedePlan(input.id, ctx.user.id)),
    ),
});

// ── Sub-router: milestones ──────────────────────────────────────────────────

const milestonesRouter = router({
  create: governedProcedure
    .input(
      z.object({
        pmProjectId: z.number().int().positive(),
        title: z.string().min(1).max(500),
        description: z.string().optional(),
        dueDate: z.coerce.date().optional(),
        sortOrder: z.number().int().nonnegative().optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      wrap(svc.createMilestone(input, ctx.user.id)),
    ),

  listByProject: protectedProcedure
    .input(z.object({ pmProjectId: z.number().int().positive() }))
    .query(({ input }) => wrap(svc.listMilestonesByProject(input.pmProjectId))),

  update: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(1).max(500).optional(),
        description: z.string().optional(),
        dueDate: z.coerce.date().optional(),
        sortOrder: z.number().int().nonnegative().optional(),
      }),
    )
    .mutation(({ input, ctx }) => {
      const { id, ...patch } = input;
      return wrap(svc.updateMilestone(id, patch, ctx.user.id));
    }),

  updateStatus: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: PmMilestoneStatusSchema,
      }),
    )
    .mutation(({ input, ctx }) =>
      wrap(svc.updateMilestoneStatus(input.id, input.status, ctx.user.id)),
    ),

  delete: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      wrap(svc.deleteMilestone(input.id, ctx.user.id)).then(() => ({ ok: true })),
    ),
});

// ── Sub-router: tasks ───────────────────────────────────────────────────────

const tasksRouter = router({
  create: governedProcedure
    .input(
      z.object({
        pmProjectId: z.number().int().positive(),
        milestoneId: z.number().int().positive().optional(),
        title: z.string().min(1).max(500),
        description: z.string().optional(),
        assigneeUserId: z.number().int().positive().optional(),
        priority: PmPrioritySchema.optional(),
        dueDate: z.coerce.date().optional(),
      }),
    )
    .mutation(({ input, ctx }) => wrap(svc.createTask(input, ctx.user.id))),

  listByProject: protectedProcedure
    .input(z.object({ pmProjectId: z.number().int().positive() }))
    .query(({ input }) => wrap(svc.listTasksByProject(input.pmProjectId))),

  update: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(1).max(500).optional(),
        description: z.string().optional(),
        priority: PmPrioritySchema.optional(),
        dueDate: z.coerce.date().optional(),
        milestoneId: z.number().int().positive().optional(),
      }),
    )
    .mutation(({ input, ctx }) => {
      const { id, ...patch } = input;
      return wrap(svc.updateTask(id, patch, ctx.user.id));
    }),

  updateStatus: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: PmTaskStatusSchema,
      }),
    )
    .mutation(({ input, ctx }) =>
      wrap(svc.updateTaskStatus(input.id, input.status, ctx.user.id)),
    ),

  assign: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        assigneeUserId: z.number().int().positive(),
      }),
    )
    .mutation(({ input, ctx }) =>
      wrap(svc.assignTask(input.id, input.assigneeUserId, ctx.user.id)),
    ),

  delete: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      wrap(svc.deleteTask(input.id, ctx.user.id)).then(() => ({ ok: true })),
    ),
});

// ── Sub-router: risks ───────────────────────────────────────────────────────

const risksRouter = router({
  create: governedProcedure
    .input(
      z.object({
        pmProjectId: z.number().int().positive(),
        title: z.string().min(1).max(500),
        description: z.string().optional(),
        severity: PmRiskSeveritySchema.optional(),
        probability: PmRiskProbabilitySchema.optional(),
        mitigation: z.string().optional(),
      }),
    )
    .mutation(({ input, ctx }) => wrap(svc.createRisk(input, ctx.user.id))),

  listByProject: protectedProcedure
    .input(z.object({ pmProjectId: z.number().int().positive() }))
    .query(({ input }) => wrap(svc.listRisksByProject(input.pmProjectId))),

  update: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(1).max(500).optional(),
        description: z.string().optional(),
        severity: PmRiskSeveritySchema.optional(),
        probability: PmRiskProbabilitySchema.optional(),
        mitigation: z.string().optional(),
      }),
    )
    .mutation(({ input, ctx }) => {
      const { id, ...patch } = input;
      return wrap(svc.updateRisk(id, patch, ctx.user.id));
    }),

  close: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) => wrap(svc.closeRisk(input.id, ctx.user.id))),
});

// ── Sub-router: issues ──────────────────────────────────────────────────────

const issuesRouter = router({
  create: governedProcedure
    .input(
      z.object({
        pmProjectId: z.number().int().positive(),
        title: z.string().min(1).max(500),
        description: z.string().optional(),
        severity: PmRiskSeveritySchema.optional(),
        ownerUserId: z.number().int().positive().optional(),
      }),
    )
    .mutation(({ input, ctx }) => wrap(svc.createIssue(input, ctx.user.id))),

  listByProject: protectedProcedure
    .input(z.object({ pmProjectId: z.number().int().positive() }))
    .query(({ input }) => wrap(svc.listIssuesByProject(input.pmProjectId))),

  update: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(1).max(500).optional(),
        description: z.string().optional(),
        severity: PmRiskSeveritySchema.optional(),
        ownerUserId: z.number().int().positive().optional(),
      }),
    )
    .mutation(({ input, ctx }) => {
      const { id, ...patch } = input;
      return wrap(svc.updateIssue(id, patch, ctx.user.id));
    }),

  close: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) => wrap(svc.closeIssue(input.id, ctx.user.id))),
});

// ── Sub-router: decisions ───────────────────────────────────────────────────

const decisionsRouter = router({
  record: governedProcedure
    .input(
      z.object({
        pmProjectId: z.number().int().positive(),
        title: z.string().min(1).max(500),
        decision: z.string().min(1),
        rationale: z.string().optional(),
      }),
    )
    .mutation(({ input, ctx }) => wrap(svc.recordDecision(input, ctx.user.id))),

  listByProject: protectedProcedure
    .input(z.object({ pmProjectId: z.number().int().positive() }))
    .query(({ input }) => wrap(svc.listDecisionsByProject(input.pmProjectId))),
});

// ── Sub-router: handoffs ────────────────────────────────────────────────────

const handoffsRouter = router({
  receiveFromPS: governedProcedure
    .input(ReceivePsHandoffInputSchema)
    .mutation(({ input, ctx }) =>
      wrap(svc.receivePsHandoff(input, ctx.user.id)),
    ),

  accept: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      wrap(svc.acceptHandoff(input.id, ctx.user.id)),
    ),

  reject: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        reason: z.string().min(1).max(1000),
      }),
    )
    .mutation(({ input, ctx }) =>
      wrap(svc.rejectHandoff(input.id, input.reason, ctx.user.id)),
    ),

  convertToProject: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      wrap(svc.convertHandoffToProject(input.id, ctx.user.id)),
    ),
});

// ── Top-level router ────────────────────────────────────────────────────────

export const pmCentralRouter = router({
  dashboard: dashboardRouter,
  projects: projectsRouter,
  plans: plansRouter,
  milestones: milestonesRouter,
  tasks: tasksRouter,
  risks: risksRouter,
  issues: issuesRouter,
  decisions: decisionsRouter,
  handoffs: handoffsRouter,
});

export type PmCentralRouter = typeof pmCentralRouter;
