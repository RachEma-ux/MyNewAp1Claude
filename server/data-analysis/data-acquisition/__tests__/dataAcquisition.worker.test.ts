/**
 * Data Acquisition worker contract test.
 *
 * Verifies:
 *   - default URL is :8485
 *   - env var name is DATA_ACQUISITION_WORKER_URL
 *   - the contract declares all 7 capabilities + endpoint paths
 *   - getDataAcquisitionWorkerStatus returns a normalized object
 *     even when the worker is unreachable (degraded state, never throws)
 */

import { describe, expect, it } from "vitest";

import {
  DATA_ACQUISITION_WORKER_DEFAULT_URL,
  DATA_ACQUISITION_WORKER_ENV,
} from "../dataAcquisition.constants";
import {
  dataAcquisitionWorkerContract,
  getDataAcquisitionWorkerStatus,
  getDataAcquisitionWorkerUrl,
  _resetWorkerStateForTests,
} from "../dataAcquisition.worker";
import { DATA_ANALYSIS_RUNTIME_ENDPOINTS } from "../../ports";

describe("Data Acquisition worker contract", () => {
  it("default URL is http://localhost:8485", () => {
    expect(DATA_ACQUISITION_WORKER_DEFAULT_URL).toBe("http://localhost:8485");
  });

  it("env var name is DATA_ACQUISITION_WORKER_URL", () => {
    expect(DATA_ACQUISITION_WORKER_ENV).toBe("DATA_ACQUISITION_WORKER_URL");
  });

  it("contract declares all seven capabilities", () => {
    expect(dataAcquisitionWorkerContract.capabilities).toEqual([
      "classify",
      "route",
      "parse",
      "ocr",
      "reconstruct",
      "validate",
      "output",
    ]);
  });

  it("contract declares the seven endpoint paths + a probe timeout", () => {
    expect(dataAcquisitionWorkerContract.healthPath).toBe("/health");
    expect(dataAcquisitionWorkerContract.classifyPath).toBe("/classify");
    expect(dataAcquisitionWorkerContract.routePath).toBe("/route");
    expect(dataAcquisitionWorkerContract.parsePath).toBe("/parse");
    expect(dataAcquisitionWorkerContract.ocrPath).toBe("/ocr");
    expect(dataAcquisitionWorkerContract.reconstructPath).toBe("/reconstruct");
    expect(dataAcquisitionWorkerContract.validatePath).toBe("/validate");
    expect(dataAcquisitionWorkerContract.outputPath).toBe("/output");
    expect(dataAcquisitionWorkerContract.timeoutMs).toBeGreaterThan(0);
  });

  it("manifest-facing runtime endpoint list cites dataAcquisitionWorker as external + non-required", () => {
    const entry = DATA_ANALYSIS_RUNTIME_ENDPOINTS.find(
      (e) => e.key === "dataAcquisitionWorker",
    );
    expect(entry).toBeDefined();
    expect(entry?.mode).toBe("external");
    expect(entry?.required).toBe(false);
  });

  it("getDataAcquisitionWorkerUrl reads env override when present", () => {
    const original = process.env.DATA_ACQUISITION_WORKER_URL;
    process.env.DATA_ACQUISITION_WORKER_URL = "http://example.test:9999";
    expect(getDataAcquisitionWorkerUrl()).toBe("http://example.test:9999");
    if (original === undefined) delete process.env.DATA_ACQUISITION_WORKER_URL;
    else process.env.DATA_ACQUISITION_WORKER_URL = original;
  });

  it("getDataAcquisitionWorkerStatus() returns a normalized status object even when unreachable", async () => {
    _resetWorkerStateForTests();
    const original = process.env.DATA_ACQUISITION_WORKER_URL;
    // Point at a port nothing listens on.
    process.env.DATA_ACQUISITION_WORKER_URL = "http://127.0.0.1:1";
    const status = await getDataAcquisitionWorkerStatus();
    expect(status.healthy).toBe(false);
    expect(status.url).toBe("http://127.0.0.1:1");
    expect(status.message.length).toBeGreaterThan(0);
    expect(status.capabilities).toBeDefined();
    if (original === undefined) delete process.env.DATA_ACQUISITION_WORKER_URL;
    else process.env.DATA_ACQUISITION_WORKER_URL = original;
  });
});
