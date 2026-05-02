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
import { DATA_ACQUISITION_EVENT_NAMES } from "./data-acquisition/dataAcquisition.events";
import { DATA_ACQUISITION_OWNED_TABLES } from "./data-acquisition/dataAcquisition.constants";

export const dataAnalysisManifest: ModuleManifest = {
  key: "dataAnalysis",
  name: "Data Analysis",
  version: "1.0.0",

  runtime: { mode: "embedded", required: false },

  database: {
    // Phase-1 staged ownership — physical tables live in the shared
    // platform DB; Data Analysis is the canonical declared owner of
    // both GraphRAG and Data Acquisition tables.
    kind: "shared",
    schema: "public",
    ownedTables: [
      "graphrag_sources",
      "graphrag_sync_runs",
      "graphrag_index_runs",
      "graphrag_query_runs",
      "graphrag_artifact_registry",
      ...DATA_ACQUISITION_OWNED_TABLES,
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
      "dataAnalysis.dataAcquisition.read",
      "dataAnalysis.dataAcquisition.write",
      "dataAnalysis.dataAcquisition.admin",
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

    /* ── Data Acquisition subdomain (universal acquisition layer) ─────── */
    {
      key: "dataAnalysis.dataAcquisition.registerSource",
      description:
        "Register a Data Acquisition source (any type: document, sensor, stream, api, database, saas, web, git, manual_form, webhook, media, object_storage).",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "dataAnalysis.dataAcquisition.updateSource",
      description: "Update an existing Data Acquisition source.",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "dataAnalysis.dataAcquisition.disableSource",
      description: "Disable a Data Acquisition source.",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "dataAnalysis.dataAcquisition.runAcquisition",
      description:
        "Trigger an acquisition run for a source — discovers and acquires items via the source's connector.",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "dataAnalysis.dataAcquisition.classifyItem",
      description:
        "Classify a discovered item — picks data type, complexity, and recommended processor.",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "dataAnalysis.dataAcquisition.routeItem",
      description:
        "Route an item to a processing pipeline + processor + fallback chain.",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "dataAnalysis.dataAcquisition.runProcessing",
      description:
        "Run a processing pipeline against an item (parser, normalizer, CDC sync, etc.). Calls external worker.",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "dataAnalysis.dataAcquisition.runOutputPipeline",
      description:
        "Emit a canonical record into an output pipeline (rag/graphrag/analytics/warehouse/alerts/reports/markdown/html/pdf).",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "dataAnalysis.dataAcquisition.exportCanonicalRecord",
      description: "Export a canonical record outside the platform.",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "dataAnalysis.dataAcquisition.document.runParser",
      description:
        "Run the document-intelligence parser pipeline (Document Intelligence is one specialized pipeline inside Data Acquisition).",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "dataAnalysis.dataAcquisition.document.validate",
      description:
        "Validate a parsed document and write a canonical document record.",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "dataAnalysis.dataAcquisition.document.runOutputPipeline",
      description:
        "Run an output pipeline for a canonical document record.",
      risk: "medium",
      receiptRequired: true,
    },
  ],

  routes: [
    { path: "/data-analysis", label: "Data Analysis" },
    { path: "/data-analysis/graphrag", label: "GraphRAG (OmniGraph)" },
    {
      path: "/data-analysis/data-acquisition",
      label: "Data Acquisition",
    },
    {
      path: "/data-analysis/data-acquisition/sources",
      label: "Sources",
    },
    {
      path: "/data-analysis/data-acquisition/runs",
      label: "Runs",
    },
    {
      path: "/data-analysis/data-acquisition/items",
      label: "Items",
    },
    {
      path: "/data-analysis/data-acquisition/classification",
      label: "Classification",
    },
    {
      path: "/data-analysis/data-acquisition/routing",
      label: "Routing",
    },
    {
      path: "/data-analysis/data-acquisition/processing",
      label: "Processing",
    },
    {
      path: "/data-analysis/data-acquisition/document-intelligence",
      label: "Document Intelligence",
    },
    {
      path: "/data-analysis/data-acquisition/canonical-records",
      label: "Canonical Records",
    },
    {
      path: "/data-analysis/data-acquisition/outputs",
      label: "Outputs",
    },
    {
      path: "/data-analysis/data-acquisition/settings",
      label: "Settings",
    },
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

    // ── Public API: Data Acquisition subdomain ──────────────────────
    // Universal acquisition layer — all source types, all data types.
    // Document Intelligence is one specialized pipeline, exposed via
    // `dataAnalysis.dataAcquisition.document.*`.

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.workerStatus",
      handler: async () => {
        const { getDataAcquisitionWorkerStatus } = await import(
          "./data-acquisition/dataAcquisition.worker"
        );
        return getDataAcquisitionWorkerStatus();
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.summary",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.summary((input ?? {}) as any);
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.updateSource",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.updateSource(input as any);
      },
      descriptor: {
        key: "dataAnalysis.dataAcquisition.updateSource",
        description: "Update a Data Acquisition source.",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.disableSource",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.disableSource(input as any);
      },
      descriptor: {
        key: "dataAnalysis.dataAcquisition.disableSource",
        description: "Disable a Data Acquisition source.",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.exportCanonicalRecord",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        const payload = (input ?? {}) as {
          id: number;
          workspaceId: number;
          targetRef?: string;
        };
        // Export = run an output pipeline of type "markdown" against
        // the canonical record. The output run is the audit trail.
        return service.runOutputPipeline({
          workspaceId: payload.workspaceId,
          outputType: "markdown",
          canonicalRecordId: payload.id,
          targetRef: payload.targetRef,
        });
      },
      descriptor: {
        key: "dataAnalysis.dataAcquisition.exportCanonicalRecord",
        description: "Export a canonical record outside the platform.",
        risk: "medium",
        receiptRequired: true,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.document.runOutputPipeline",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.runOutputPipeline(input as any);
      },
      descriptor: {
        key: "dataAnalysis.dataAcquisition.document.runOutputPipeline",
        description: "Run an output pipeline for a canonical document record.",
        risk: "medium",
        receiptRequired: true,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.registerSource",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.registerSource(input as any);
      },
      descriptor: {
        key: "dataAnalysis.dataAcquisition.registerSource",
        description: "Register a Data Acquisition source.",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.runAcquisition",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.runAcquisition(input as any);
      },
      descriptor: {
        key: "dataAnalysis.dataAcquisition.runAcquisition",
        description: "Trigger an acquisition run for a source.",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.discoverItems",
      handler: async (input) => {
        const payload = (input ?? {}) as {
          sourceId: number;
          workspaceId: number;
          path?: string;
        };
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.runAcquisition({
          sourceId: payload.sourceId,
          workspaceId: payload.workspaceId,
          runType: "discover",
          path: payload.path,
        });
      },
      descriptor: {
        key: "dataAnalysis.dataAcquisition.runAcquisition",
        description: "Discover items via the source's connector.",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.classifyItem",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.classifyItem(input as any);
      },
      descriptor: {
        key: "dataAnalysis.dataAcquisition.classifyItem",
        description: "Classify a discovered item.",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.routeItem",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.routeItem(input as any);
      },
      descriptor: {
        key: "dataAnalysis.dataAcquisition.routeItem",
        description: "Route an item to a pipeline + processor + fallback chain.",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.runProcessing",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.runProcessing(input as any);
      },
      descriptor: {
        key: "dataAnalysis.dataAcquisition.runProcessing",
        description:
          "Run a processing pipeline against an item. Calls external worker — missing worker is recorded as a failed run.",
        risk: "medium",
        receiptRequired: true,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.runOutputPipeline",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.runOutputPipeline(input as any);
      },
      descriptor: {
        key: "dataAnalysis.dataAcquisition.runOutputPipeline",
        description:
          "Emit a canonical record into an output pipeline (rag/graphrag/analytics/warehouse/alerts/reports/markdown/html/pdf).",
        risk: "medium",
        receiptRequired: true,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.getCanonicalRecord",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.getCanonicalRecord(input as any);
      },
    });

    /* Document-specific actions. */
    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.document.classify",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.classifyDocumentItem(input as any);
      },
      descriptor: {
        key: "dataAnalysis.dataAcquisition.classifyItem",
        description: "Classify an item as a document.",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.document.routeParser",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.routeParserForItem(input as any);
      },
      descriptor: {
        key: "dataAnalysis.dataAcquisition.routeItem",
        description: "Route a document item to a parser + fallback chain.",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.document.runParser",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.runParser(input as any);
      },
      descriptor: {
        key: "dataAnalysis.dataAcquisition.document.runParser",
        description: "Run the document parser pipeline (Document Intelligence).",
        risk: "medium",
        receiptRequired: true,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.document.validate",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.validateDocument(input as any);
      },
      descriptor: {
        key: "dataAnalysis.dataAcquisition.document.validate",
        description: "Validate a parsed document and write a canonical record.",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "dataAnalysis",
      action: "dataAnalysis.dataAcquisition.document.getCanonical",
      handler: async (input) => {
        const service = await import("./data-acquisition/dataAcquisition.service");
        return service.getCanonicalDocument(input as any);
      },
    });

    ctx.log(
      "info",
      "Data Analysis manifest booted (GraphRAG + Data Acquisition subdomains)",
    );
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
      // Data Acquisition subdomain
      "dataAnalysis.dataAcquisition.sourceRegistered",
      "dataAnalysis.dataAcquisition.acquisitionStarted",
      "dataAnalysis.dataAcquisition.acquisitionCompleted",
      "dataAnalysis.dataAcquisition.acquisitionFailed",
      "dataAnalysis.dataAcquisition.itemDiscovered",
      "dataAnalysis.dataAcquisition.itemClassified",
      "dataAnalysis.dataAcquisition.itemRouted",
      "dataAnalysis.dataAcquisition.processingStarted",
      "dataAnalysis.dataAcquisition.processingCompleted",
      "dataAnalysis.dataAcquisition.processingFailed",
      "dataAnalysis.dataAcquisition.canonicalRecordCreated",
      "dataAnalysis.dataAcquisition.qualityValidated",
      "dataAnalysis.dataAcquisition.outputPipelineStarted",
      "dataAnalysis.dataAcquisition.outputPipelineCompleted",
      "dataAnalysis.dataAcquisition.outputPipelineFailed",
      "dataAnalysis.dataAcquisition.workerUnavailable",
      "dataAnalysis.dataAcquisition.workerRecovered",
      "dataAnalysis.dataAcquisition.document.parserSelected",
      "dataAnalysis.dataAcquisition.document.parserFallbackTriggered",
      "dataAnalysis.dataAcquisition.document.reconstructed",
      "dataAnalysis.dataAcquisition.document.validated",
    ],
  },

  handoffs: {
    accepts: [],
    produces: [],
  },

  ports: {
    provided: [
      "dataAnalysis.read",
      "dataAnalysis.graphRag.read",
      "dataAnalysis.dataAcquisition.read",
    ],
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
  DATA_ACQUISITION_EVENT_NAMES,
  DATA_ACQUISITION_OWNED_TABLES,
};
