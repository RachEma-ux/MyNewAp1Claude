/**
 * Graph Projection — tRPC Router.
 *
 * Strict-audit item #9 partial closure (2026-05-13). Surface for the
 * projection drift cron's status. Mounted at
 * `agentStudio.graphProjection.*`.
 *
 * The on-demand drift-scan path (`GraphRepository.detectDrift()`) is
 * separately exposed by the underlying repository; this router carries
 * only the cron-status shape so the operator UI can render the drift
 * cron alongside the 18 retention crons with the same panel pattern.
 */

import { router, adminProcedure } from "../../../../_core/trpc.js";
import { getProjectionDriftCronStatus } from "./drift-cron.js";

export const graphProjectionRouter = router({
  /**
   * Cron status surface. Mirrors the shape of the 18 retention crons
   * (`{ lastRunAt, lastResult, lastError }`) so the operator UI can
   * render it with the same panel pattern.
   */
  getDriftCronStatus: adminProcedure.query(async () => {
    return getProjectionDriftCronStatus();
  }),
});
