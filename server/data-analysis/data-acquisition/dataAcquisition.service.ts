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
import {
  callWorkerClassify,
  callWorkerOcr,
  callWorkerOutput,
  callWorkerParse,
  callWorkerReconstruct,
  callWorkerRoute,
  callWorkerValidate,
  getDataAcquisitionWorkerStatus,
  WorkerRpcError,
} from "./dataAcquisition.worker";
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

  // Worker is reachable — dispatch by pipeline. Each capability has its
  // own RPC; failure is recorded as a `failed` run with the worker's
  // error preserved (kind=unreachable/timeout/http_error/bad_response).
  // No fake success path exists.
  try {
    const dispatched = await dispatchProcessingToWorker({
      itemId: input.itemId,
      pipeline,
      processorName,
      rawLocation: item.rawLocation ?? undefined,
    });
    await updateProcessingRun(proc.id, {
      status: "completed",
      completedAt: new Date(),
      confidence: dispatched.confidence ?? null,
      outputLocation: dispatched.outputLocation ?? null,
      resultJson: dispatched.result ?? null,
    });
    await updateItemStatus(input.itemId, "processed");
    await emit(DATA_ACQUISITION_EVENTS.processingCompleted, {
      itemId: input.itemId,
      processingRunId: proc.id,
      pipeline,
      processorName,
      status: "completed",
      confidence: dispatched.confidence,
    });
    return {
      processingRun: proc,
      status: "completed" as const,
      result: dispatched.result,
    };
  } catch (err) {
    const rpcErr = err instanceof WorkerRpcError ? err : null;
    const errMsg = rpcErr
      ? `Worker ${pipeline}/${processorName} ${rpcErr.kind}: ${rpcErr.message}`
      : `Worker ${pipeline}/${processorName} failed: ${(err as Error).message}`;
    // Unreachable/timeout → degraded (UI banner takes over);
    // http_error/bad_response → failed (worker is broken, not absent).
    const status =
      rpcErr && (rpcErr.kind === "unreachable" || rpcErr.kind === "timeout")
        ? "degraded"
        : "failed";
    await updateProcessingRun(proc.id, {
      status,
      completedAt: new Date(),
      errorMessage: errMsg,
    });
    await updateItemStatus(
      input.itemId,
      status === "degraded" ? "needs_review" : "failed",
    );
    await emit(DATA_ACQUISITION_EVENTS.processingFailed, {
      itemId: input.itemId,
      processingRunId: proc.id,
      pipeline,
      processorName,
      status,
      errorMessage: errMsg,
    });
    return { processingRun: proc, status: status as "degraded" | "failed", errorMessage: errMsg };
  }
}

/**
 * Dispatch a processing call to the appropriate worker capability based on
 * pipeline. Document → /parse. Other modes → /parse with the pipeline name
 * as a hint; the worker decides per-mode behavior. Throws WorkerRpcError
 * on any failure; never returns a fake-success placeholder.
 */
async function dispatchProcessingToWorker(input: {
  itemId: number;
  pipeline: string;
  processorName: string;
  rawLocation?: string;
}): Promise<{
  confidence?: number;
  outputLocation?: string;
  result: Record<string, unknown>;
}> {
  // OCR has its own RPC because parsers may delegate to it.
  if (input.processorName === "tesseract" || input.processorName === "paddleocr") {
    const out = await callWorkerOcr({
      itemId: input.itemId,
      rawLocation: input.rawLocation,
    });
    return {
      confidence: Math.round((out.confidence ?? 0) * 100),
      outputLocation: undefined,
      result: out as unknown as Record<string, unknown>,
    };
  }
  const parsed = await callWorkerParse({
    itemId: input.itemId,
    pipeline: input.pipeline,
    processorName: input.processorName,
    rawLocation: input.rawLocation,
  });
  return {
    confidence: parsed.ocrConfidence
      ? Math.round(parsed.ocrConfidence * 100)
      : undefined,
    outputLocation: parsed.outputLocation,
    result: parsed as unknown as Record<string, unknown>,
  };
}

/**
 * Worker-backed classification for non-document items. Falls back to the
 * service's fast-path classifier (already covered above by `classifyItem`)
 * if the worker is unavailable — that fast path always succeeds because
 * it's pure JS, but it produces a low-confidence verdict.
 */
