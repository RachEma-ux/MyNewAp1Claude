/**
 * Agent Studio Module Manifest
 *
 * Runtime: worker — owns asdb, scheduler, MCP server self-attach.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { agentStudioRouter } from "./api/router";
import { dbPingHealth } from "../platform/modules/health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";

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
      description:
        "Publish an agent (lifecycle-only flip + agsAgentReleases insert; no catalog writes)",
      // Plan v3 Phase 20: downgraded from "high" to "medium". Publish
      // is a lifecycle-only operation: it writes to the Agent
      // Studio-owned `ags_agent_releases` table and flips
      // `ags_agents.lifecycleState`. It does NOT write to the catalog
      // (catalog registration lives behind `aiTypes.catalog.register`,
      // wired in Phase 25). Receipt remains required because
      // publishing affects production routing.
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "agentStudio.run.execute",
      description: "Execute an agent run",
      risk: "medium",
      receiptRequired: true,
    },
    // Plan v3 Phase 12 — provider/model binding lifecycle. The picker
    // UI (Phase 14) calls these through the gateway. None return
    // credential material; per Decision D2 the runtime credential
    // resolver is reachable only from `openrouter/model-access`.
    {
      key: "agentStudio.providerBindings.list",
      description: "List provider bindings for an agent (no credentials)",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "agentStudio.providerBindings.create",
      description: "Create a provider binding (calls Phase 8 eligibility gate)",
      risk: "medium",
      receiptRequired: false,
    },
    {
      key: "agentStudio.providerBindings.update",
      description: "Update an existing provider binding (re-runs eligibility gate)",
      risk: "medium",
      receiptRequired: false,
    },
    {
      key: "agentStudio.providerBindings.remove",
      description: "Delete a provider binding by (draftId, role)",
      risk: "medium",
      receiptRequired: false,
    },
    {
      key: "agentStudio.providerBindings.validate",
      description:
        "Reference/policy validation of a binding — no upstream HTTP probe",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "agentStudio.providerBindings.resolveForRun",
      description:
        "Resolve a binding for runtime use — returns refs only, no credentials",
      risk: "low",
      receiptRequired: false,
    },
  ],

  routes: [{ path: "/agent-studio", label: "Agent Studio" }],
  navigation: [{ group: "build", label: "Agent Studio", order: 11 }],

  boot: async (ctx) => {
    registerModuleHealthAction(agentStudioManifest);
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
  runtimePorts: [
    {
      key: "asdb",
      label: "ASDB (Postgres)",
      mode: "external",
      protocol: "postgres",
      env: "DATABASE_URL_ASDB",
      defaultPort: 5432,
      defaultHost: "127.0.0.1",
      defaultUrl: "postgres://127.0.0.1:5432/asdb",
      externallyManaged: true,
      description: "Agent Studio module-owned database; falls back to local Postgres.",
    },
  ],
  communication: { modes: ["gateway", "handoff", "event", "coordinator"] },
};
