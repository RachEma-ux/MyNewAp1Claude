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
