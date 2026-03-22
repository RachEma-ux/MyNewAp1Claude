/**
 * Reporting Engine — tRPC Router (READ-ONLY)
 * Aggregates data from PMT, Agents, Collaboration, Knowledge.
 * No mutations allowed.
 */

import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule } from "../registry";
import { requireWorkspaceAccess } from "../../workspace/workspace-guards";
import { projects, tasks } from "../pmt/schema";
import { agentRuns } from "../agents/schema";
import { threads } from "../collaboration/schema";
import { knowledgeDocuments } from "../knowledge/schema";
import { workspaceActivityLog } from "../../../drizzle/tables/workspace-modules";

export const reportingRouter = router({
  velocity: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "reporting");
      const db = getDb();
      if (!db) return { total: 0, byStatus: {} };
      const allTasks = await db.select({
        status: tasks.status,
        count: sql<number>`count(*)::int`,
      })
        .from(tasks)
        .where(eq(tasks.workspaceId, input.workspaceId))
        .groupBy(tasks.status);
      const total = allTasks.reduce((sum, r) => sum + r.count, 0);
      const byStatus: Record<string, number> = {};
      for (const r of allTasks) byStatus[r.status] = r.count;
      return { total, byStatus };
    }),

  agentReliability: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "reporting");
      const db = getDb();
      if (!db) return { total: 0, completed: 0, failed: 0, successRate: 0 };
      const runs = await db.select({
        status: agentRuns.status,
        count: sql<number>`count(*)::int`,
      })
        .from(agentRuns)
        .where(eq(agentRuns.workspaceId, input.workspaceId))
        .groupBy(agentRuns.status);
      const total = runs.reduce((sum, r) => sum + r.count, 0);
      const completed = runs.find(r => r.status === "completed")?.count || 0;
      const failed = runs.find(r => r.status === "failed")?.count || 0;
      const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
      return { total, completed, failed, successRate };
    }),

  activityTimeline: protectedProcedure
    .input(z.object({ workspaceId: z.number(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "reporting");
      const db = getDb();
      if (!db) return [];
      return db.select().from(workspaceActivityLog)
        .where(eq(workspaceActivityLog.workspaceId, input.workspaceId))
        .orderBy(desc(workspaceActivityLog.createdAt))
        .limit(input.limit);
    }),

  riskHeatmap: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "reporting");
      const db = getDb();
      if (!db) return { projects: [], tasks: [] };
      const projectRisks = await db.select({
        riskLevel: projects.riskLevel,
        count: sql<number>`count(*)::int`,
      })
        .from(projects)
        .where(eq(projects.workspaceId, input.workspaceId))
        .groupBy(projects.riskLevel);
      const taskRisks = await db.select({
        riskLevel: tasks.riskLevel,
        count: sql<number>`count(*)::int`,
      })
        .from(tasks)
        .where(eq(tasks.workspaceId, input.workspaceId))
        .groupBy(tasks.riskLevel);
      return { projects: projectRisks, tasks: taskRisks };
    }),

  summary: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "reporting");
      const db = getDb();
      if (!db) return { projects: 0, tasks: 0, agents: 0, threads: 0, documents: 0 };
      const wsId = input.workspaceId;
      const [pCount] = await db.select({ count: sql<number>`count(*)::int` }).from(projects).where(eq(projects.workspaceId, wsId));
      const [tCount] = await db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(eq(tasks.workspaceId, wsId));
      const [aCount] = await db.select({ count: sql<number>`count(*)::int` }).from(agentRuns).where(eq(agentRuns.workspaceId, wsId));
      const [thCount] = await db.select({ count: sql<number>`count(*)::int` }).from(threads).where(eq(threads.workspaceId, wsId));
      const [dCount] = await db.select({ count: sql<number>`count(*)::int` }).from(knowledgeDocuments).where(eq(knowledgeDocuments.workspaceId, wsId));
      return {
        projects: pCount?.count || 0,
        tasks: tCount?.count || 0,
        agents: aCount?.count || 0,
        threads: thCount?.count || 0,
        documents: dCount?.count || 0,
      };
    }),
});
