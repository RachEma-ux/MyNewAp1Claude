/**
 * Canvas projection events drain — admin tRPC router (PR-V1-62).
 *
 * Exposes the module-singleton observability state from #810
 * (`getCanvasProjectionEventsDrainLastTickResult()`) as an admin
 * tRPC procedure so operators can inspect the scheduler's tick
 * cadence + last-tick result + last-tick error without ssh-ing
 * the process.
 *
 * Mounted at `agentStudio.canvasProjectionEventsDrain.*`. The
 * router carries only read surfaces — no mutations. Mirrors the
 * shape of the graph-health router (`graphHealthRouter` from
 * J-1-β, #758) so the operator UI can render it with the same
 * panel pattern.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` / `openrouter` / `GraphRepository` imports.
 *   - Read-only — `getCanvasProjectionEventsDrainLastTickResult` is
 *     a pure module-state snapshot.
 *   - `adminProcedure` — drain state isn't workspace-scoped
 *     (cursor map spans all workspaces); only operators view it.
 */

import { adminProcedure, router } from "../../../_core/trpc.js";
import {
  getCanvasProjectionEventsDrainLastTickResult,
  hasCanvasProjectionEventsDrainForwarder,
  tickCanvasProjectionEventsDrain,
} from "./projection-events-drain-tick.js";

export const canvasProjectionEventsDrainRouter = router({
  /**
   * Read the module-singleton tick state set by the scheduler
   * (#811) / tick wrapper (#810). Returns `{ ticksRun,
   * lastTickResult, lastTickError, cursorMapSize }`.
   *
   * Useful operator queries this answers:
   *   - Is the scheduler running? → `ticksRun > 0`
   *   - Did the last tick succeed? → `lastTickError == null`
   *   - How many workspaces are being tracked? → `cursorMapSize`
   *   - What were the per-workspace aggregates from the last
   *     tick? → `lastTickResult.perWorkspace[]`
   */
  getDrainStatus: adminProcedure.query(async () => {
    return getCanvasProjectionEventsDrainLastTickResult();
  }),

  /**
   * PR-V1-174: operator-triggered manual tick. Useful for:
   *   - Smoke-testing forwarder install in dev without waiting for
   *     the scheduler's interval (default 60s).
   *   - Force-draining after an operator-supplied catch-up.
   *
   * Returns `{ ran: boolean, reason?: string,
   * result?: <drain aggregate> }`. `ran: false, reason:
   * "no_forwarder_installed"` when the forwarder hasn't been wired
   * (mirrors the tick wrapper's existing no-op + WARN behavior).
   */
  forceTick: adminProcedure.mutation(async () => {
    if (!hasCanvasProjectionEventsDrainForwarder()) {
      return { ran: false as const, reason: "no_forwarder_installed" as const };
    }
    const result = await tickCanvasProjectionEventsDrain();
    return { ran: true as const, result };
  }),
});
