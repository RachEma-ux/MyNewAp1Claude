/**
 * Organization Management (OM) Module Manifest
 */

import type { ModuleManifest } from "../platform/modules/types";
import { organizationManagementRouter } from "./router";
import { okHealth } from "../platform/modules/health";

export const omManifest: ModuleManifest = {
  key: "organizationManagement",
  name: "Organization Management",
  version: "1.0.0",

  runtime: { mode: "shared", required: false },

  database: { kind: "shared", schema: "appdb", ownedTables: ["om_*"] },

  router: organizationManagementRouter,
  routerKey: "organizationManagement",

  permissions: { keys: ["om.read", "om.write"] },

  governanceActions: [
    {
      key: "om.entity.create",
      description: "Create an OM entity",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "om.position.assign",
      description: "Assign a position",
      risk: "medium",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/organization", label: "Organization" }],
  navigation: [{ group: "people", label: "Organization", order: 11 }],

  boot: async (ctx) => {
    try {
      const { seedOmTemplates } = await import("./seed-templates");
      const result = await seedOmTemplates();
      if (result.created > 0) {
        ctx.log("info", `seeded ${result.created} new templates (${result.skipped} existing)`);
      }
    } catch (err: any) {
      ctx.log("warn", `seed skipped — ${err?.message ?? err}`);
    }
  },

  health: async () => okHealth("OM ready"),

  publicApi: { path: "server/organization-management/public-api.ts" },
  events: { emits: ["om.entity.created", "om.assignment.changed"] },
  ports: { provided: ["om.read"], consumed: [] },
  communication: { modes: ["port", "gateway", "event"] },
};
