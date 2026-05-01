/**
 * Code Studio Module Manifest
 *
 * Runtime: worker — owns codedb, OpenCode runtime, IDE proxy.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { codeStudioRouter } from "./api/router";
import { dbPingHealth } from "../platform/modules/health";

export const codeStudioManifest: ModuleManifest = {
  key: "codeStudio",
  name: "Code Studio",
  version: "1.0.0",

  runtime: { mode: "worker", required: false },

  database: {
    kind: "owned",
    key: "codedb",
    connect: async () => {
      const { getCodeDb } = await import("./connection");
      return getCodeDb();
    },
  },

  router: codeStudioRouter,
  routerKey: "codeStudio",

  permissions: {
    keys: [
      "codeStudio.read",
      "codeStudio.write",
      "codeStudio.run",
      "codeStudio.template.publish",
    ],
  },

  governanceActions: [
    {
      key: "codeStudio.template.publish",
      description: "Publish a Code Studio template",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "codeStudio.run.execute",
      description: "Execute a Code Studio run",
      risk: "medium",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/code-studio", label: "Code Studio" }],
  navigation: [{ group: "build", label: "Code Studio", order: 10 }],

  boot: async (ctx) => {
    try {
      const { seedCodeDb } = await import("./seed");
      await seedCodeDb();
    } catch (err: any) {
      ctx.log("warn", `seed skipped — ${err?.message ?? err}`);
    }
  },

  postListen: async (ctx) => {
    try {
      const { syncProviderKeysToOpenCode } = await import("./opencode/provider-sync");
      const result = await syncProviderKeysToOpenCode();
      if (result.synced.length > 0) {
        ctx.log("info", `Synced provider keys: ${result.synced.join(", ")}`);
      }
      if (result.errors.length > 0) {
        ctx.log("warn", `Sync errors: ${result.errors.join(", ")}`);
      }
    } catch {
      /* non-fatal */
    }
  },

  health: async () => {
    const { getCodeDb } = await import("./connection");
    return dbPingHealth("CODEDB", getCodeDb);
  },

  publicApi: { path: "server/code-studio/public-api.ts" },
  events: { emits: ["codeStudio.run.completed", "codeStudio.run.failed"] },
  handoffs: { accepts: ["codeStudio.run.requested"], produces: [] },
  ports: { provided: ["codeStudio.run"], consumed: [] },
  communication: { modes: ["gateway", "handoff", "event", "coordinator"] },
};
