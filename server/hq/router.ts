import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import * as providerDb from "../providers/db";
import { getAuditLogger } from "../services/auditLogger";
import {
  getFrozenSubjects,
  isDriftDetectionActive,
  getLastDriftReport,
} from "../governance/scorecard";

export const hqRouter = router({
  overview: protectedProcedure.query(async () => {
    const providers = await providerDb.getAllProviders();
    const models = await db.getAllModels();
    return {
      providerCount: providers.length,
      modelCount: models.length,
      agentCount: 0,
      workspaceCount: 0,
    };
  }),

  teamMembers: protectedProcedure.query(async ({ ctx }) => {
    return {
      members: ctx.user
        ? [
            {
              id: ctx.user.id,
              name: ctx.user.name || "User",
              email: ctx.user.email || "",
              role: ctx.user.role || "user",
              status: "active" as const,
            },
          ]
        : [],
    };
  }),

  projectSummary: protectedProcedure.query(async () => {
    return {
      projects: [] as { id: number; name: string; status: string }[],
      totalWorkflows: 0,
      activeWorkflows: 0,
    };
  }),

  operationsStatus: protectedProcedure.query(async () => {
    const providers = await providerDb.getAllProviders();
    return {
      providerStatus: providers.map((p: any) => ({
        id: p.id,
        name: p.name,
        status: p.status || "unknown",
      })),
      inferenceAvailable: true,
      systemStatus: "operational" as const,
    };
  }),

  incidents: protectedProcedure.query(async () => {
    const frozen = getFrozenSubjects();
    const driftReport = getLastDriftReport();
    return {
      frozenSubjects: frozen,
      frozenCount: frozen.length,
      driftViolations: driftReport?.newViolations || [],
      driftActive: isDriftDetectionActive(),
      openIncidents: frozen.length + (driftReport?.newViolations?.length || 0),
    };
  }),

  changeRequests: protectedProcedure.query(async () => {
    return {
      recentChanges: [] as { id: string; description: string; status: string }[],
      pendingApprovals: 0,
      completedToday: 0,
    };
  }),

  systemHealth: protectedProcedure.query(async () => {
    return {
      database: "connected" as const,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      status: "healthy" as const,
    };
  }),

  activityFeed: protectedProcedure
    .input(
      z
        .object({ limit: z.number().min(1).max(100).optional() })
        .optional()
    )
    .query(async ({ input }) => {
      const audit = getAuditLogger();
      return {
        events: audit.getRecent(input?.limit || 20),
      };
    }),
});
