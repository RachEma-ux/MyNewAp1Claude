/**
 * Agent Engine Router — tRPC API for PM Central agent orchestration
 *
 * Sub-routers:
 *   bindings  — catalog binding config (read from shared config)
 *   packs     — agent pack config
 *   runs      — create, list, get, cancel runs
 *   drafts    — list, get, commit, reject drafts
 *   readiness — gate readiness check
 *   audit     — audit trail
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmtAgentRuns, pmtAgentDrafts, pmtAgentAudit } from "./agent-engine-schema";
import {
  CATALOG_BINDINGS,
  AGENT_PACKS,
  ORCHESTRATOR_INVARIANTS,
  DAG_TEMPLATES,
  getBinding,
  getPack,
  getDagTemplate,
} from "@shared/pm-agent-engine";
import { createRunPlan, executeRun } from "./agent-engine-orchestrator";

// ── Bindings Router ─────────────────────────────────────────────────────────

const bindingsRouter = router({
  list: protectedProcedure.query(() => {
    return CATALOG_BINDINGS;
  }),

  get: protectedProcedure
    .input(z.object({ alias: z.string() }))
    .query(({ input }) => {
      const binding = getBinding(input.alias);
      if (!binding) throw new TRPCError({ code: "NOT_FOUND", message: `Binding "${input.alias}" not found` });
      return binding;
    }),
});

// ── Packs Router ────────────────────────────────────────────────────────────

const packsRouter = router({
  list: protectedProcedure.query(() => {
    return AGENT_PACKS;
  }),

  get: protectedProcedure
    .input(z.object({ packId: z.string() }))
    .query(({ input }) => {
      const pack = getPack(input.packId);
      if (!pack) throw new TRPCError({ code: "NOT_FOUND", message: `Pack "${input.packId}" not found` });
      return pack;
    }),
});

// ── Runs Router ─────────────────────────────────────────────────────────────

const runsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      if (input.projectId) {
        return db.select().from(pmtAgentRuns)
          .where(eq(pmtAgentRuns.projectId, input.projectId))
          .orderBy(desc(pmtAgentRuns.createdAt));
      }

      return db.select().from(pmtAgentRuns)
        .orderBy(desc(pmtAgentRuns.createdAt))
        .limit(50);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db.select().from(pmtAgentRuns)
        .where(eq(pmtAgentRuns.id, input.id))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      return rows[0];
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      runType: z.string(),
      packId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Validate pack exists
      const pack = getPack(input.packId);
      if (!pack) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown pack: ${input.packId}` });

      // Validate run type has a DAG template
      const dagNodes = getDagTemplate(input.runType);
      if (!dagNodes) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown run type: ${input.runType}` });

      // Determine phase
      const phase = input.runType.includes("initiating") ? "initiating"
        : input.runType.includes("planning") ? "planning"
        : null;

      // Insert run
      const [run] = await db.insert(pmtAgentRuns).values({
        projectId: input.projectId,
        runType: input.runType,
        packId: input.packId,
        status: "pending",
        phase,
        planDag: dagNodes,
        outputs: {},
        initiatedBy: ctx.user.id,
      }).returning();

      // Execute async (fire-and-forget for Phase 1)
      executeRun(run.id, ctx.user.id).catch((err) => {
        console.error(`[AgentEngine] Run ${run.id} failed:`, err.message);
      });

      return run;
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db.select().from(pmtAgentRuns)
        .where(eq(pmtAgentRuns.id, input.id))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      if (rows[0].status === "completed" || rows[0].status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot cancel run in status: ${rows[0].status}` });
      }

      await db.update(pmtAgentRuns)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(pmtAgentRuns.id, input.id));

      return { success: true };
    }),
});

// ── Drafts Router ───────────────────────────────────────────────────────────

const draftsRouter = router({
  list: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      return db.select().from(pmtAgentDrafts)
        .where(eq(pmtAgentDrafts.runId, input.runId))
        .orderBy(pmtAgentDrafts.createdAt);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db.select().from(pmtAgentDrafts)
        .where(eq(pmtAgentDrafts.id, input.id))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      return rows[0];
    }),

  commit: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db.select().from(pmtAgentDrafts)
        .where(eq(pmtAgentDrafts.id, input.id))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      if (rows[0].commitStatus !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Draft already ${rows[0].commitStatus}` });
      }

      await db.update(pmtAgentDrafts)
        .set({
          commitStatus: "committed",
          committedBy: ctx.user.id,
          committedAt: new Date(),
        })
        .where(eq(pmtAgentDrafts.id, input.id));

      // Emit audit
      const auditDb = getDb();
      if (auditDb) {
        await auditDb.insert(pmtAgentAudit).values({
          runId: rows[0].runId,
          agentAlias: rows[0].sourceAgentAlias,
          eventType: "draft_committed",
          payload: { draftId: input.id, committedBy: ctx.user.id },
          actorId: ctx.user.id,
        });
      }

      return { success: true };
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db.select().from(pmtAgentDrafts)
        .where(eq(pmtAgentDrafts.id, input.id))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      if (rows[0].commitStatus !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Draft already ${rows[0].commitStatus}` });
      }

      await db.update(pmtAgentDrafts)
        .set({
          commitStatus: "rejected",
          committedBy: ctx.user.id,
          committedAt: new Date(),
          rejectReason: input.reason || null,
        })
        .where(eq(pmtAgentDrafts.id, input.id));

      // Emit audit
      const auditDb = getDb();
      if (auditDb) {
        await auditDb.insert(pmtAgentAudit).values({
          runId: rows[0].runId,
          agentAlias: rows[0].sourceAgentAlias,
          eventType: "draft_rejected",
          payload: { draftId: input.id, reason: input.reason, rejectedBy: ctx.user.id },
          actorId: ctx.user.id,
        });
      }

      return { success: true };
    }),
});

// ── Readiness Router ────────────────────────────────────────────────────────

const readinessRouter = router({
  check: protectedProcedure
    .input(z.object({ projectId: z.number(), gateId: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Load project
      const { projects } = await import("./schema");
      const projs = await db.select().from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);

      if (!projs[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const metadata = (projs[0].metadata || {}) as Record<string, unknown>;
      const phase = input.gateId === "G0" ? "initiating" : "planning";

      // Generate readiness check inline
      const checks: Array<{ item: string; status: string; note: string }> = [];

      if (phase === "initiating") {
        checks.push(
          { item: "Project name", status: metadata.name ? "pass" : "fail", note: "" },
          { item: "Sponsor assigned", status: metadata.sponsor ? "pass" : "fail", note: "" },
          { item: "PM assigned", status: metadata.projectManager ? "pass" : "fail", note: "" },
          { item: "Business case defined", status: metadata.businessCase ? "pass" : "fail", note: "" },
          { item: "Scope items defined", status: (metadata.inScope as string[])?.length > 0 ? "pass" : "fail", note: "" },
          { item: "Deliverables defined", status: (metadata.deliverables as string[])?.length > 0 ? "pass" : "fail", note: "" },
          { item: "Stakeholders identified", status: (metadata.stakeholders as unknown[])?.length > 0 ? "pass" : "fail", note: "" },
        );
      } else {
        checks.push(
          { item: "Scope baseline", status: metadata.scopeStatement ? "pass" : "fail", note: "" },
          { item: "Schedule tasks", status: (metadata.scheduleTasks as unknown[])?.length > 0 ? "pass" : "fail", note: "" },
          { item: "Budget items", status: (metadata.budgetItems as unknown[])?.length > 0 ? "pass" : "fail", note: "" },
          { item: "Quality standards", status: metadata.qualityStandards ? "pass" : "fail", note: "" },
          { item: "Risk register", status: (metadata.riskRegister as unknown[])?.length > 0 ? "pass" : "fail", note: "" },
        );
      }

      const passCount = checks.filter((c) => c.status === "pass").length;
      const failCount = checks.filter((c) => c.status === "fail").length;

      return {
        gateId: input.gateId,
        phase,
        checks,
        summary: {
          total: checks.length,
          pass: passCount,
          fail: failCount,
          ready: failCount === 0,
          score: Math.round((passCount / checks.length) * 100),
        },
      };
    }),
});

// ── Audit Router ────────────────────────────────────────────────────────────

const auditRouter = router({
  listByRun: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      return db.select().from(pmtAgentAudit)
        .where(eq(pmtAgentAudit.runId, input.runId))
        .orderBy(pmtAgentAudit.createdAt);
    }),
});

// ── Export ───────────────────────────────────────────────────────────────────

export const agentEngineRouter = router({
  bindings: bindingsRouter,
  packs: packsRouter,
  runs: runsRouter,
  drafts: draftsRouter,
  readiness: readinessRouter,
  audit: auditRouter,
  invariants: protectedProcedure.query(() => ORCHESTRATOR_INVARIANTS),
});
