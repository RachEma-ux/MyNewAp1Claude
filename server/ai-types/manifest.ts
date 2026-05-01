/**
 * AI Types Module Manifest
 *
 * AI Types is platform-core: it is the canonical catalog. It is registered
 * as a module so the registry tracks it, but its DB is the platform `appdb`
 * (catalog tables) — not a module-owned DB.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { aiTypesRouter } from "./router";
import { okHealth } from "../platform/modules/health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";

export const aiTypesManifest: ModuleManifest = {
  key: "aiTypes",
  name: "AI Types — Catalog",
  version: "1.0.0",

  runtime: { mode: "shared", required: true },

  database: {
    kind: "shared",
    schema: "appdb",
    ownedTables: ["catalog_entries", "ai_type_models", "ai_type_llms"],
  },

  router: aiTypesRouter,
  routerKey: "aiTypes",

  permissions: { keys: ["aiTypes.read", "aiTypes.write", "aiTypes.publish"] },

  governanceActions: [
    {
      key: "aiTypes.catalog.publish",
      description: "Publish a catalog entry",
      risk: "high",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/ai-types", label: "AI Types" }],
  navigation: [{ group: "infrastructure", label: "AI Types", order: 10 }],

  boot: async () => {
    registerModuleHealthAction(aiTypesManifest);
    const { bootAiTypesModule } = await import("./boot");
    bootAiTypesModule();
  },

  health: async () => okHealth("AI Types ready"),

  publicApi: { path: "server/ai-types/public-api.ts" },
  events: { emits: ["aiTypes.catalog.published", "aiTypes.catalog.deprecated"] },
  ports: { provided: ["aiTypes.catalog"], consumed: [] },
  communication: { modes: ["port", "event"] },
};
