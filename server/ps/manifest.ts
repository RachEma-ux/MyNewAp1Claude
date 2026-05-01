/**
 * PS — Projects System Module Manifest
 *
 * Currently shares the platform DB; planned to migrate to a dedicated psdb.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { psRouter } from "./ps.router";
import { okHealth } from "../platform/modules/health";

export const psManifest: ModuleManifest = {
  key: "ps",
  name: "PS — Projects System",
  version: "1.0.0",

  runtime: { mode: "embedded", required: false },

  database: {
    kind: "shared",
    schema: "appdb",
    ownedTables: ["ps_*", "ps_ideation_*", "ps_translator_*"],
  },

  router: psRouter,
  routerKey: "ps",

  permissions: { keys: ["ps.read", "ps.write", "ps.publish"] },

  governanceActions: [
    {
      key: "ps.ideation.publish",
      description: "Publish a PS ideation run",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "ps.handoff.pmCentral",
      description: "Hand off a project from PS to PM Central",
      risk: "medium",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/projects", label: "Projects" }],
  navigation: [{ group: "delivery", label: "Projects", order: 10 }],

  health: async () => okHealth("PS ready"),

  publicApi: { path: "server/ps/public-api.ts" },
  events: { emits: ["ps.ideation.completed", "ps.handoff.submitted"] },
  handoffs: { produces: ["ps.pmCentral"], accepts: [] },
  ports: { provided: ["ps.read"], consumed: ["aiTypes.catalog"] },
  communication: { modes: ["port", "handoff", "event"] },
};
