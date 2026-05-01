/**
 * OpenRouter Module Manifest
 */

import type { ModuleManifest } from "../platform/modules/types";
import { openRouterRouter } from "./router";
import { okHealth } from "../platform/modules/health";

export const openRouterManifest: ModuleManifest = {
  key: "openRouter",
  name: "OpenRouter — Unified Model Gateway",
  version: "1.0.0",

  runtime: { mode: "embedded", required: false },

  database: { kind: "shared", schema: "appdb", ownedTables: ["openrouter_*"] },

  router: openRouterRouter,
  routerKey: "openRouter",

  permissions: { keys: ["openRouter.read", "openRouter.write"] },

  governanceActions: [
    {
      key: "openRouter.config.update",
      description: "Update OpenRouter routing configuration",
      risk: "high",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/openrouter", label: "OpenRouter" }],
  navigation: [{ group: "infrastructure", label: "OpenRouter", order: 20 }],

  health: async () => okHealth("OpenRouter ready"),

  publicApi: { path: "server/openrouter/public-api.ts" },
  events: { emits: ["openRouter.routing.config.updated"] },
  ports: { provided: ["openRouter.route"], consumed: [] },
  communication: { modes: ["port", "gateway", "event"] },
};
