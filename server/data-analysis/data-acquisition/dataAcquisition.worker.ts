/**
 * Data Acquisition worker client.
 *
 * Default worker URL: http://localhost:8485
 * Env var:           DATA_ACQUISITION_WORKER_URL
 *
 * Capabilities (declared in the contract):
 *   classify, route, parse, ocr, reconstruct, validate, output
 *
 * Behavior:
 *   reachable  → healthy
 *   unreachable → degraded
 *   timeout    → degraded
 *   bad response → failed
 *
 * Worker transitions (`workerUnavailable` / `workerRecovered`) are
 * emitted only when the cached state changes — never on every probe.
 */

import {
  DATA_ACQUISITION_WORKER_DEFAULT_URL,
  DATA_ACQUISITION_WORKER_ENV,
  DATA_ACQUISITION_WORKER_TIMEOUT_MS,
} from "./dataAcquisition.constants";
import type {
  DataAcquisitionWorkerContract,
  DataAcquisitionWorkerStatus,
} from "./dataAcquisition.contracts";
import { DATA_ACQUISITION_EVENTS } from "./dataAcquisition.events";

export const dataAcquisitionWorkerContract: DataAcquisitionWorkerContract = {
  defaultUrl: DATA_ACQUISITION_WORKER_DEFAULT_URL,
  envVar: DATA_ACQUISITION_WORKER_ENV,
  healthPath: "/health",
  classifyPath: "/classify",
  routePath: "/route",
  parsePath: "/parse",
  ocrPath: "/ocr",
  reconstructPath: "/reconstruct",
  validatePath: "/validate",
  outputPath: "/output",
  capabilities: ["classify", "route", "parse", "ocr", "reconstruct", "validate", "output"],
  timeoutMs: DATA_ACQUISITION_WORKER_TIMEOUT_MS,
};

export function getDataAcquisitionWorkerUrl(): string {
  return (
    process.env[DATA_ACQUISITION_WORKER_ENV] ||
    DATA_ACQUISITION_WORKER_DEFAULT_URL
  );
}

let lastEmittedHealthy: boolean | null = null;
let lastCheckedAt = 0;

async function emitWorkerTransition(healthy: boolean, status: DataAcquisitionWorkerStatus) {
  if (lastEmittedHealthy === healthy) return;
  lastEmittedHealthy = healthy;
  try {
    const { publishEvent, makeEnvelope } = await import("../../platform/events");
    await publishEvent(
      makeEnvelope({
        eventType: healthy
          ? DATA_ACQUISITION_EVENTS.workerRecovered
          : DATA_ACQUISITION_EVENTS.workerUnavailable,
        sourceModule: "dataAnalysis",
        payload: { url: status.url, message: status.message },
      }),
    );
  } catch {
    /* event-bus failures must not affect health probes */
  }
}

/**
 * Probe the worker `/health` endpoint and normalize the response.
 * Never throws.
 */
