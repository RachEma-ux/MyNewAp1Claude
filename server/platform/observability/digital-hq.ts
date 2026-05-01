/**
 * Digital HQ — Observability Read Model
 *
 * Aggregates platform-modular state for the HQ dashboard. NEVER queries
 * a module's private DB. Pulls from:
 *   - Module Registry (states, health)
 *   - Event Bus (outbox stats)
 *   - Handoff Manager (counts by status)
 *   - Coordinator (workflow counts by status)
 *
 * The HQ tRPC router (`server/hq/router.ts`) is the consumer.
 */

import { getModuleRegistry } from "../modules/registry";
import { getEventStats } from "../events";
import { listHandoffs } from "../handoff";
import { listWorkflows, listCompensationHandlers } from "../coordinator";
import { listRegisteredActions } from "../modules/module-gateway";

export interface DigitalHqSnapshot {
  generatedAt: string;
  modules: {
    total: number;
    running: number;
    degraded: number;
    failed: number;
    disabled: number;
    /** Modules whose state ≠ running. Useful for at-a-glance alerts. */
    degradedKeys: string[];
    items: Array<{
      key: string;
      state: string;
      runtime: string;
      database: string;
      lastHealthState?: string;
      bootError?: string;
    }>;
  };
  events: {
    outboxSize: number;
    pending: number;
    delivered: number;
    failed: number;
    deadLetter: number;
    /** Per-subscriber failure traces for critical events (added in
     *  PR #46 review-fix pass). */
    criticalDeadLetter: number;
  };
  handoffs: {
    total: number;
    draft: number;
    submitted: number;
    accepted: number;
    rejected: number;
    inProgress: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
  workflows: {
    total: number;
    draft: number;
    running: number;
    paused: number;
    completed: number;
    failed: number;
    compensating: number;
    compensated: number;
    cancelled: number;
    /** Workflows that have not updated for >5min and aren't terminal.
     *  A coarse "stuck" heuristic for the dashboard. */
    stuck: number;
    /** Workflow IDs flagged as stuck — useful for drill-down. */
    stuckIds: string[];
  };
  gateway: {
    /** Public-API actions registered with the gateway. */
    registeredActions: number;
    /** Per-module breakdown of registered actions. */
    byModule: Record<string, number>;
  };
  compensation: {
    /** Compensation handlers registered with the coordinator. */
    handlers: number;
    /** Per-module breakdown of registered compensation handlers. */
    byModule: Record<string, number>;
  };
}

export async function snapshotDigitalHq(): Promise<DigitalHqSnapshot> {
  const registry = getModuleRegistry();
  const list = registry.list();
  const states = registry.states_();
  const stateMap = new Map(states.map((s) => [s.key, s]));

  const moduleItems = list.map((m) => {
    const s = stateMap.get(m.key);
    return {
      key: m.key,
      state: s?.state ?? "registered",
      runtime: m.runtime.mode,
      database: m.database.kind,
      lastHealthState: s?.lastHealth?.state,
      bootError: s?.bootError,
    };
  });

  const degradedKeys = states
    .filter((s) => s.state !== "running" && s.state !== "registered")
    .map((s) => s.key);

  const moduleSummary = {
    total: list.length,
    running: states.filter((s) => s.state === "running").length,
    degraded: states.filter((s) => s.state === "degraded").length,
    failed: states.filter((s) => s.state === "failed").length,
    disabled: states.filter((s) => s.state === "disabled").length,
    degradedKeys,
    items: moduleItems,
  };

  const allHandoffs = await listHandoffs();
  const handoffsSummary = {
    total: allHandoffs.length,
    draft: allHandoffs.filter((h) => h.status === "draft").length,
    submitted: allHandoffs.filter((h) => h.status === "submitted").length,
    accepted: allHandoffs.filter((h) => h.status === "accepted").length,
    rejected: allHandoffs.filter((h) => h.status === "rejected").length,
    inProgress: allHandoffs.filter((h) => h.status === "in_progress").length,
    completed: allHandoffs.filter((h) => h.status === "completed").length,
    failed: allHandoffs.filter((h) => h.status === "failed").length,
    cancelled: allHandoffs.filter((h) => h.status === "cancelled").length,
  };

  const allWorkflows = await listWorkflows();
  const STUCK_THRESHOLD_MS = 5 * 60 * 1000;
  const now = Date.now();
  const isTerminal = (s: string) =>
    s === "completed" || s === "failed" || s === "cancelled" || s === "compensated";
  const stuckWorkflows = allWorkflows.filter(
    (w) =>
      !isTerminal(w.status) &&
      now - new Date(w.updatedAt).getTime() > STUCK_THRESHOLD_MS,
  );
  const workflowsSummary = {
    total: allWorkflows.length,
    draft: allWorkflows.filter((w) => w.status === "draft").length,
    running: allWorkflows.filter((w) => w.status === "running").length,
    paused: allWorkflows.filter((w) => w.status === "paused").length,
    completed: allWorkflows.filter((w) => w.status === "completed").length,
    failed: allWorkflows.filter((w) => w.status === "failed").length,
    compensating: allWorkflows.filter((w) => w.status === "compensating").length,
    compensated: allWorkflows.filter((w) => w.status === "compensated").length,
    cancelled: allWorkflows.filter((w) => w.status === "cancelled").length,
    stuck: stuckWorkflows.length,
    stuckIds: stuckWorkflows.map((w) => w.workflowId),
  };

  const gatewayActions = listRegisteredActions();
  const gatewayByModule: Record<string, number> = {};
  for (const a of gatewayActions) {
    gatewayByModule[a.module] = (gatewayByModule[a.module] ?? 0) + 1;
  }
  const compHandlers = listCompensationHandlers();
  const compByModule: Record<string, number> = {};
  for (const h of compHandlers) {
    compByModule[h.module] = (compByModule[h.module] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    modules: moduleSummary,
    events: getEventStats(),
    handoffs: handoffsSummary,
    workflows: workflowsSummary,
    gateway: {
      registeredActions: gatewayActions.length,
      byModule: gatewayByModule,
    },
    compensation: {
      handlers: compHandlers.length,
      byModule: compByModule,
    },
  };
}
