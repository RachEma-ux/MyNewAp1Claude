/**
 * Agent Studio — Graph Skill Pack tRPC sub-router (Phase 12.5 §8).
 *
 * Surfaces the read-side helpers of the Graph Skill Pack module so
 * the admin UI / governance dashboards can render usage analytics
 * for Skill Packs without reaching into the service module directly.
 *
 *   - `listUsageCounts` — protected; aggregated per-pack-version
 *                          usage counts over a look-back window.
 *
 * Mutations (pack create / version publish / template runs) are not
 * exposed here — those are governed and ship via the boot-time seed
 * pipeline (`server/agent-studio/db/seed-graph-skill-rows.ts`) or
 * a dedicated governed sub-router that comes with the publish flow.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../_core/trpc";
import { listUsageCounts } from "../services/graph-skill/public-api";

export const graphSkillRouter = router({
  listUsageCounts: protectedProcedure
    .input(
      z.object({
        /**
         * Look-back window in ms from `now`. Defaults to the
         * service-side default (7 days). Hard-capped at 90 days to
         * keep the aggregate query bounded — operators wanting longer
         * horizons should consume the raw table via an analytics
         * pipeline, not this endpoint.
         */
        sinceMs: z
          .number()
          .int()
          .positive()
          .max(90 * 24 * 60 * 60 * 1000)
          .optional(),
        /** Filter to a single Skill Pack by `skillKey`. */
        skillKey: z.string().min(1).max(100).optional(),
        /** Row cap; defaults to service-side default (100). */
        limit: z.number().int().positive().max(500).optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const rows = await listUsageCounts({
          sinceMs: input.sinceMs,
          skillKey: input.skillKey,
          limit: input.limit,
        });
        return {
          rows: rows.map((r) => ({
            skillKey: r.skillKey,
            packId: r.packId,
            packVersionId: r.packVersionId,
            version: r.version,
            count: r.count,
            // tRPC SuperJSON serializes Date instances; the client
            // sees a real `Date` on the other side.
            latestUsedAt: r.latestUsedAt,
          })),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `graph-skill usage counts failed: ${msg}`,
        });
      }
    }),
});
