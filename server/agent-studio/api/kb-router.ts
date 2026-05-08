/**
 * Agent Studio — Knowledge Base tRPC sub-router (Retrofit P11).
 *
 * Read window onto `agsKnowledgeUnits` + `agsProvenanceRecords`, plus
 * U5-b.4 operator-override mutations.
 *
 *   - `listUnits`           — protected; workspace + optional source filter
 *   - `getUnit`             — protected; one unit by id (workspace-scoped)
 *   - `getProvenance`       — protected; one provenance row by id
 *   - `listFreshnessCounts` — protected; quick counts for the inspector
 *   - `setLicense`          — governed (U5-b.4); operator override of unit license
 *   - `clearPiiFindings`    — governed (U5-b.4); operator false-positive override
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getAsDb } from "../db/connection";
import { hasWorkspaceAccess } from "../../db/workspaces";
import {
  agsKnowledgeUnits,
  agsProvenanceRecords,
  agsDataValidationResults,
} from "../../../drizzle/tables/agent-studio";

const workspaceRefSchema = z.object({
  workspaceId: z.number().int().positive(),
});

function asdb() {
  const db = getAsDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ASDB unavailable" });
  }
  return db;
}

/**
 * Workspace-membership gate. The retrofit's KB tables carry a
 * `workspaceId` column per D-UI-2; this gate ensures clients can only
 * query workspaces they belong to. Mirrors the pattern documents-crud
 * has used since before the retrofit. (Review cleanup — kb-router was
 * trusting client-supplied `workspaceId` without validation.)
 */
async function assertWorkspaceAccess(userId: number, workspaceId: number): Promise<void> {
  const ok = await hasWorkspaceAccess(userId, workspaceId);
  if (!ok) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `User ${userId} does not have access to workspace ${workspaceId}`,
    });
  }
}

