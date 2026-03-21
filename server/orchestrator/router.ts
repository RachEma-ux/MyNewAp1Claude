/**
 * Orchestrator tRPC Router — API surface for the operator runtime
 *
 * Endpoints:
 *   - submit: Submit an intent for processing
 *   - getJob: Get a job by ID
 *   - listJobs: List recent jobs
 *   - getOperators: List available operators and capabilities
 *   - getAuditTrail: Query audit log entries
 */

import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { router, protectedProcedure } from "../_core/trpc";
import { submitIntent, getJob, listJobs, listJobsByOperator } from "./orchestrator";
import { OPERATOR_CAPABILITIES, AUTONOMY_TIERS } from "@shared/operator-types";
import type { Intent, AutonomyLevel } from "@shared/operator-types";

export const orchestratorRouter = router({
  /**
   * Submit an intent for autonomous processing
   */
  submit: protectedProcedure
    .input(
      z.object({
        description: z.string().min(1).max(4000),
        context: z.record(z.string(), z.unknown()).default({}),
        workspaceId: z.number().optional(),
        autonomyLevel: z.number().min(0).max(5).default(0),
        operator: z.enum(["builder", "auditor", "governance", "deploy"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const intent: Intent = {
        intentId: `int_${uuidv4().slice(0, 12)}`,
        description: input.description,
        context: input.context,
        workspaceId: input.workspaceId,
        requestedBy: String(ctx.user.id),
        autonomyLevel: input.autonomyLevel as AutonomyLevel,
        createdAt: new Date().toISOString(),
      };

      const job = await submitIntent(intent);

      // Return a plain serializable object (strip any non-JSON-safe values)
      return JSON.parse(JSON.stringify(job));
    }),

  /**
   * Get a specific job by ID
   */
  getJob: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = getJob(input.jobId);
      if (!job) return null;
      return job;
    }),

  /**
   * List recent jobs
   */
  listJobs: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).default(50),
        operator: z.enum(["builder", "auditor", "governance", "deploy"]).optional(),
      })
    )
    .query(async ({ input }) => {
      if (input.operator) {
        return listJobsByOperator(input.operator, input.limit);
      }
      return listJobs(input.limit);
    }),

  /**
   * Get available operators and their capabilities
   */
  getOperators: protectedProcedure.query(async () => {
    return {
      operators: OPERATOR_CAPABILITIES,
      autonomyTiers: AUTONOMY_TIERS,
    };
  }),

  /**
   * Query audit trail entries
   */
  getAuditTrail: protectedProcedure
    .input(
      z.object({
        jobId: z.string().optional(),
        operator: z.enum(["builder", "auditor", "governance", "deploy"]).optional(),
        verdict: z.enum(["allow", "deny", "escalate"]).optional(),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      try {
        const { getDb } = await import("../db");
        const db = getDb();
        if (!db) return [];

        const { operatorAuditLog } = await import("../../drizzle/tables/operator-runtime");
        const { eq, desc } = await import("drizzle-orm");

        let query = db.select().from(operatorAuditLog).orderBy(desc(operatorAuditLog.executedAt)).limit(input.limit);

        if (input.jobId) {
          query = query.where(eq(operatorAuditLog.jobId, input.jobId)) as any;
        } else if (input.operator) {
          query = query.where(eq(operatorAuditLog.operator, input.operator)) as any;
        } else if (input.verdict) {
          query = query.where(eq(operatorAuditLog.verdict, input.verdict)) as any;
        }

        return await query;
      } catch {
        return [];
      }
    }),
});
