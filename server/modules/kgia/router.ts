/**
 * KGIA — Knowledge Graph Interpretation Agent — tRPC Router
 *
 * Workspace-scoped, module-gated endpoints for:
 * - Sources: CRUD for graph backends
 * - Sessions: Create/list interpretation sessions
 * - Runs: Execute questions against graph sources
 * - History: Query run history and evidence
 * - Benchmarks: Manage and execute benchmark cases
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { requireWorkspaceAccess } from "../../workspace/workspace-guards";
import {
  kgiaSources,
  kgiaSessions,
  kgiaRuns,
  kgiaQueryPlans,
  kgiaQueryExecutions,
  kgiaAnswers,
  kgiaEvidenceNodes,
  kgiaEvidenceEdges,
  kgiaMemoryNodes,
  kgiaMemoryEdges,
  kgiaPolicyDecisions,
  kgiaBenchmarkCases,
  kgiaBenchmarkRuns,
} from "./schema";
import { runBenchmark } from "./services/benchmark-runner";
import { createSession, executeRun } from "./runtime/orchestrator";
import { gateSourceRegistration } from "./governance/safety";
import { testNeo4jConnection } from "./infrastructure/neo4j-adapter";
import { testSparqlConnection } from "./infrastructure/sparql-adapter";

// ── Sources Router ──────────────────────────────────────────────

const sourcesRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");
      const db = getDb();
      if (!db) return [];
      return db.select().from(kgiaSources)
        .where(eq(kgiaSources.workspaceId, input.workspaceId))
        .orderBy(desc(kgiaSources.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.select().from(kgiaSources)
        .where(and(eq(kgiaSources.id, input.id), eq(kgiaSources.workspaceId, input.workspaceId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });
      return row;
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      name: z.string().min(1).max(255),
      type: z.enum(["neo4j", "sparql", "neptune_cypher", "neptune_sparql"]),
      endpoint: z.string().min(1),
      credentials: z.record(z.string(), z.unknown()).optional(),
      maxHops: z.number().min(1).max(10).default(4),
      maxRows: z.number().min(1).max(10000).default(1000),
      readOnly: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Governance gate: SSRF prevention
      const regCheck = await gateSourceRegistration({
        workspaceId: input.workspaceId,
        sourceName: input.name,
        sourceType: input.type,
        endpoint: input.endpoint,
        actorId: ctx.user.id,
      });
      if (!regCheck.allowed) {
        throw new TRPCError({ code: "FORBIDDEN", message: regCheck.reason });
      }

      const [source] = await db.insert(kgiaSources).values({
        workspaceId: input.workspaceId,
        name: input.name,
        type: input.type,
        endpoint: input.endpoint,
        credentials: input.credentials ?? null,
        maxHops: input.maxHops,
        maxRows: input.maxRows,
        readOnly: input.readOnly,
      }).returning();

      await logActivity({ workspaceId: input.workspaceId, moduleKey: "kgia", actorId: ctx.user.id, action: "source.create", targetType: "kgia_source", targetId: source.id });
      return source;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      name: z.string().min(1).max(255).optional(),
      endpoint: z.string().min(1).optional(),
      credentials: z.record(z.string(), z.unknown()).optional(),
      allowlisted: z.boolean().optional(),
      maxHops: z.number().min(1).max(10).optional(),
      maxRows: z.number().min(1).max(10000).optional(),
      readOnly: z.boolean().optional(),
      status: z.enum(["active", "disabled"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { id, workspaceId, ...updates } = input;
      const [row] = await db.update(kgiaSources)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(kgiaSources.id, id), eq(kgiaSources.workspaceId, workspaceId)))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });

      await logActivity({ workspaceId, moduleKey: "kgia", actorId: ctx.user.id, action: "source.update", targetType: "kgia_source", targetId: id });
      return row;
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.update(kgiaSources)
        .set({ status: "disabled", updatedAt: new Date() })
        .where(and(eq(kgiaSources.id, input.id), eq(kgiaSources.workspaceId, input.workspaceId)));

      await logActivity({ workspaceId: input.workspaceId, moduleKey: "kgia", actorId: ctx.user.id, action: "source.delete", targetType: "kgia_source", targetId: input.id });
      return { success: true };
    }),

  testConnection: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [source] = await db.select().from(kgiaSources)
        .where(and(eq(kgiaSources.id, input.id), eq(kgiaSources.workspaceId, input.workspaceId)))
        .limit(1);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });

      const graphSource = {
        id: source.id,
        name: source.name,
        type: source.type as any,
        endpoint: source.endpoint,
        allowlisted: source.allowlisted,
        maxHops: source.maxHops,
        maxRows: source.maxRows,
        readOnly: source.readOnly,
      };

      if (source.type === "sparql" || source.type === "neptune_sparql") {
        return testSparqlConnection(graphSource);
      }
      return testNeo4jConnection(graphSource);
    }),
});

// ── Sessions Router ─────────────────────────────────────────────

const sessionsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");
      const db = getDb();
      if (!db) return [];
      return db.select().from(kgiaSessions)
        .where(eq(kgiaSessions.workspaceId, input.workspaceId))
        .orderBy(desc(kgiaSessions.createdAt));
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      title: z.string().max(500).optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");

      const sessionId = await createSession({
        workspaceId: input.workspaceId,
        userId: ctx.user.id,
        title: input.title,
        config: input.config,
      });

      if (!sessionId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create session" });

      await logActivity({ workspaceId: input.workspaceId, moduleKey: "kgia", actorId: ctx.user.id, action: "session.create", targetType: "kgia_session", targetId: sessionId });
      return { id: sessionId };
    }),
});

// ── Runs Router ─────────────────────────────────────────────────

const runsRouter = router({
  list: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      sessionId: z.number().optional(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");
      const db = getDb();
      if (!db) return [];

      const conditions = [eq(kgiaRuns.workspaceId, input.workspaceId)];
      if (input.sessionId) conditions.push(eq(kgiaRuns.sessionId, input.sessionId));

      return db.select().from(kgiaRuns)
        .where(and(...conditions))
        .orderBy(desc(kgiaRuns.createdAt))
        .limit(input.limit);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [run] = await db.select().from(kgiaRuns)
        .where(and(eq(kgiaRuns.id, input.id), eq(kgiaRuns.workspaceId, input.workspaceId)))
        .limit(1);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });

      // Also fetch related data
      const plans = await db.select().from(kgiaQueryPlans).where(eq(kgiaQueryPlans.runId, run.id));
      const executions = await db.select().from(kgiaQueryExecutions).where(eq(kgiaQueryExecutions.runId, run.id));
      const [answer] = await db.select().from(kgiaAnswers).where(eq(kgiaAnswers.runId, run.id)).limit(1);
      const evidenceNodes = await db.select().from(kgiaEvidenceNodes).where(eq(kgiaEvidenceNodes.runId, run.id));
      const evidenceEdges = await db.select().from(kgiaEvidenceEdges).where(eq(kgiaEvidenceEdges.runId, run.id));

      return { run, plans, executions, answer, evidenceNodes, evidenceEdges };
    }),

  getEvidence: protectedProcedure
    .input(z.object({ runId: z.number(), workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");
      const db = getDb();
      if (!db) return { nodes: [], edges: [] };

      const nodes = await db.select().from(kgiaEvidenceNodes)
        .where(and(eq(kgiaEvidenceNodes.runId, input.runId), eq(kgiaEvidenceNodes.workspaceId, input.workspaceId)));
      const edges = await db.select().from(kgiaEvidenceEdges)
        .where(and(eq(kgiaEvidenceEdges.runId, input.runId), eq(kgiaEvidenceEdges.workspaceId, input.workspaceId)));

      return { nodes, edges };
    }),

  getMemory: protectedProcedure
    .input(z.object({ sessionId: z.number(), workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");
      const db = getDb();
      if (!db) return { nodes: [], edges: [] };

      const nodes = await db.select().from(kgiaMemoryNodes)
        .where(and(eq(kgiaMemoryNodes.sessionId, input.sessionId), eq(kgiaMemoryNodes.workspaceId, input.workspaceId)));
      const edges = await db.select().from(kgiaMemoryEdges)
        .where(and(eq(kgiaMemoryEdges.sessionId, input.sessionId), eq(kgiaMemoryEdges.workspaceId, input.workspaceId)));

      return { nodes, edges };
    }),

  execute: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      sessionId: z.number(),
      question: z.string().min(1).max(2000),
      sourceIds: z.array(z.number()).optional(),
      mode: z.enum(["direct_query", "graph_rag", "memory", "hybrid"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");

      const result = await executeRun({
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        question: input.question,
        sourceIds: input.sourceIds,
        mode: input.mode,
        actorId: ctx.user.id,
      });

      await logActivity({ workspaceId: input.workspaceId, moduleKey: "kgia", actorId: ctx.user.id, action: "run.execute", targetType: "kgia_run", targetId: result.runId });
      return result;
    }),
});

// ── Policy Decisions Router ─────────────────────────────────────

const auditRouter = router({
  list: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");
      const db = getDb();
      if (!db) return [];
      return db.select().from(kgiaPolicyDecisions)
        .where(eq(kgiaPolicyDecisions.workspaceId, input.workspaceId))
        .orderBy(desc(kgiaPolicyDecisions.createdAt))
        .limit(input.limit);
    }),
});

// ── Benchmarks Router ───────────────────────────────────────────

const benchmarksRouter = router({
  listCases: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");
      const db = getDb();
      if (!db) return [];
      return db.select().from(kgiaBenchmarkCases)
        .where(eq(kgiaBenchmarkCases.workspaceId, input.workspaceId))
        .orderBy(desc(kgiaBenchmarkCases.createdAt));
    }),

  createCase: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      name: z.string().min(1).max(255),
      category: z.enum(["direct_lookup", "multi_hop", "mixed_retrieval", "incomplete_knowledge", "temporal", "governance_block"]),
      question: z.string().min(1),
      expectedAnswer: z.string().optional(),
      expectedMode: z.enum(["direct_query", "graph_rag", "memory", "hybrid"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db.insert(kgiaBenchmarkCases).values({
        workspaceId: input.workspaceId,
        name: input.name,
        category: input.category,
        question: input.question,
        expectedAnswer: input.expectedAnswer,
        expectedMode: input.expectedMode,
      }).returning();

      return row;
    }),

  runCase: governedProcedure
    .input(z.object({ workspaceId: z.number(), caseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");

      const result = await runBenchmark(input.caseId, input.workspaceId, ctx.user.id);
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "kgia", actorId: ctx.user.id, action: "benchmark.run", targetType: "kgia_benchmark", targetId: result.benchmarkRunId });
      return result;
    }),

  listRuns: protectedProcedure
    .input(z.object({ workspaceId: z.number(), caseId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "kgia");
      const db = getDb();
      if (!db) return [];

      const conditions = [eq(kgiaBenchmarkRuns.workspaceId, input.workspaceId)];
      if (input.caseId) conditions.push(eq(kgiaBenchmarkRuns.caseId, input.caseId));

      return db.select().from(kgiaBenchmarkRuns)
        .where(and(...conditions))
        .orderBy(desc(kgiaBenchmarkRuns.createdAt));
    }),
});

// ── Combined KGIA Router ────────────────────────────────────────

export const kgiaRouter = router({
  sources: sourcesRouter,
  sessions: sessionsRouter,
  runs: runsRouter,
  audit: auditRouter,
  benchmarks: benchmarksRouter,
});
