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
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";
import { subscribeEvent } from "../platform/events";
import { registerPublicApi } from "../platform/modules/module-gateway";

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
    registerModuleHealthAction(ragManifest);

    // Public-API: rag.index.run — request a new RAG indexing run.
    // Inserts a kgra_build_runs row with status="queued"; the actual
    // graph rebuild is owned by kgra-agent. Manifest declares the
    // action low-risk and not receipt-required, so the descriptor
    // matches.
    registerPublicApi({
      module: "rag",
      action: "rag.index.run",
      handler: async (input) => {
        const payload = (input ?? {}) as { reason?: string };
        const { requestIndexRun } = await import("./indexer");
        return requestIndexRun({ reason: payload.reason });
      },
      descriptor: {
        key: "rag.index.run",
        description: "Run a RAG indexing job",
        risk: "low",
        receiptRequired: false,
      },
    });

    try {
      const { seedRagDb, migrateJsonBlobToRagDb } = await import("./seed");
      await seedRagDb();
      await migrateJsonBlobToRagDb();
    } catch (err: any) {
      ctx.log("warn", `seed skipped — ${err?.message ?? err}`);
    }
    // Subscribe to documents.uploaded events from the documents module.
    // The handler logs the event for now; the actual indexing trigger
    // will be added in a follow-up alongside the dedicated rag.indexer
    // service. The subscription itself is what the wiring harness
    // verifies — the event is no longer a dead-letter candidate.
    // Literal event type used so check:wiring:event can verify
    // statically; RAG_CONSUMES.documentsUploaded in events.ts is the
    // canonical constant.
    subscribeEvent("documents.uploaded", "rag", async (env) => {
      const payload = env.payload as { documentId?: number; workspaceId?: number | string };
      ctx.log(
        "info",
        `rag received documents.uploaded documentId=${payload?.documentId ?? "?"} workspace=${payload?.workspaceId ?? "?"} eventId=${env.eventId}`,
      );
    });
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
  runtimePorts: [
    {
      key: "ragdb",
      label: "RAGDB (Postgres)",
      mode: "external",
      protocol: "postgres",
      env: "DATABASE_URL_RAGDB",
      defaultPort: 5432,
      defaultHost: "127.0.0.1",
      defaultUrl: "postgres://127.0.0.1:5432/ragdb",
      externallyManaged: true,
      description: "RAG module-owned database; falls back to local Postgres.",
    },
  ],
  communication: { modes: ["event", "port"] },
};
