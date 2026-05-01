/**
 * KGRA Agent Module Manifest
 *
 * Exposes the kgraAgent.* tRPC router. The actual DB (ragdb) is owned by
 * the rag manifest.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { kgraAgentRouter } from "./router";
import { okHealth } from "../platform/modules/health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";

export const kgraAgentManifest: ModuleManifest = {
  key: "kgraAgent",
  name: "KGRA — Knowledge Graph Reasoning Agent",
  version: "1.0.0",

  runtime: { mode: "worker", required: false, dependsOn: ["rag"] },

  database: { kind: "shared", schema: "ragdb-via-rag" },

  router: kgraAgentRouter,
  routerKey: "kgraAgent",

  permissions: { keys: ["kgra.read", "kgra.run"] },

  governanceActions: [
    {
      key: "kgra.run.execute",
      description: "Run a KGRA query",
      risk: "low",
      receiptRequired: false,
    },
  ],

  routes: [{ path: "/kgra", label: "KGRA" }],
  navigation: [{ group: "knowledge", label: "KGRA", order: 32 }],

  health: async () => okHealth("KGRA ready"),

  publicApi: { path: "server/kgra-agent/public-api.ts" },
  events: { emits: ["kgra.run.completed"] },
  ports: { provided: ["kgra.run"], consumed: ["rag.search"] },
  communication: { modes: ["port", "event"] },
  boot: async () => {
    registerModuleHealthAction(kgraAgentManifest);
  },
};
