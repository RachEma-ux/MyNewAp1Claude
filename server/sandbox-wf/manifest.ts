/**
 * Sandbox WF Module Manifest
 *
 * Runtime: worker — owns wfdb, executor, scheduler.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { sandboxWfRouter } from "./router";
import { dbPingHealth } from "../platform/modules/health";

export const sandboxWfManifest: ModuleManifest = {
  key: "sandboxWf",
  name: "Sandbox WF",
  version: "1.0.0",

  runtime: { mode: "worker", required: false },

  database: {
    kind: "owned",
    key: "wfdb",
    connect: async () => {
      const { getWfDb } = await import("./connection");
      return getWfDb();
    },
  },

  router: sandboxWfRouter,
  routerKey: "sandboxWf",

  permissions: {
    keys: ["sandboxWf.read", "sandboxWf.write", "sandboxWf.run"],
  },

  governanceActions: [
    {
      key: "sandboxWf.workflow.publish",
      description: "Publish a workflow",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "sandboxWf.execute",
      description: "Execute a workflow",
      risk: "medium",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/workflows", label: "Workflows" }],
  navigation: [{ group: "build", label: "Workflows", order: 12 }],

  boot: async (ctx) => {
    try {
      const { ensureWfDbSeeded } = await import("./seed");
      const result = await ensureWfDbSeeded();
      if (result.seeded) {
        ctx.log("info", `seeded ${result.workflows} workflows, ${result.triggers} triggers, ${result.steps} steps`);
      }
    } catch (err: any) {
      ctx.log("warn", `seed skipped — ${err?.message ?? err}`);
    }
  },

  health: async () => {
    const { getWfDb } = await import("./connection");
    return dbPingHealth("WFDB", getWfDb);
  },

  publicApi: { path: "server/sandbox-wf/public-api.ts" },
  events: {
    emits: ["sandboxWf.execution.started", "sandboxWf.execution.completed", "sandboxWf.execution.failed"],
  },
  handoffs: { accepts: ["sandboxWf.execute.requested"], produces: [] },
  ports: { provided: ["sandboxWf.execute"], consumed: ["codeStudio.run"] },
  communication: { modes: ["gateway", "handoff", "event", "coordinator"] },
};
