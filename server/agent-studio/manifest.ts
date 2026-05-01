/**
 * Agent Studio Module Manifest
 *
 * Runtime: worker — owns asdb, scheduler, MCP server self-attach.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { agentStudioRouter } from "./api/router";
import { dbPingHealth } from "../platform/modules/health";

export const agentStudioManifest: ModuleManifest = {
  key: "agentStudio",
  name: "AI Agent Studio",
  version: "1.0.0",

  runtime: { mode: "worker", required: false },

  database: {
    kind: "owned",
    key: "asdb",
    connect: async () => {
      const { getAsDb } = await import("./db/connection");
      return getAsDb();
    },
  },

  router: agentStudioRouter,
  routerKey: "agentStudio",

  permissions: {
    keys: [
      "agentStudio.read",
      "agentStudio.write",
      "agentStudio.run",
      "agentStudio.publish",
    ],
  },

  governanceActions: [
    {
      key: "agentStudio.agent.publish",
      description: "Publish an agent to the catalog",
      risk: "high",
      receiptRequired: true,
    },
    {
      key: "agentStudio.run.execute",
      description: "Execute an agent run",
      risk: "medium",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/agent-studio", label: "Agent Studio" }],
  navigation: [{ group: "build", label: "Agent Studio", order: 11 }],

  boot: async (ctx) => {
    try {
      const { bootAgentStudio } = await import("./boot");
      await bootAgentStudio();
    } catch (err: any) {
      ctx.log("warn", `boot skipped — ${err?.message ?? err}`);
    }
  },

  postListen: async (ctx) => {
    try {
      const { bootAgentStudioPostListen } = await import("./boot");
      await bootAgentStudioPostListen();
    } catch (err: any) {
      ctx.log("warn", `postListen skipped — ${err?.message ?? err}`);
    }
  },

  health: async () => {
    const { getAsDb } = await import("./db/connection");
    return dbPingHealth("ASDB", getAsDb);
  },

  publicApi: { path: "server/agent-studio/public-api.ts" },
  events: { emits: ["agentStudio.run.completed", "agentStudio.run.failed"] },
  handoffs: { accepts: ["agentStudio.run.requested"], produces: ["agentStudio.codeStudio.handoff"] },
  ports: { provided: ["agentStudio.run"], consumed: ["codeStudio.run", "sandboxWf.execute"] },
  communication: { modes: ["gateway", "handoff", "event", "coordinator"] },
};
