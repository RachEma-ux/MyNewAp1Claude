/**
 * Data Analysis — Module Manifest
 *
 * Registered top-level RTLM module. Canonical owner of the **GraphRAG**
 * subdomain (sources, sync runs, index runs, query runs, artifact
 * registry) and the GraphRAG worker contract.
 *
 * Important architectural rules:
 *   - GraphRAG is a *subdomain inside Data Analysis*, NOT its own RTLM.
 *   - KGRA Agent consumes GraphRAG outputs via this module's gateway
 *     surface; KGRA Agent does NOT own GraphRAG storage.
 *   - The GraphRAG worker (Python service on `:8484`) is a runtime
 *     dependency, not a hard requirement — missing worker keeps the
 *     module in `degraded` state and the UI renders a clean banner.
 *   - DB ownership is Phase-1 staged: Data Analysis declares
 *     `kind: "shared"` over the platform DB and lists the canonical
 *     `graphrag_*` tables as `ownedTables`. The physical move to a
 *     dedicated `dataanalysisdb` is tracked under
 *     "Data Analysis RTLM hardening: GraphRAG subdomain ownership,
 *     DB ownership, worker contract, and Digital HQ/AWI visibility".
 */

import type { ModuleManifest } from "../platform/modules/types";
import { dataAnalysisRouter } from "./router";
import { dataAnalysisHealth } from "./data-analysis.health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";
import { registerPublicApi } from "../platform/modules/module-gateway";
import { DATA_ANALYSIS_EVENT_NAMES } from "./events";
import {
  DATA_ANALYSIS_PROVIDED_PORTS,
  DATA_ANALYSIS_RUNTIME_ENDPOINTS,
} from "./ports";