export const kbRouter = router({
  listUnits: protectedProcedure
    .input(
      workspaceRefSchema.extend({
        sourceId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        includeArchived: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertWorkspaceAccess(ctx.user.id, input.workspaceId);
      const db = asdb();
      const conds = [eq(agsKnowledgeUnits.workspaceId, input.workspaceId)];
      if (typeof input.sourceId === "number") {
        conds.push(eq(agsKnowledgeUnits.sourceId, input.sourceId));
      }
      if (!input.includeArchived) {
        conds.push(isNull(agsKnowledgeUnits.archivedAt));
      }
      const rows = await db
        .select()
        .from(agsKnowledgeUnits)
        .where(and(...conds))
        .orderBy(desc(agsKnowledgeUnits.id))
        .limit(input.limit);
      return rows;
    }),

  getUnit: protectedProcedure
    .input(
      workspaceRefSchema.extend({
        unitId: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertWorkspaceAccess(ctx.user.id, input.workspaceId);
      const db = asdb();
      const rows = await db
        .select()
        .from(agsKnowledgeUnits)
        .where(
          and(
            eq(agsKnowledgeUnits.id, input.unitId),
            eq(agsKnowledgeUnits.workspaceId, input.workspaceId),
          ),
        )
        .limit(1);
      if (!rows[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Unit ${input.unitId} not found` });
      }
      return rows[0];
    }),

  getProvenance: protectedProcedure
    .input(
      workspaceRefSchema.extend({
        provenanceId: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertWorkspaceAccess(ctx.user.id, input.workspaceId);
      const db = asdb();
      const rows = await db
        .select()
        .from(agsProvenanceRecords)
        .where(
          and(
            eq(agsProvenanceRecords.id, input.provenanceId),
            eq(agsProvenanceRecords.workspaceId, input.workspaceId),
          ),
        )
        .limit(1);
      if (!rows[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Provenance ${input.provenanceId} not found` });
      }
      return rows[0];
    }),

  listFreshnessCounts: protectedProcedure
    .input(workspaceRefSchema)
    .query(async ({ ctx, input }) => {
      await assertWorkspaceAccess(ctx.user.id, input.workspaceId);
      const db = asdb();
      const rows = await db
        .select({
          freshnessState: agsKnowledgeUnits.freshnessState,
          count: sql<number>`count(*)::int`,
        })
        .from(agsKnowledgeUnits)
        .where(
          and(
            eq(agsKnowledgeUnits.workspaceId, input.workspaceId),
            isNull(agsKnowledgeUnits.archivedAt),
          ),
        )
        .groupBy(agsKnowledgeUnits.freshnessState);
      return rows;
    }),

  /**
   * U5-b.4: operator override of a unit's license. Sets `license` to
   * the supplied value (or NULL to clear). Governed because it
   * affects retrieval-time license enforcement (a unit re-tagged from
   * `GPL-3.0-or-later` to `MIT` would suddenly become retrievable
   * under a profile that blocklists GPL).
   */
  setLicense: governedProcedure
    .input(
      workspaceRefSchema.extend({
        unitId: z.number().int().positive(),
        // VARCHAR(64) on the column; same bound here.
        license: z.string().min(1).max(64).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspaceAccess(ctx.user.id, input.workspaceId);
      const db = asdb();
      const [updated] = await db
        .update(agsKnowledgeUnits)
        .set({ license: input.license, updatedAt: new Date() })
        .where(
          and(
            eq(agsKnowledgeUnits.id, input.unitId),
            eq(agsKnowledgeUnits.workspaceId, input.workspaceId),
          ),
        )
        .returning();
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Unit ${input.unitId} not found in workspace ${input.workspaceId}`,
        });
      }
      return updated;
    }),

  /**
   * U5-b.4: operator false-positive override for PII findings.
   *
   * Per ADR DD7 the validation audit trail (`ags_data_validation_results`)
   * stays immutable; only the unit-row projection clears. The unit's
   * `validationStatus` is recomputed from the remaining non-PII
   * findings so a unit that was `blocked` solely on PII becomes
   * retrievable again, while units `blocked` for orthogonal reasons
   * (missing permission_context, etc.) keep their status.
   *
   * Governed because clearing PII findings unblocks retrieval of
   * content that was previously gated.
   */
  clearPiiFindings: governedProcedure
    .input(
      workspaceRefSchema.extend({
        unitId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspaceAccess(ctx.user.id, input.workspaceId);
      const db = asdb();

      // 1. Read the unit + its referenced validation result.
      const [unit] = await db
        .select()
        .from(agsKnowledgeUnits)
        .where(
          and(
            eq(agsKnowledgeUnits.id, input.unitId),
            eq(agsKnowledgeUnits.workspaceId, input.workspaceId),
          ),
        )
        .limit(1);
      if (!unit) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Unit ${input.unitId} not found in workspace ${input.workspaceId}`,
        });
      }

      // 2. Re-derive validationStatus from the audit trail without
      //    PII findings. If the unit has no validation_result_id (legacy
      //    pre-D-UI-4), default to "ok".
      let recomputedStatus: "ok" | "warn" | "blocked" = "ok";
      if (typeof unit.validationResultId === "number") {
        const [validation] = await db
          .select()
          .from(agsDataValidationResults)
          .where(eq(agsDataValidationResults.id, unit.validationResultId))
          .limit(1);
        const findings = Array.isArray(validation?.findings)
          ? (validation!.findings as Array<{ rule?: unknown; severity?: unknown }>)
          : [];
        const remaining = findings.filter((f) => {
          const rule = typeof f.rule === "string" ? f.rule : "";
          return !rule.startsWith("pii_");
        });
        recomputedStatus = remaining.some((f) => f.severity === "block")
          ? "blocked"
          : remaining.some((f) => f.severity === "warn")
            ? "warn"
            : "ok";
      }

      // 3. Update the unit row.
      const [updated] = await db
        .update(agsKnowledgeUnits)
        .set({
          piiFindings: null,
          validationStatus: recomputedStatus,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agsKnowledgeUnits.id, input.unitId),
            eq(agsKnowledgeUnits.workspaceId, input.workspaceId),
          ),
        )
        .returning();
      return {
        unit: updated,
        recomputedStatus,
      };
    }),
});
