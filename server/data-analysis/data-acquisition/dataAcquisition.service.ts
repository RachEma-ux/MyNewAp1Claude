/**
 * Data Acquisition service.
 *
 * Orchestrates the universal pipeline:
 *   Source Registry → Universal Intake Gate → Acquisition Run →
 *   Data Type Detection → Acquisition Mode Router → Pipeline →
 *   Validation → Canonical Record → Output Pipelines.
 *
 * Worker boundary rule: when the Data Acquisition worker is
 * unavailable, processing functions record a `failed` row with the
 * error message preserved and emit `processingFailed` — they never
 * throw silently or return a fake success.
 *
 * Coordinator is NOT used here. Cross-module workflows (e.g., feeding
 * a canonical record to GraphRAG) happen via events on the bus, not
 * coordinator calls.
 */

import { makeEnvelope, publishEvent } from "../../platform/events";

import {
  DATA_ACQUISITION_CLASSIFIER_VERSION,
  DATA_ACQUISITION_PIPELINE_VERSION,
  DATA_ACQUISITION_VALIDATION_VERSION,
} from "./dataAcquisition.constants";
import {
  DATA_ACQUISITION_EVENTS,
} from "./dataAcquisition.events";
import { getConnector, listConnectors } from "./connectors/connector.registry";
import { classifyDocument } from "./pipelines/document/documentClassifier";
import { routeParser } from "./pipelines/document/parserRouter";
import { buildCanonicalDocument } from "./pipelines/document/canonicalDocumentModel";
import { validateDocumentOutput } from "./pipelines/document/documentValidation";
import {
  markOutputRunCompleted,
  markOutputRunFailed,
  recordOutputRun,
} from "./pipelines/output/outputRunner";
import {
  disableSourceRow,
  getCanonicalRecord as getCanonicalRecordRow,
  getDocumentSpec,
  getItem,
  getRun,
  getSource,
  insertAudit,
  insertCanonicalRecord,
  insertClassification,
  insertDocumentSpec,
  insertItems,
  insertOutputRun,
  insertProcessingRun,
  insertQuality,
  insertRoute,
  insertRun,
  insertSource,
  listCanonicalRecords as listCanonicalRecordsRow,
  listClassifications as listClassificationsRow,
  listItems as listItemsRow,
  listOutputRuns as listOutputRunsRow,
  listProcessingRuns as listProcessingRunsRow,
  listRoutes as listRoutesRow,
  listRuns as listRunsRow,
  listSources as listSourcesRow,
  summaryCounts,
  updateItemStatus,
  updateProcessingRun,
  updateRunStatus,
  updateSourceRow,
} from "./dataAcquisition.repository";
import { getDataAcquisitionWorkerStatus } from "./dataAcquisition.worker";
import type {
  DataAcquisitionSummary,
} from "./dataAcquisition.contracts";

async function emit(eventType: string, payload: Record<string, unknown>) {
  try {
    await publishEvent(
      makeEnvelope({
        eventType,
        sourceModule: "dataAnalysis",
        payload,
      }),
    );
  } catch {
    /* event-bus failures must not mask real writes */
  }
}

/* ── Sources ──────────────────────────────────────────────────────── */

export async function registerSource(input: {
  workspaceId: number;
  sourceType: string;
  sourceUri: string;
  displayName: string;
  configJson?: Record<string, unknown>;
  createdBy?: number;
}) {
  const row = await insertSource({
    workspaceId: input.workspaceId,
    sourceType: input.sourceType,
    sourceUri: input.sourceUri,
    displayName: input.displayName,
    status: "active",
    configJson: input.configJson,
    createdBy: input.createdBy,
  });
  await insertAudit({
    workspaceId: input.workspaceId,
    sourceId: row.id,
    eventType: "sourceRegistered",
    actorId: input.createdBy,
    message: `Source ${row.displayName} registered (${row.sourceType}).`,
    metadataJson: { sourceUri: row.sourceUri },
  });
  await emit(DATA_ACQUISITION_EVENTS.sourceRegistered, {
    sourceId: row.id,
    workspaceId: row.workspaceId,
    sourceType: row.sourceType,
    sourceUri: row.sourceUri,
  });
  return row;
}

export async function listSources(workspaceId?: number) {
  return listSourcesRow(workspaceId);
}

export async function getSourceById(id: number) {
  const row = await getSource(id);
  if (!row) throw new Error(`Source ${id} not found`);
  return row;
}

