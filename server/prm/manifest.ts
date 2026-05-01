/**
 * PRM Module Manifest
 *
 * Mounts the PRM tRPC router, declares prmdb ownership, and seeds the
 * database on boot.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { prmRouter } from "./prm.router";
import { dbPingHealth } from "../platform/modules/health";

export const prmManifest: ModuleManifest = {
  key: "prm",
  name: "PRM — Problem Resolution Methods",
  version: "1.0.0",

  runtime: {
    mode: "embedded",
    required: false,
  },

  database: {
    kind: "owned",
    key: "prmdb",
    connect: async () => {
      const { getPrmDb } = await import("./connection");
      return getPrmDb();
    },
  },

  router: prmRouter,
  routerKey: "prm",

  permissions: {
    keys: ["prm.read", "prm.write", "prm.publish"],
  },

  governanceActions: [
    {
      key: "prm.method.publish",
      description: "Publish a PRM method to the catalog",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "prm.method.deprecate",
      description: "Deprecate a PRM method",
      risk: "medium",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/prm", label: "PRM" }],
  navigation: [{ group: "knowledge", label: "PRM", order: 30 }],

  boot: async (ctx) => {
    try {
      const { seedPrmDb } = await import("./seed");
      await seedPrmDb();
    } catch (err: any) {
      ctx.log("warn", `seed skipped — ${err?.message ?? err}`);
    }
  },

  health: async () => {
    const { getPrmDb } = await import("./connection");
    return dbPingHealth("PRMDB", getPrmDb);
  },

  publicApi: { path: "server/prm/public-api.ts" },
  events: { emits: ["prm.method.published", "prm.method.deprecated"] },
  handoffs: { accepts: [], produces: [] },
  ports: { provided: ["prm.read", "prm.search"], consumed: ["aiTypes.catalog"] },
  communication: { modes: ["port", "gateway", "event"] },
};