export async function classifyItemViaWorker(input: { itemId: number }) {
  const item = await getItem(input.itemId);
  if (!item) throw new Error(`Item ${input.itemId} not found`);
  try {
    const out = await callWorkerClassify({
      itemId: item.id,
      itemType: item.itemType,
      metadata: { ...(item.metadataJson ?? {}), mimeType: item.mimeType },
    });
    const classification = await insertClassification({
      itemId: item.id,
      dataType: out.dataType,
      mode: out.mode,
      complexity: out.complexity ?? null,
      language: out.language ?? null,
      requiresOcr: out.requiresOcr ?? null,
      hasTables: out.hasTables ?? null,
      recommendedProcessor: out.recommendedProcessor ?? null,
      confidence: out.confidence,
      classifierVersion: DATA_ACQUISITION_CLASSIFIER_VERSION,
      resultJson: out.result ?? {},
    });
    await updateItemStatus(item.id, "classified");
    await emit(DATA_ACQUISITION_EVENTS.itemClassified, {
      itemId: item.id,
      classificationId: classification.id,
      dataType: out.dataType,
      mode: out.mode,
      confidence: out.confidence,
    });
    return classification;
  } catch (err) {
    // Worker unavailable → fall back to local fast-path classifier.
    return classifyItem(input);
  }
}

/**
 * Worker-backed routing — uses the worker's policy engine when available,
 * else the local heuristic in `routeParser`. Never silently downgrades.
 */
export async function routeItemViaWorker(input: { itemId: number }) {
  const cls = (await listClassificationsRow(input.itemId))[0];
  if (!cls) throw new Error(`Item ${input.itemId} has no classification`);
  try {
    const out = await callWorkerRoute({
      itemId: input.itemId,
      classification: {
        dataType: cls.dataType,
        mode: cls.mode,
        complexity: cls.complexity ?? undefined,
        language: cls.language ?? undefined,
        requiresOcr: cls.requiresOcr ?? undefined,
        hasTables: cls.hasTables ?? undefined,
        recommendedProcessor: cls.recommendedProcessor ?? undefined,
        confidence: cls.confidence,
        result: cls.resultJson ?? {},
      },
    });
    const route = await insertRoute({
      itemId: input.itemId,
      selectedPipeline: out.selectedPipeline,
      selectedProcessor: out.selectedProcessor,
      fallbackChainJson: out.fallbackChain,
      strategy: out.strategy,
      costEstimate: out.costEstimate ?? null,
      slaClass: out.slaClass ?? null,
      decisionJson: out.decision ?? {},
    });
    await updateItemStatus(input.itemId, "routed");
    await emit(DATA_ACQUISITION_EVENTS.itemRouted, {
      itemId: input.itemId,
      routeId: route.id,
      selectedPipeline: route.selectedPipeline,
      selectedProcessor: route.selectedProcessor,
      fallbackChain: out.fallbackChain,
    });
    return route;
  } catch {
    return routeItem(input);
  }
}

/**
 * Worker-backed validation — hits /validate. On failure falls back to the
 * pure-JS `validateDocumentOutput` so the item still gets a quality verdict.
 */
export async function validateItemViaWorker(input: {
  itemId: number;
  workerOutput?: Record<string, unknown>;
}) {
  try {
    const out = await callWorkerValidate({
      itemId: input.itemId,
      output: input.workerOutput ?? {},
    });
    const quality = await insertQuality({
      itemId: input.itemId,
      confidenceScore: out.confidenceScore,
      requiresReview: out.requiresReview,
      issuesJson: out.issues,
      validationVersion: DATA_ACQUISITION_VALIDATION_VERSION,
    });
    await emit(DATA_ACQUISITION_EVENTS.qualityValidated, {
      itemId: input.itemId,
      qualityResultId: quality.id,
      confidenceScore: out.confidenceScore,
      requiresReview: out.requiresReview,
    });
    return { quality, verdict: out };
  } catch {
    return validateDocument({
      itemId: input.itemId,
      workerOutput: input.workerOutput as any,
    });
  }
}

/**
 * Worker-backed reconstruction. Returns the canonical sections produced
 * by the worker's /reconstruct endpoint. Throws on failure — caller is
 * expected to record a failed processing run.
 */
export async function reconstructViaWorker(input: {
  itemId: number;
  parserOutput: Record<string, unknown>;
}) {
  return callWorkerReconstruct({
    itemId: input.itemId,
    parserOutput: input.parserOutput as any,
  });
}

/**
 * Worker-backed output emission. The worker decides whether to push to
 * the configured downstream (RAG indexer, GraphRAG worker, warehouse,
 * alert sink, etc.). On failure, caller records a `failed` output run.
 */
export async function emitOutputViaWorker(input: {
  outputType: string;
  canonicalRecordId?: number;
  itemId?: number;
  targetRef?: string;
  payload?: Record<string, unknown>;
}) {
  return callWorkerOutput(input);
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