export async function updateSource(input: {
  id: number;
  patch: Record<string, unknown>;
}) {
  const row = await updateSourceRow(input.id, input.patch as any);
  if (!row) throw new Error(`Source ${input.id} not found`);
  return row;
}

export async function disableSource(input: { id: number }) {
  const row = await disableSourceRow(input.id);
  if (!row) throw new Error(`Source ${input.id} not found`);
  return row;
}

/* ── Acquisition runs ────────────────────────────────────────────── */

export async function runAcquisition(input: {
  sourceId: number;
  workspaceId: number;
  runType?: string;
  inlineItems?: Array<{
    itemType: string;
    sourceUri: string;
    rawLocation?: string;
    mimeType?: string;
    sizeBytes?: number;
    checksum?: string;
    metadata?: Record<string, unknown>;
  }>;
  createdBy?: number;
  path?: string;
}) {
  const source = await getSource(input.sourceId);
  if (!source) throw new Error(`Source ${input.sourceId} not found`);
  if (source.status === "disabled") {
    throw new Error(`Source ${input.sourceId} is disabled`);
  }
  const runType = input.runType ?? "acquire";

  const run = await insertRun({
    workspaceId: input.workspaceId,
    sourceId: input.sourceId,
    runType,
    status: "running",
    startedAt: new Date(),
    createdBy: input.createdBy,
    metadataJson: input.path ? { path: input.path } : undefined,
  });
  await emit(DATA_ACQUISITION_EVENTS.acquisitionStarted, {
    runId: run.id,
    sourceId: source.id,
    workspaceId: source.workspaceId,
    runType,
  });

  try {
    let items: Array<{
      itemType: string;
      sourceUri: string;
      rawLocation?: string;
      mimeType?: string;
      sizeBytes?: number;
      checksum?: string;
      metadata?: Record<string, unknown>;
    }> = [];

    if (input.inlineItems && input.inlineItems.length > 0) {
      items = input.inlineItems;
    } else {
      const connectorKey = source.sourceType === "manual_form"
        ? "manual"
        : source.sourceType === "webhook"
          ? "webhook"
          : source.sourceType === "document"
            ? "local"
            : source.sourceType;
      const connector = getConnector(connectorKey);
      if (!connector) {
        throw new Error(
          `No connector registered for source type ${source.sourceType}`,
        );
      }
      const status = await connector.status();
      if (status.status !== "available") {
        throw new Error(
          `${connector.displayName} status=${status.status}: ${status.message}`,
        );
      }
      const discovered = await connector.discover({
        sourceId: source.id,
        workspaceId: source.workspaceId,
        path: input.path,
      } as any);
      items = discovered;
    }

    const inserted = await insertItems(
      items.map((it) => ({
        workspaceId: source.workspaceId,
        sourceId: source.id,
        runId: run.id,
        itemType: it.itemType,
        sourceUri: it.sourceUri,
        rawLocation: it.rawLocation,
        mimeType: it.mimeType,
        sizeBytes: it.sizeBytes,
        checksum: it.checksum,
        status: "discovered",
        metadataJson: it.metadata,
      })),
    );
    for (const item of inserted) {
      await emit(DATA_ACQUISITION_EVENTS.itemDiscovered, {
        itemId: item.id,
        runId: run.id,
        sourceId: source.id,
        itemType: item.itemType,
      });
    }
    await updateRunStatus(run.id, {
      status: "completed",
      itemCount: inserted.length,
      processedCount: 0,
      completedAt: new Date(),
    });
    await emit(DATA_ACQUISITION_EVENTS.acquisitionCompleted, {
      runId: run.id,
      sourceId: source.id,
      workspaceId: source.workspaceId,
      itemCount: inserted.length,
    });
    return { run, items: inserted };
  } catch (err) {
    await updateRunStatus(run.id, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: (err as Error).message,
    });
    await emit(DATA_ACQUISITION_EVENTS.acquisitionFailed, {
      runId: run.id,
      sourceId: source.id,
      workspaceId: source.workspaceId,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}

export async function listRuns(workspaceId?: number, sourceId?: number) {
  return listRunsRow(workspaceId, sourceId);
}

export async function getRunById(id: number) {
  const row = await getRun(id);
  if (!row) throw new Error(`Run ${id} not found`);
  return row;
}

export async function cancelRun(input: { id: number }) {
  const row = await updateRunStatus(input.id, {
    status: "cancelled",
    completedAt: new Date(),
  });
  if (!row) throw new Error(`Run ${input.id} not found`);
  return row;
}

/* ── Items ───────────────────────────────────────────────────────── */

export async function listItems(workspaceId?: number, sourceId?: number) {
  return listItemsRow(workspaceId, sourceId);
}

export async function getItemById(id: number) {
  const row = await getItem(id);
  if (!row) throw new Error(`Item ${id} not found`);
  return row;
}

/* ── Classification + routing ────────────────────────────────────── */

export async function classifyItem(input: { itemId: number }) {
  const item = await getItem(input.itemId);
  if (!item) throw new Error(`Item ${input.itemId} not found`);

  // For now we route documents through the local heuristic. Other
  // item types defer to the worker once it's running; until then we
  // record a low-confidence classification so the audit trail is
  // intact.
  let result = classifyDocument({
    itemId: item.id,
    itemType: item.itemType as any,
    metadata: { ...(item.metadataJson ?? {}), mimeType: item.mimeType },
  });
  if (item.itemType !== "document") {
    result = {
      ...result,
      dataType: item.itemType,
      mode: pipelineForItem(item.itemType),
      confidence: 50,
      result: { ...(result.result ?? {}), reason: "non-document fast path" },
    };
  }

  const classification = await insertClassification({
    itemId: item.id,
    dataType: result.dataType,
    mode: result.mode,
    complexity: result.complexity,
    language: result.language,
    requiresOcr: result.requiresOcr,
    hasTables: result.hasTables,
    recommendedProcessor: result.recommendedProcessor,
    confidence: result.confidence,
    classifierVersion: DATA_ACQUISITION_CLASSIFIER_VERSION,
    resultJson: result.result ?? {},
  });
  await updateItemStatus(item.id, "classified");
  await emit(DATA_ACQUISITION_EVENTS.itemClassified, {
    itemId: item.id,
    classificationId: classification.id,
    dataType: result.dataType,
    mode: result.mode,
    confidence: result.confidence,
  });
  return classification;
}

export async function routeItem(input: { itemId: number }) {
  const cls = (await listClassificationsRow(input.itemId))[0];
  if (!cls) throw new Error(`Item ${input.itemId} has no classification`);
  const decision = routeParser({
    dataType: cls.dataType,
    mode: cls.mode as any,
    complexity: cls.complexity as any,
    language: cls.language ?? undefined,
    requiresOcr: cls.requiresOcr ?? undefined,
    hasTables: cls.hasTables ?? undefined,
    recommendedProcessor: cls.recommendedProcessor ?? undefined,
    confidence: cls.confidence,
    result: cls.resultJson ?? {},
  });
  const route = await insertRoute({
    itemId: input.itemId,
    selectedPipeline: decision.selectedPipeline,
    selectedProcessor: decision.selectedProcessor,
    fallbackChainJson: decision.fallbackChain,
    strategy: decision.strategy,
    decisionJson: decision.decision ?? {},
  });
  await updateItemStatus(input.itemId, "routed");
  await emit(DATA_ACQUISITION_EVENTS.itemRouted, {
    itemId: input.itemId,
    routeId: route.id,
    selectedPipeline: route.selectedPipeline,
    selectedProcessor: route.selectedProcessor,
    fallbackChain: decision.fallbackChain,
  });
  if (decision.selectedPipeline === "document") {
    await emit(DATA_ACQUISITION_EVENTS.documentParserSelected, {
      itemId: input.itemId,
      parserUsed: route.selectedProcessor,
      fallback: route.strategy === "fallback",
    });
  }
  return route;
}

export async function listClassifications(itemId?: number) {
  return listClassificationsRow(itemId);
}

export async function listRoutesAll(itemId?: number) {
  return listRoutesRow(itemId);
}

/* ── Processing ──────────────────────────────────────────────────── */

export async function runProcessing(input: {
  itemId: number;
  pipeline?: string;
  processorName?: string;
  runId?: number;
}) {
  const item = await getItem(input.itemId);
  if (!item) throw new Error(`Item ${input.itemId} not found`);

  // Prefer the latest route; fall back to the caller's hint.
  const routes = await listRoutesRow(input.itemId);
  const route = routes[0];
  const pipeline = (input.pipeline ?? route?.selectedPipeline) as string;
  const processorName = input.processorName ?? route?.selectedProcessor;
  if (!pipeline || !processorName) {
    throw new Error(
      `Item ${input.itemId} has no route — call routeItem first or pass pipeline/processorName`,
    );
  }

  const proc = await insertProcessingRun({
    itemId: input.itemId,
    runId: input.runId,
    pipeline,
    processorName,
    status: "running",
    startedAt: new Date(),
  });
  await emit(DATA_ACQUISITION_EVENTS.processingStarted, {
    itemId: input.itemId,
    processingRunId: proc.id,
    pipeline,
    processorName,
    status: "running",
  });

  // Worker check — every real processor lives on the worker.
  const workerStatus = await getDataAcquisitionWorkerStatus();
  if (!workerStatus.healthy) {
    const errMsg = `Data Acquisition worker unavailable — ${workerStatus.message}`;
    await updateProcessingRun(proc.id, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: errMsg,
    });
    await updateItemStatus(input.itemId, "failed");
    await emit(DATA_ACQUISITION_EVENTS.processingFailed, {
      itemId: input.itemId,
      processingRunId: proc.id,
      pipeline,
      processorName,
      status: "failed",
      errorMessage: errMsg,
    });
    return { processingRun: proc, status: "failed" as const, errorMessage: errMsg };
  }

  // Worker is reachable but no real call is wired yet. We mark
  // `degraded` rather than fake success — the worker contract is
  // declared, but the per-pipeline RPCs land in follow-up work.
  const reason =
    "Worker reachable, but per-pipeline RPC not yet wired. Recording degraded run row.";
  await updateProcessingRun(proc.id, {
    status: "degraded",
    completedAt: new Date(),
    errorMessage: reason,
  });
  await updateItemStatus(input.itemId, "needs_review");
  await emit(DATA_ACQUISITION_EVENTS.processingFailed, {
    itemId: input.itemId,
    processingRunId: proc.id,
    pipeline,
    processorName,
    status: "degraded",
    errorMessage: reason,
  });
  return { processingRun: proc, status: "degraded" as const, errorMessage: reason };
}

export async function listProcessingRuns(itemId?: number) {
  return listProcessingRunsRow(itemId);
}

export async function getProcessingRunById(itemId: number) {
  const rows = await listProcessingRunsRow(itemId);
  if (rows.length === 0) throw new Error("No processing runs for item");
  return rows[0];
}

/* ── Document pipeline ───────────────────────────────────────────── */

export async function classifyDocumentItem(input: { itemId: number }) {
  return classifyItem(input);
}

export async function routeParserForItem(input: { itemId: number }) {
  return routeItem(input);
}

export async function runParser(input: { itemId: number }) {
  return runProcessing({ itemId: input.itemId, pipeline: "document" });
}

export async function getCanonicalDocument(input: { itemId: number }) {
  const spec = await getDocumentSpec(input.itemId);
  if (!spec) {
    return { itemId: input.itemId, canonical: null as any };
  }
  return { itemId: input.itemId, canonical: spec.canonicalJson };
}

export async function validateDocument(input: {
  itemId: number;
  workerOutput?: { sections?: unknown[]; ocrConfidence?: number; errors?: string[] };
}) {
  const verdict = validateDocumentOutput(input.workerOutput ?? {});
  const quality = await insertQuality({
    itemId: input.itemId,
    confidenceScore: verdict.confidenceScore,
    requiresReview: verdict.requiresReview,
    issuesJson: verdict.issues,
    validationVersion: DATA_ACQUISITION_VALIDATION_VERSION,
  });
  // Build a canonical document record (worker output may be empty —
  // that's reflected in the verdict).
  const canonical = buildCanonicalDocument({
    itemId: input.itemId,
    metadata: { validationVersion: verdict.validationVersion },
    workerOutput: (input.workerOutput ?? {}) as Record<string, unknown>,
  });
  const item = await getItem(input.itemId);
  if (item) {
    const record = await insertCanonicalRecord({
      workspaceId: item.workspaceId,
      sourceId: item.sourceId,
      itemId: item.id,
      recordType: "document",
      canonicalVersion: DATA_ACQUISITION_PIPELINE_VERSION,
      canonicalJson: canonical as unknown as Record<string, unknown>,
      confidenceScore: verdict.confidenceScore,
    });
    await insertDocumentSpec({
      itemId: item.id,
      docType: "document",
      pageCount: canonical.document.sections.length,
      parserUsed: "worker",
      fallbackUsed: false,
      canonicalJson: canonical as unknown as Record<string, unknown>,
    });
    await emit(DATA_ACQUISITION_EVENTS.canonicalRecordCreated, {
      canonicalRecordId: record.id,
      itemId: item.id,
      recordType: "document",
      confidenceScore: verdict.confidenceScore,
    });
    await emit(DATA_ACQUISITION_EVENTS.documentValidated, {
      itemId: item.id,
      qualityResultId: quality.id,
      confidenceScore: verdict.confidenceScore,
    });
  }
  await emit(DATA_ACQUISITION_EVENTS.qualityValidated, {
    itemId: input.itemId,
    qualityResultId: quality.id,
    confidenceScore: verdict.confidenceScore,
    requiresReview: verdict.requiresReview,
  });
  return { quality, verdict };
}

/* ── Output pipelines ────────────────────────────────────────────── */

export async function runOutputPipeline(input: {
  workspaceId: number;
  outputType: string;
  itemId?: number;
  canonicalRecordId?: number;
  targetRef?: string;
}) {
  const { id } = await recordOutputRun({
    workspaceId: input.workspaceId,
    outputType: input.outputType as any,
    itemId: input.itemId,
    canonicalRecordId: input.canonicalRecordId,
    targetRef: input.targetRef,
  });
  await emit(DATA_ACQUISITION_EVENTS.outputPipelineStarted, {
    outputRunId: id,
    outputType: input.outputType,
    status: "pending",
    itemId: input.itemId,
    canonicalRecordId: input.canonicalRecordId,
  });
  // Data Acquisition does not reach across module boundaries to
  // perform the actual ingest. The receiving subdomain (e.g.
  // GraphRAG) reacts to the `outputPipelineCompleted` event and
  // owns the side-effect. We mark the run as `completed` from
  // Data Acquisition's perspective — it has done its job by
  // recording the request.
  await markOutputRunCompleted(id, input.targetRef);
  await emit(DATA_ACQUISITION_EVENTS.outputPipelineCompleted, {
    outputRunId: id,
    outputType: input.outputType,
    status: "completed",
    itemId: input.itemId,
    canonicalRecordId: input.canonicalRecordId,
  });
  return { id, status: "completed" as const };
}

export async function listOutputRuns(workspaceId?: number) {
  return listOutputRunsRow(workspaceId);
}

/* ── Canonical records ───────────────────────────────────────────── */

export async function getCanonicalRecord(input: { id: number }) {
  const row = await getCanonicalRecordRow(input.id);
  if (!row) throw new Error(`Canonical record ${input.id} not found`);
  return row;
}

export async function listCanonicalRecords(workspaceId?: number) {
  return listCanonicalRecordsRow(workspaceId);
}

/* ── Health / summary ────────────────────────────────────────────── */

export async function workerStatus() {
  return getDataAcquisitionWorkerStatus();
}

export async function summary(_input?: { workspaceId?: number }): Promise<DataAcquisitionSummary> {
  const counts = await summaryCounts();
  const worker = await getDataAcquisitionWorkerStatus();
  return {
    generatedAt: new Date().toISOString(),
    worker,
    sources: {
      registered: counts.sourceCount,
      active: counts.activeSourceCount,
      byType: {} as any,
    },
    runs: {
      total: counts.runCount,
      byStatus: {} as any,
    },
    items: {
      total: counts.itemCount,
      discovered: counts.itemCount - counts.processedCount,
      processed: counts.processedCount,
    },
    processing: {
      runs: counts.runCount,
      failed: counts.failedProcessingCount,
      averageConfidence: counts.avgConfidence,
    },
    canonicalRecords: {
      total: counts.canonicalCount,
      byType: {} as any,
    },
    outputs: {
      total: counts.outputCount,
      byType: {} as any,
    },
    governance: {
      denials: 0,
    },
  };
}

/* ── helpers ─────────────────────────────────────────────────────── */

function pipelineForItem(itemType: string) {
  switch (itemType) {
    case "sensor_reading":
      return "sensor";
    case "stream_event":
      return "stream";
    case "api_record":
      return "api";
    case "db_record":
      return "database";
    case "web_page":
      return "web";
    case "git_object":
      return "git";
    case "form_submission":
      return "manual";
    case "webhook_event":
      return "webhook";
    case "media_asset":
      return "media";
    default:
      return "document";
  }
}