export const dataAnalysisManifest: ModuleManifest = {
  key: "dataAnalysis",
  name: "Data Analysis",
  version: "1.0.0",

  runtime: { mode: "embedded", required: false },

  database: {
    // Phase-1 staged ownership — physical tables live in the shared
    // platform DB; Data Analysis is the canonical declared owner.
    kind: "shared",
    schema: "public",
    ownedTables: [
      "graphrag_sources",
      "graphrag_sync_runs",
      "graphrag_index_runs",
      "graphrag_query_runs",
      "graphrag_artifact_registry",
    ],
  },

  router: dataAnalysisRouter,
  routerKey: "dataAnalysis",

  permissions: {
    keys: [
      "dataAnalysis.read",
      "dataAnalysis.graphRag.read",
      "dataAnalysis.graphRag.write",
      "dataAnalysis.graphRag.admin",
    ],
  },

  governanceActions: [
    {
      key: "dataAnalysis.graphRag.registerSource",
      description: "Register a GraphRAG source adapter (creates DB row).",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "dataAnalysis.graphRag.syncSource",
      description:
        "Sync a GraphRAG source: export documents from adapter and persist a snapshot.",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "dataAnalysis.graphRag.buildIndex",
      description:
        "Build a GraphRAG index from a synced snapshot (calls external Python worker).",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "dataAnalysis.graphRag.query",
      description:
        "Execute a GraphRAG query against an indexed dataset (calls external Python worker).",
      risk: "low",
      receiptRequired: false,
    },
  ],

  routes: [
    { path: "/data-analysis", label: "Data Analysis" },
    { path: "/data-analysis/graphrag", label: "GraphRAG (OmniGraph)" },
  ],
  navigation: [{ group: "dataAnalysis", label: "Data Analysis", order: 5 }],

  boot: async (ctx) => {
    registerModuleHealthAction(dataAnalysisManifest);

    // ── Public API: GraphRAG subdomain ──────────────────────────────
    // Each handler delegates to the existing service layer — no
    // governance bypass, no direct worker calls, no fake success.

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.graphRag.workerStatus",
      handler: async () => {
        const { getGraphRagWorkerStatus } = await import(
          "./graphrag/graphRag.worker"
        );
        return getGraphRagWorkerStatus();
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.graphRag.listSources",
      handler: async () => {
        const service = await import("./graphrag/service");
        return service.listSources();
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.graphRag.listSyncRuns",
      handler: async (input) => {
        const payload = (input ?? {}) as { sourceId?: number };
        const service = await import("./graphrag/service");
        return service.listSyncRuns(payload.sourceId);
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.graphRag.listIndexRuns",
      handler: async (input) => {
        const payload = (input ?? {}) as { sourceId?: number };
        const service = await import("./graphrag/service");
        return service.listIndexRuns(payload.sourceId);
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.graphRag.listQueryRuns",
      handler: async (input) => {
        const payload = (input ?? {}) as { sourceId?: number };
        const service = await import("./graphrag/service");
        return service.listQueryRuns(payload.sourceId);
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.graphRag.registerSource",
      handler: async (input) => {
        const payload = (input ?? {}) as {
          moduleSlug?: string;
          datasetKey?: string;
        };
        if (!payload.moduleSlug || !payload.datasetKey) {
          throw new Error("moduleSlug and datasetKey are required");
        }
        const { getSourceAdapter } = await import(
          "./graphrag/source-registry"
        );
        const adapter = getSourceAdapter(payload.moduleSlug, payload.datasetKey);
        if (!adapter) {
          throw new Error(
            `No adapter registered for ${payload.moduleSlug}:${payload.datasetKey}`,
          );
        }
        const service = await import("./graphrag/service");
        return service.registerSource(adapter);
      },
      descriptor: {
        key: "dataAnalysis.graphRag.registerSource",
        description: "Register a GraphRAG source adapter (creates DB row).",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.graphRag.syncSource",
      handler: async (input) => {
        const payload = (input ?? {}) as { sourceId?: number };
        if (typeof payload.sourceId !== "number") {
          throw new Error("sourceId is required");
        }
        const service = await import("./graphrag/service");
        return service.syncSource(payload.sourceId);
      },
      descriptor: {
        key: "dataAnalysis.graphRag.syncSource",
        description:
          "Sync a GraphRAG source: export documents from adapter and persist a snapshot.",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.graphRag.buildIndex",
      handler: async (input) => {
        const payload = (input ?? {}) as {
          sourceId?: number;
          syncRunId?: number;
        };
        if (typeof payload.sourceId !== "number") {
          throw new Error("sourceId is required");
        }
        const service = await import("./graphrag/service");
        return service.buildIndex(payload.sourceId, payload.syncRunId);
      },
      descriptor: {
        key: "dataAnalysis.graphRag.buildIndex",
        description:
          "Build a GraphRAG index from a synced snapshot (calls external Python worker).",
        risk: "medium",
        receiptRequired: true,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.graphRag.query",
      handler: async (input) => {
        const payload = (input ?? {}) as {
          moduleSlug?: string;
          datasetKey?: string;
          method?: string;
          question?: string;
          runId?: number;
        };
        if (
          !payload.moduleSlug ||
          !payload.datasetKey ||
          !payload.method ||
          !payload.question
        ) {
          throw new Error(
            "moduleSlug, datasetKey, method, question are required",
          );
        }
        const service = await import("./graphrag/service");
        return service.query({
          moduleSlug: payload.moduleSlug,
          datasetKey: payload.datasetKey,
          method: payload.method as any,
          question: payload.question,
          runId: payload.runId,
        });
      },
      descriptor: {
        key: "dataAnalysis.graphRag.query",
        description:
          "Execute a GraphRAG query against an indexed dataset (calls external Python worker).",
        risk: "low",
        receiptRequired: false,
      },
    });

    ctx.log("info", "Data Analysis manifest booted (GraphRAG subdomain owner)");
  },

  health: dataAnalysisHealth,

  publicApi: { path: "server/data-analysis/public-api.ts" },

  events: {
    emits: [
      "dataAnalysis.graphRag.sourceRegistered",
      "dataAnalysis.graphRag.syncStarted",
      "dataAnalysis.graphRag.syncCompleted",
      "dataAnalysis.graphRag.syncFailed",
      "dataAnalysis.graphRag.indexStarted",
      "dataAnalysis.graphRag.indexCompleted",
      "dataAnalysis.graphRag.indexFailed",
      "dataAnalysis.graphRag.queryStarted",
      "dataAnalysis.graphRag.queryCompleted",
      "dataAnalysis.graphRag.queryFailed",
      "dataAnalysis.graphRag.workerUnavailable",
      "dataAnalysis.graphRag.workerRecovered",
    ],
  },

  handoffs: {
    accepts: [],
    produces: [],
  },

  ports: {
    provided: ["dataAnalysis.read", "dataAnalysis.graphRag.read"],
    consumed: [],
  },

  communication: { modes: ["gateway", "event"] },
};

// Re-export literal lists so tests can assert without importing
// implementation files.
export {
  DATA_ANALYSIS_EVENT_NAMES,
  DATA_ANALYSIS_PROVIDED_PORTS,
  DATA_ANALYSIS_RUNTIME_ENDPOINTS,
};
