/**
 * PSM Module Manifest
 */

import type { ModuleManifest } from "../platform/modules/types";
import { psmRouter } from "./psm.router";
import { dbPingHealth } from "../platform/modules/health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";

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
    registerModuleHealthAction(psmManifest);
    try {
      const { seedPsmDb } = await import("./seed");
      await seedPsmDb();
    } catch (err: any) {
      ctx.log("warn", `seed skipped — ${err?.message ?? err}`);
    }
    const { registerPublicApi } = await import("../platform/modules/module-gateway");
    registerPublicApi({
      module: "psm",
      action: "psm.method.publish",
      handler: async (input) => {
        const { packId, reason } = input as { packId: number; reason?: string };
        const { publishContentPack } = await import("./psm.service");
        return publishContentPack(packId, undefined, reason);
      },
      descriptor: {
        key: "psm.method.publish",
        description: "Publish a PSM method to the catalog",
        risk: "medium",
        receiptRequired: true,
      },
    });
  },

  health: async () => {
    const { getPsmDb } = await import("./connection");
    return dbPingHealth("PSMDB", getPsmDb);
  },

  publicApi: { path: "server/psm/public-api.ts" },
  events: { emits: ["psm.method.published"] },
  handoffs: { accepts: [], produces: [] },
  ports: { provided: ["psm.read", "psm.search"], consumed: ["aiTypes.catalog"] },
  runtimePorts: [
    {
      key: "psmdb",
      label: "PSMDB (Postgres)",
      mode: "external",
      protocol: "postgres",
      env: "DATABASE_URL_PSMDB",
      defaultPort: 5432,
      defaultHost: "127.0.0.1",
      defaultUrl: "postgres://127.0.0.1:5432/psmdb",
      externallyManaged: true,
      description: "PSM module-owned database; falls back to local Postgres.",
    },
  ],
  communication: { modes: ["port", "gateway", "event"] },
};
