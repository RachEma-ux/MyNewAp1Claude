/**
 * Platform Audit tRPC Router
 *
 * Admin-only endpoints for triggering, viewing, and managing platform audits.
 * Nested under governance.audit.*
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { governanceAuditPreferences } from "../../drizzle/schema";
import {
  startAuditRun,
  getAuditRun,
  getLatestAuditRun,
  listAuditRuns,
} from "./audit-runner";

export const auditRouter = router({
  /**
   * Trigger a new platform audit run.
   * Returns the run ID immediately; audit executes in the background.
   */
  run: adminProcedure
    .input(
      z.object({
        format: z.enum(["json", "txt", "both"]).default("json"),
        strict: z.boolean().default(false),
        design: z.enum(["executive", "standard", "forensics"]).default("standard"),
        saveAsDefault: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const principalId = String(ctx.user.id);

      // Optionally save as default preferences
      if (input.saveAsDefault) {
        const db = getDb();
        if (db) {
          await db
            .insert(governanceAuditPreferences)
            .values({
              principalId,
              defaultFormat: input.format,
              defaultDesign: input.design,
              defaultStrict: input.strict,
            })
            .onConflictDoUpdate({
              target: governanceAuditPreferences.principalId,
              set: {
                defaultFormat: input.format,
                defaultDesign: input.design,
                defaultStrict: input.strict,
                updatedAt: new Date(),
              },
            });
        }
      }

      try {
        return await startAuditRun({
          format: input.format,
          strict: input.strict,
          design: input.design,
          triggeredBy: principalId,
        });
      } catch (err: any) {
        throw new TRPCError({
          code: "CONFLICT",
          message: err.message,
        });
      }
    }),

  /**
   * Get the most recent audit run.
   */
  latest: adminProcedure.query(async () => {
    return await getLatestAuditRun();
  }),

  /**
   * List audit runs with optional filters.
   */
  list: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional(),
        status: z.enum(["queued", "running", "pass", "fail", "error"]).optional(),
        triggeredBy: z.string().optional(),
        design: z.enum(["executive", "standard", "forensics"]).optional(),
        strict: z.boolean().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      return await listAuditRuns(input || undefined);
    }),

  /**
   * Get a specific audit run by ID.
   */
  get: adminProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const run = await getAuditRun(input.runId);
      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Audit run not found" });
      }
      return run;
    }),

  /**
   * Get current admin's saved audit preferences.
   */
  preferences: adminProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) return null;
    const principalId = String(ctx.user.id);
    const [prefs] = await db
      .select()
      .from(governanceAuditPreferences)
      .where(eq(governanceAuditPreferences.principalId, principalId))
      .limit(1);
    return prefs || null;
  }),

  /**
   * Save audit preferences for current admin.
   */
  savePreferences: adminProcedure
    .input(
      z.object({
        format: z.enum(["json", "txt", "both"]),
        design: z.enum(["executive", "standard", "forensics"]),
        strict: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const principalId = String(ctx.user.id);

      await db
        .insert(governanceAuditPreferences)
        .values({
          principalId,
          defaultFormat: input.format,
          defaultDesign: input.design,
          defaultStrict: input.strict,
        })
        .onConflictDoUpdate({
          target: governanceAuditPreferences.principalId,
          set: {
            defaultFormat: input.format,
            defaultDesign: input.design,
            defaultStrict: input.strict,
            updatedAt: new Date(),
          },
        });

      return { saved: true };
    }),
});
