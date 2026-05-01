/**
 * PRM Module Manifest
 *
 * Mounts the PRM tRPC router, declares prmdb ownership, and seeds the
 * database on boot.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { prmRouter } from "./prm.router";
import { dbPingHealth } from "../platform/modules/health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";
import { registerPublicApi } from "../platform/modules/module-gateway";

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
    registerModuleHealthAction(prmManifest);

    // Public-API: list PRM method-template metadata. Read-only,
    // module-owned, no DB access — pure catalog metadata. Routed
    // through the gateway so other modules respect the boundary.
    registerPublicApi({
      module: "prm",
      action: "prm.methods.listTemplates",
      handler: async () => {
        const { METHOD_CATALOG } = await import("./prm.methods");
        return METHOD_CATALOG.map((t) => ({
          methodType: t.methodType,
          category: t.category,
          name: t.name,
          description: t.description,
        }));
      },
    });

    // Publish a method template — flips published=true on the
    // prm_method_templates row. Receipt required (manifest declares it).
    registerPublicApi({
      module: "prm",
      action: "prm.method.publish",
      handler: async (input) => {
        const payload = input as { templateId?: number };
        if (typeof payload?.templateId !== "number") {
          throw new Error("templateId is required");
        }
        const { publishMethodTemplate } = await import("./prm.catalog");
        return publishMethodTemplate(payload.templateId);
      },
      descriptor: {
        key: "prm.method.publish",
        description: "Publish a PRM method to the catalog",
        risk: "medium",
        receiptRequired: true,
      },
    });

    // Deprecate a method template — flips published=false.
    registerPublicApi({
      module: "prm",
      action: "prm.method.deprecate",
      handler: async (input) => {
        const payload = input as { templateId?: number };
        if (typeof payload?.templateId !== "number") {
          throw new Error("templateId is required");
        }
        const { deprecateMethodTemplate } = await import("./prm.catalog");
        return deprecateMethodTemplate(payload.templateId);
      },
      descriptor: {
        key: "prm.method.deprecate",
        description: "Deprecate a PRM method",
        risk: "medium",
        receiptRequired: true,
      },
    });

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
