/**
 * HQ — Application Wiring Inventory tRPC sub-router
 *
 * Read-only procedures backing the Digital HQ "Application Wiring"
 * panel. The data is computed on each call from the static AWI
 * builder; no DB access, no module-private imports.
 *
 * Runtime facts (gateway action map, registry state, event/handoff
 * stats) are fetched from already-mounted platform read models so the
 * AWI router doesn't reach into module internals.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  buildApplicationWiringInventory,
  buildDependencyGraph,
  buildWiringMatrix,
  computeReadiness,
  getMissingWires,
  getBrokenWires,
  getDeclaredOnlyWires,
  getPartialWires,
  type AwiRuntimeFacts,
} from "../platform/wiring";

async function gatherFacts(): Promise<AwiRuntimeFacts> {
  // Lazy-import the platform read models so this router stays cheap to
  // import in environments without DB / event-bus initialised.
  const facts: AwiRuntimeFacts = {};
  try {
    const { listRegisteredActions } = await import("../platform/modules/module-gateway");
    facts.registeredGatewayActions = listRegisteredActions().map((a) => ({
      module: a.module,
      action: a.action,
    }));
  } catch {
    /* gateway not initialised yet */
  }
  try {
    const { getModuleRegistry } = await import("../platform/modules/registry");
    facts.modulesInRegistry = getModuleRegistry().states_().map((s) => ({
      key: s.key,
      state: s.state,
      lastHealth: s.lastHealth?.state ?? null,
    }));
  } catch {
    /* registry not initialised yet */
  }
  try {
    const { getEventStats } = await import("../platform/events");
    const e = getEventStats();
    facts.eventStats = {
      outboxSize: e.outboxSize,
      deadLetter: e.deadLetter,
      criticalDeadLetter: e.criticalDeadLetter,
    };
  } catch {
    /* event bus not initialised */
  }
  try {
    const { listHandoffs } = await import("../platform/handoff");
    const all = await listHandoffs();
    facts.handoffStats = {
      total: all.length,
      failed: all.filter((h) => h.status === "failed").length,
    };
  } catch {
    /* handoff manager not initialised */
  }
  return facts;
}

export const applicationWiringRouter = router({
  summary: protectedProcedure.query(async () => {
    const facts = await gatherFacts();
    const matrix = buildWiringMatrix({ facts });
    return matrix.summary;
  }),

  matrix: protectedProcedure.query(async () => {
    const facts = await gatherFacts();
    return buildWiringMatrix({ facts });
  }),

  module: protectedProcedure
    .input(z.object({ moduleKey: z.string() }))
    .query(async ({ input }) => {
      const facts = await gatherFacts();
      const all = buildApplicationWiringInventory({ facts });
      const found = all.find((m) => m.moduleKey === input.moduleKey);
      return found ?? null;
    }),

  graph: protectedProcedure.query(async () => {
    const facts = await gatherFacts();
    return buildDependencyGraph({ facts });
  }),

  missing: protectedProcedure.query(async () => {
    const facts = await gatherFacts();
    const all = buildApplicationWiringInventory({ facts });
    return {
      missing: getMissingWires(all),
      broken: getBrokenWires(all),
      declaredOnly: getDeclaredOnlyWires(all),
      partial: getPartialWires(all),
    };
  }),

  blockers: protectedProcedure.query(async () => {
    const facts = await gatherFacts();
    const all = buildApplicationWiringInventory({ facts });
    return all
      .filter((m) => m.blockers.length > 0)
      .map((m) => ({
        moduleKey: m.moduleKey,
        moduleName: m.moduleName,
        readinessScore: m.readinessScore,
        readinessStatus: m.readinessStatus,
        blockers: m.blockers,
      }));
  }),

  readiness: protectedProcedure.query(async () => {
    const facts = await gatherFacts();
    const all = buildApplicationWiringInventory({ facts });
    return all.map((m) => {
      const r = computeReadiness(m.areas);
      return {
        moduleKey: m.moduleKey,
        moduleName: m.moduleName,
        readinessScore: r.score,
        readinessStatus: r.status,
        blockerCount: r.blockers.length,
        warningCount: r.warnings.length,
      };
    });
  }),
});
