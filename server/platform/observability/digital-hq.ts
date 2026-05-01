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
import { listWorkflows } from "../coordinator";

export interface DigitalHqSnapshot {
  generatedAt: string;
  modules: {
    total: number;
    running: number;
    degraded: number;
    failed: number;
    disabled: number;
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
  };
  handoffs: {
    total: number;
    submitted: number;
    accepted: number;
    rejected: number;
    completed: number;
    failed: number;
  };
  workflows: {
    total: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
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

  const moduleSummary = {
    total: list.length,
    running: states.filter((s) => s.state === "running").length,
    degraded: states.filter((s) => s.state === "degraded").length,
    failed: states.filter((s) => s.state === "failed").length,
    disabled: states.filter((s) => s.state === "disabled").length,
    items: moduleItems,
  };

  const allHandoffs = await listHandoffs();
  const handoffsSummary = {
    total: allHandoffs.length,
    submitted: allHandoffs.filter((h) => h.status === "submitted").length,
    accepted: allHandoffs.filter((h) => h.status === "accepted").length,
    rejected: allHandoffs.filter((h) => h.status === "rejected").length,
    completed: allHandoffs.filter((h) => h.status === "completed").length,
    failed: allHandoffs.filter((h) => h.status === "failed").length,
  };

  const allWorkflows = await listWorkflows();
  const workflowsSummary = {
    total: allWorkflows.length,
    running: allWorkflows.filter((w) => w.status === "running").length,
    completed: allWorkflows.filter((w) => w.status === "completed").length,
    failed: allWorkflows.filter((w) => w.status === "failed").length,
    cancelled: allWorkflows.filter((w) => w.status === "cancelled").length,
  };

  return {
    generatedAt: new Date().toISOString(),
    modules: moduleSummary,
    events: getEventStats(),
    handoffs: handoffsSummary,
    workflows: workflowsSummary,
  };
}
