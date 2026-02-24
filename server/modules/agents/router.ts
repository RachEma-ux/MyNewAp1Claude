/**
 * Agent Orchestration Engine — tRPC Router
 * Workspace agents, runs, events, artifacts
 * All mutations are governance-gated.
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { workspaceAgents, agentRuns, agentRunEvents, agentRunArtifacts } from "./schema";

const agentsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "agents");
      const db = getDb();
      if (!db) return [];
      return db.select().from(workspaceAgents)
        .where(eq(workspaceAgents.workspaceId, input.workspaceId))
        .orderBy(desc(workspaceAgents.updatedAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "agents");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(workspaceAgents)
        .where(and(eq(workspaceAgents.id, input.id), eq(workspaceAgents.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      type: z.enum(["assistant", "autonomous", "reviewer", "orchestrator"]).optional(),
      config: z.record(z.unknown()).optional(),
      tools: z.array(z.string()).optional(),
      scopePolicy: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "agents");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(workspaceAgents).values({
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        type: input.type,
        config: input.config,
        tools: input.tools,
        scopePolicy: input.scopePolicy,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "agents", actorId: ctx.user.id, action: "agent.create", targetType: "agent", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      config: z.record(z.unknown()).optional(),
      tools: z.array(z.string()).optional(),
      scopePolicy: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "agents");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, ...updates } = input;
      await db.update(workspaceAgents).set({ ...updates, updatedAt: new Date() })
        .where(and(eq(workspaceAgents.id, id), eq(workspaceAgents.workspaceId, workspaceId)));
      await logActivity({ workspaceId, moduleKey: "agents", actorId: ctx.user.id, action: "agent.update", targetType: "agent", targetId: id });
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "agents");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(workspaceAgents)
        .where(and(eq(workspaceAgents.id, input.id), eq(workspaceAgents.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "agents", actorId: ctx.user.id, action: "agent.delete", targetType: "agent", targetId: input.id });
      return { success: true };
    }),
});

const runsRouter = router({
  list: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      agentId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "agents");
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(agentRuns.workspaceId, input.workspaceId)];
      if (input.agentId) conditions.push(eq(agentRuns.agentId, input.agentId));
      if (input.status) conditions.push(eq(agentRuns.status, input.status));
      return db.select().from(agentRuns).where(and(...conditions)).orderBy(desc(agentRuns.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "agents");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(agentRuns)
        .where(and(eq(agentRuns.id, input.id), eq(agentRuns.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      return rows[0];
    }),

  request: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      agentId: z.number(),
      input: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "agents");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [run] = await db.insert(agentRuns).values({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        status: "pending",
        requestedBy: ctx.user.id,
        input: input.input,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "agents", actorId: ctx.user.id, action: "agent.run.request", targetType: "agent_run", targetId: run.id });
      return run;
    }),

  execute: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "agents");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(agentRuns).set({ status: "running", startedAt: new Date() })
        .where(and(eq(agentRuns.id, input.id), eq(agentRuns.workspaceId, input.workspaceId)));
      await db.insert(agentRunEvents).values({ runId: input.id, eventType: "started", data: {} });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "agents", actorId: ctx.user.id, action: "agent.run.execute", targetType: "agent_run", targetId: input.id });
      return { success: true };
    }),

  complete: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      status: z.enum(["completed", "failed"]),
      output: z.record(z.unknown()).optional(),
      errorMessage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "agents");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(agentRuns).set({
        status: input.status,
        output: input.output,
        errorMessage: input.errorMessage,
        completedAt: new Date(),
      }).where(and(eq(agentRuns.id, input.id), eq(agentRuns.workspaceId, input.workspaceId)));
      await db.insert(agentRunEvents).values({ runId: input.id, eventType: input.status, data: { output: input.output, error: input.errorMessage } });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "agents", actorId: ctx.user.id, action: `agent.run.${input.status}`, targetType: "agent_run", targetId: input.id });
      return { success: true };
    }),

  events: protectedProcedure
    .input(z.object({ runId: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "agents");
      const db = getDb();
      if (!db) return [];
      return db.select().from(agentRunEvents).where(eq(agentRunEvents.runId, input.runId)).orderBy(agentRunEvents.createdAt);
    }),

  artifacts: protectedProcedure
    .input(z.object({ runId: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "agents");
      const db = getDb();
      if (!db) return [];
      return db.select().from(agentRunArtifacts).where(eq(agentRunArtifacts.runId, input.runId));
    }),
});

export const agentOrchRouter = router({
  agents: agentsRouter,
  runs: runsRouter,
});
