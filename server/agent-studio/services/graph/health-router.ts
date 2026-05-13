/**
 * Graph Health — tRPC Router.
 *
 * V1+ Phase J-1-β surface for the health-alert cron's status and
 * (eventually) the operator-listable open-alerts feed. Mounted at
 * `agentStudio.graphHealth.*`.
 *
 * The pure evaluator + scanner live in `health-alert.ts`; the cron
 * wrapper lives in `health-alert-cron.ts`. This router carries only
 * operator-facing read surfaces — no mutations.
 */

import { router, adminProcedure } from "../../../_core/trpc.js";
import { getHealthAlertCronStatus } from "./health-alert-cron.js";
import { listOpenHealthAlerts } from "./health-alert.js";

export const graphHealthRouter = router({
  /**
   * Cron status surface. Mirrors the shape of the projection drift
   * cron + the 18 retention crons (`{ lastRunAt, lastResult,
   * lastError }`) so the operator UI can render it with the same
   * panel pattern.
   */
  getAlertCronStatus: adminProcedure.query(async () => {
    return getHealthAlertCronStatus();
  }),

  /**
   * List currently-open (un-resolved) health alerts. Operator
   * dashboard consumes this to surface live breach conditions
   * alongside the cron status. Single global scope today; per-
   * workspace scopes land in V1.5 (multi-region pin integration).
   */
  listOpen: adminProcedure.query(async () => {
    return listOpenHealthAlerts("default");
  }),
});
