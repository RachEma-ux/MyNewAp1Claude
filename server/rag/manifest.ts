/**
 * RAG Module Manifest
 *
 * Runtime: worker — owns ragdb, indexer pipelines.
 *
 * Note: the KGRA agent has its own manifest (server/kgra-agent/manifest.ts)
 * because it exposes a tRPC router. This RAG manifest covers the
 * persistence + indexing layer.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { dbPingHealth } from "../platform/modules/health";

export const ragManifest: ModuleManifest = {
  key: "rag",
  name: "RAG / Knowledge Graph",
  version: "1.0.0",

  runtime: { mode: "worker", required: false },

  database: {
    kind: "owned",
    key: "ragdb",
    connect: async () => {
      const { getRagDb } = await import("./connection");
      return getRagDb();
    },
  },

  // No tRPC router — exposed via the kgra-agent manifest + Express routes.

  permissions: { keys: ["rag.read", "rag.write", "rag.index"] },

  governanceActions: [
    {
      key: "rag.index.run",
      description: "Run a RAG indexing job",
      risk: "low",
      receiptRequired: false,
    },
  ],

  boot: async (ctx) => {
    try {
      const { seedRagDb, migrateJsonBlobToRagDb } = await import("./seed");
      await seedRagDb();
      await migrateJsonBlobToRagDb();
    } catch (err: any) {
      ctx.log("warn", `seed skipped — ${err?.message ?? err}`);
    }
  },

  health: async () => {
    const { getRagDb } = await import("./connection");
    return dbPingHealth("RAGDB", getRagDb);
  },

  publicApi: { path: "server/rag/public-api.ts" },
  events: {
    emits: ["rag.index.started", "rag.index.completed", "rag.index.failed"],
    consumes: ["documents.uploaded"],
  },
  handoffs: { accepts: [], produces: [] },
  ports: { provided: ["rag.search", "rag.stats"], consumed: [] },
  communication: { modes: ["event", "port"] },
};
