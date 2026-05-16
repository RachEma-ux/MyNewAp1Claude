/**
 * Graph Projection — tRPC Router.
 *
 * Strict-audit item #9 partial closure (2026-05-13). Surface for the
 * projection drift cron's status. Mounted at
 * `agentStudio.graphProjection.*`.
 *
 * T-I.46 (2026-05-16) adds the on-demand staleness check procedure so
 * operators can trigger `runStalenessCheck` from the admin UI without
 * waiting for the cron-schedule wrapper to land. The procedure returns
 * the structured summary AND fires the `neo4j_projection_stale` bridge
 * events as a side-effect.
 *
 * The on-demand drift-scan path (`GraphRepository.detectDrift()`) is
 * separately exposed by the underlying repository; this router carries
 * the cron-status shape so the operator UI can render the drift
 * cron alongside the 18 retention crons with the same panel pattern.
 */

import { z } from "zod";
import { router, adminProcedure } from "../../../../_core/trpc.js";
import { getProjectionDriftCronStatus } from "./drift-cron.js";
import {
  loadStalenessRowsFromAsDb,
  runStalenessCheck,
} from "./staleness-detector.js";

const RunStalenessCheckInput = z
  .object({
    /** Override the freshness threshold (ms). Default 1 hour. */
    thresholdMs: z.number().int().positive().optional(),
    /** Maximum rows to load from `agsGraphProjectionSyncJobs`. */
    limit: z.number().int().positive().optional(),
  })
  .optional();

export const graphProjectionRouter = router({
  /**
   * Cron status surface. Mirrors the shape of the 18 retention crons
   * (`{ lastRunAt, lastResult, lastError }`) so the operator UI can
   * render it with the same panel pattern.
   */
  getDriftCronStatus: adminProcedure.query(async () => {
    return getProjectionDriftCronStatus();
  }),

  /**
   * On-demand staleness check (T-I.43 + T-I.44 + T-I.45 composition).
   * Runs the freshness-lag detector over `agsGraphProjectionSyncJobs`
   * rows, fires `neo4j_projection_stale` bridge events for each stale
   * projection, and returns the structured summary.
   *
   * Operator UI can call this without waiting for the cron wrapper —
   * useful for ad-hoc triage when a stuck projection is suspected.
   */
  runStalenessCheck: adminProcedure
    .input(RunStalenessCheckInput)
    .mutation(async ({ input }) => {
      return runStalenessCheck({
        fetchRows: () =>
          loadStalenessRowsFromAsDb({ limit: input?.limit }),
        thresholdMs: input?.thresholdMs,
      });
    }),
});