export async function getDataAcquisitionWorkerStatus(): Promise<DataAcquisitionWorkerStatus> {
  const url = getDataAcquisitionWorkerUrl();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    DATA_ACQUISITION_WORKER_TIMEOUT_MS,
  );
  let status: DataAcquisitionWorkerStatus;

  try {
    const res = await fetch(`${url}${dataAcquisitionWorkerContract.healthPath}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      status = {
        healthy: false,
        url,
        message: `Worker responded ${res.status} ${res.statusText}`,
        lastCheckedAt: Date.now(),
        capabilities: dataAcquisitionWorkerContract.capabilities,
      };
    } else {
      status = {
        healthy: true,
        url,
        message: "Worker reachable.",
        lastCheckedAt: Date.now(),
        capabilities: dataAcquisitionWorkerContract.capabilities,
      };
    }
  } catch (err) {
    const isAbort = (err as { name?: string })?.name === "AbortError";
    status = {
      healthy: false,
      url,
      message: isAbort
        ? `Worker probe timed out after ${DATA_ACQUISITION_WORKER_TIMEOUT_MS} ms`
        : `Worker unreachable: ${(err as Error).message}`,
      lastCheckedAt: Date.now(),
      capabilities: dataAcquisitionWorkerContract.capabilities,
    };
  } finally {
    clearTimeout(timer);
  }
  lastCheckedAt = Date.now();
  await emitWorkerTransition(status.healthy, status);
  return status;
}

/** For tests — reset the cached transition state. */
export function _resetWorkerStateForTests(): void {
  lastEmittedHealthy = null;
  lastCheckedAt = 0;
}

/* ── Per-capability RPC clients ─────────────────────────────────────
 *
 * Each capability is one HTTP POST to the worker. Behavior:
 *   reachable, 2xx     → returns parsed JSON body
 *   reachable, non-2xx → throws WorkerRpcError with status + body
 *   unreachable        → throws WorkerRpcError("unreachable")
 *   timeout            → throws WorkerRpcError("timeout")
 *
 * Service callers wrap these in try/catch and record `failed`/`degraded`
 * processing runs. They never silently swallow failures or fake success.
 */

export class WorkerRpcError extends Error {
  readonly kind: "unreachable" | "timeout" | "http_error" | "bad_response";
  readonly statusCode?: number;
  readonly body?: string;
  constructor(
    kind: "unreachable" | "timeout" | "http_error" | "bad_response",
    message: string,
    extra: { statusCode?: number; body?: string } = {},
  ) {
    super(message);
    this.kind = kind;
    this.statusCode = extra.statusCode;
    this.body = extra.body;
    this.name = "WorkerRpcError";
  }
}

async function callWorker<T>(
  capabilityPath: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const url = getDataAcquisitionWorkerUrl();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    DATA_ACQUISITION_WORKER_TIMEOUT_MS,
  );
  try {
    const res = await fetch(`${url}${capabilityPath}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new WorkerRpcError(
        "http_error",
        `Worker ${capabilityPath} responded ${res.status} ${res.statusText}`,
        { statusCode: res.status, body },
      );
    }
    try {
      return (await res.json()) as T;
    } catch (err) {
      throw new WorkerRpcError(
        "bad_response",
        `Worker ${capabilityPath} returned non-JSON body: ${(err as Error).message}`,
      );
    }
  } catch (err) {
    if (err instanceof WorkerRpcError) throw err;
    if ((err as { name?: string })?.name === "AbortError") {
      throw new WorkerRpcError(
        "timeout",
        `Worker ${capabilityPath} timed out after ${DATA_ACQUISITION_WORKER_TIMEOUT_MS} ms`,
      );
    }
    throw new WorkerRpcError(
      "unreachable",
      `Worker ${capabilityPath} unreachable: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

export interface WorkerClassifyInput {
  itemId: number;
  itemType: string;
  metadata?: Record<string, unknown>;
}
export interface WorkerClassifyResult {
  dataType: string;
  mode: string;
  complexity?: string;
  language?: string;
  requiresOcr?: boolean;
  hasTables?: boolean;
  recommendedProcessor?: string;
  confidence: number;
  result?: Record<string, unknown>;
}
export const callWorkerClassify = (input: WorkerClassifyInput) =>
  callWorker<WorkerClassifyResult>(
    dataAcquisitionWorkerContract.classifyPath,
    input as unknown as Record<string, unknown>,
  );

export interface WorkerRouteInput {
  itemId: number;
  classification: WorkerClassifyResult;
}
export interface WorkerRouteResult {
  selectedPipeline: string;
  selectedProcessor: string;
  fallbackChain: string[];
  strategy: string;
  costEstimate?: string;
  slaClass?: string;
  decision?: Record<string, unknown>;
}
export const callWorkerRoute = (input: WorkerRouteInput) =>
  callWorker<WorkerRouteResult>(
    dataAcquisitionWorkerContract.routePath,
    input as unknown as Record<string, unknown>,
  );

export interface WorkerParseInput {
  itemId: number;
  pipeline: string;
  processorName: string;
  rawLocation?: string;
  fallbackChain?: string[];
}
export interface WorkerParseResult {
  parserUsed: string;
  fallbackUsed: boolean;
  sections?: Array<{ title?: string; content: unknown[]; tables: unknown[]; figures: unknown[] }>;
  ocrConfidence?: number;
  outputLocation?: string;
  errors?: string[];
}
export const callWorkerParse = (input: WorkerParseInput) =>
  callWorker<WorkerParseResult>(
    dataAcquisitionWorkerContract.parsePath,
    input as unknown as Record<string, unknown>,
  );

export interface WorkerOcrInput {
  itemId: number;
  rawLocation?: string;
  language?: string;
}
export interface WorkerOcrResult {
  text: string;
  confidence: number;
  processor: string;
}
export const callWorkerOcr = (input: WorkerOcrInput) =>
  callWorker<WorkerOcrResult>(
    dataAcquisitionWorkerContract.ocrPath,
    input as unknown as Record<string, unknown>,
  );

export interface WorkerReconstructInput {
  itemId: number;
  parserOutput: WorkerParseResult;
}
export interface WorkerReconstructResult {
  sections: Array<{ title?: string; content: unknown[]; tables: unknown[]; figures: unknown[] }>;
  graph?: { nodes: unknown[]; edges: unknown[] };
}
export const callWorkerReconstruct = (input: WorkerReconstructInput) =>
  callWorker<WorkerReconstructResult>(
    dataAcquisitionWorkerContract.reconstructPath,
    input as unknown as Record<string, unknown>,
  );

export interface WorkerValidateInput {
  itemId: number;
  output: WorkerParseResult | WorkerReconstructResult | Record<string, unknown>;
}
export interface WorkerValidateResult {
  confidenceScore: number;
  requiresReview: boolean;
  issues: Array<{ code: string; severity: "low" | "medium" | "high"; message: string }>;
}
export const callWorkerValidate = (input: WorkerValidateInput) =>
  callWorker<WorkerValidateResult>(
    dataAcquisitionWorkerContract.validatePath,
    input as unknown as Record<string, unknown>,
  );

export interface WorkerOutputInput {
  outputType: string;
  canonicalRecordId?: number;
  itemId?: number;
  targetRef?: string;
  payload?: Record<string, unknown>;
}
export interface WorkerOutputResult {
  status: "completed" | "degraded" | "failed";
  targetRef?: string;
  message?: string;
}
export const callWorkerOutput = (input: WorkerOutputInput) =>
  callWorker<WorkerOutputResult>(
    dataAcquisitionWorkerContract.outputPath,
    input as unknown as Record<string, unknown>,
  );
