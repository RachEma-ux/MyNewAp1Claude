/**
 * PSM Module Manifest
 */

import type { ModuleManifest } from "../platform/modules/types";
import { psmRouter } from "./psm.router";
import { dbPingHealth } from "../platform/modules/health";

export const psmManifest: ModuleManifest = {
  key: "psm",
  name: "PSM — Problem Solving Methods",
  version: "1.0.0",

  runtime: { mode: "embedded", required: false },

  database: {
    kind: "owned",
    key: "psmdb",
    connect: async () => {
      const { getPsmDb } = await import("./connection");
      return getPsmDb();
    },
  },

  router: psmRouter,
  routerKey: "psm",

  permissions: { keys: ["psm.read", "psm.write", "psm.publish"] },

  governanceActions: [
    {
      key: "psm.method.publish",
      description: "Publish a PSM method to the catalog",
      risk: "medium",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/psm", label: "PSM" }],
  navigation: [{ group: "knowledge", label: "PSM", order: 31 }],

  boot: async (ctx) => {
    try {
      const { seedPsmDb } = await import("./seed");
      await seedPsmDb();
    } catch (err: any) {
      ctx.log("warn", `seed skipped — ${err?.message ?? err}`);
    }
  },

  health: async () => {
    const { getPsmDb } = await import("./connection");
    return dbPingHealth("PSMDB", getPsmDb);
  },

  publicApi: { path: "server/psm/public-api.ts" },
  events: { emits: ["psm.method.published"] },
  handoffs: { accepts: [], produces: [] },
  ports: { provided: ["psm.read", "psm.search"], consumed: ["aiTypes.catalog"] },
  communication: { modes: ["port", "gateway", "event"] },
};
