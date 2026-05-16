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

import { z } from "zod";
import { router, adminProcedure } from "../../../_core/trpc.js";
import { getHealthAlertCronStatus } from "./health-alert-cron.js";
import {
  listOpenHealthAlerts,
  resolveHealthAlertById,
  runHealthAlertScan,
} from "./health-alert.js";

const ResolveAlertInput = z.object({
  alertId: z.number().int().positive(),
});

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

  /**
   * T-I.56 — operator-triggered single-alert resolution. Distinct
   * from the auto-resolution path in `persistHealthAlertDecisions`
   * (which resolves alerts when the next scan no longer observes
   * the breach key); this lets operators dismiss a specific alert
   * by id without waiting for the next scan.
   *
   * Returns `{ resolved: boolean }` — `false` is idempotent (alert
   * already resolved, wrong id, or wrong scope). Same single-global-
   * scope assumption as `listOpen`.
   */
  resolveAlert: adminProcedure
    .input(ResolveAlertInput)
    .mutation(async ({ input }) => {
      return resolveHealthAlertById(input.alertId, "default");
    }),

  /**
   * T-I.57 — operator-triggered ad-hoc health alert scan. Mirrors
   * the staleness-check Run-now mutation (T-I.46): runs the same
   * `runHealthAlertScan` the cron wrapper invokes, without waiting
   * for the next cron tick. Useful for confirming a freshly-deployed
   * threshold change or triaging a suspected backend issue.
   *
   * Returns the structured scan result so the UI can surface
   * `decisions.length`, `persisted.raised`, `persisted.resolved`
   * for the operator-feedback line. Scope pinned to "default" to
   * match the cron's single-global-scope assumption.
   */
  runAlertScan: adminProcedure.mutation(async () => {
    return runHealthAlertScan({ scope: "default" });
  }),
});
