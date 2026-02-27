/**
 * PMT Engine — AI Router
 * tRPC endpoints for AI-powered project management assistance
 */
import { z } from "zod";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { suggestTasks, triageWorkItem, generateStatusReport, suggestWorkloadBalance } from "./ai-services";

export const aiRouter = router({
  suggestTasks: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      projectId: z.number(),
      description: z.string().min(10),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const suggestions = await suggestTasks(input.description);
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "ai.suggestTasks", targetType: "project", targetId: input.projectId });
      return suggestions;
    }),

  triageWorkItem: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      title: z.string(),
      description: z.string().optional(),
    }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      return triageWorkItem(input.title, input.description || "");
    }),

  generateStatusReport: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      sprintId: z.number(),
    }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      // Mock sprint data — replace with actual DB query when sprint schema is queried
      const sprintData = {
        name: `Sprint #${input.sprintId}`,
        totalTasks: 20,
        doneTasks: 12,
        inProgressTasks: 5,
        blockedTasks: 3,
      };
      return generateStatusReport(sprintData);
    }),

  suggestWorkloadBalance: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
    }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      // Mock assignee workload data — replace with actual DB aggregation
      const workloads = [
        { assigneeId: 1, name: "User #1", taskCount: 15, totalHours: 120 },
        { assigneeId: 2, name: "User #2", taskCount: 5, totalHours: 30 },
        { assigneeId: 3, name: "AI Agent", taskCount: 8, totalHours: 60 },
      ];
      return suggestWorkloadBalance(workloads);
    }),
});
