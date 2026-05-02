/**
 * Data Analysis — GraphRAG worker contract / status tests.
 *
 * Verifies the worker is declared as a Data Analysis runtime port and
 * that `getGraphRagWorkerStatus()` returns a clean degraded status
 * when the worker is unreachable (default state on this environment).
 */

import { describe, it, expect } from "vitest";
import {
  graphRagWorkerContract,
  getGraphRagWorkerUrl,
  GRAPHRAG_WORKER_DEFAULT_URL,
  GRAPHRAG_WORKER_ENV,
  DATA_ANALYSIS_RUNTIME_ENDPOINTS,
} from "../ports";
import { getGraphRagWorkerStatus } from "../graphrag/graphRag.worker";

describe("GraphRAG worker contract", () => {
  it("default URL is http://localhost:8484", () => {
    expect(GRAPHRAG_WORKER_DEFAULT_URL).toBe("http://localhost:8484");
  });

  it("env var name is GRAPHRAG_WORKER_URL", () => {
    expect(GRAPHRAG_WORKER_ENV).toBe("GRAPHRAG_WORKER_URL");
  });

  it("contract declares the four endpoint paths and a probe timeout", () => {
    expect(graphRagWorkerContract.healthPath).toBe("/health");
    expect(graphRagWorkerContract.indexPath).toBe("/index");
    expect(graphRagWorkerContract.queryPath).toBe("/query");
    expect(graphRagWorkerContract.timeoutMs).toBeGreaterThan(0);
  });

  it("manifest-facing runtime endpoint list cites graphRagWorker as external + non-required", () => {
    const ep = DATA_ANALYSIS_RUNTIME_ENDPOINTS.find(
      (e) => e.key === "graphRagWorker",
    );
    expect(ep).toBeDefined();
    expect(ep?.mode).toBe("external");
    expect(ep?.required).toBe(false);
    expect(ep?.env).toBe("GRAPHRAG_WORKER_URL");
  });

  it("getGraphRagWorkerUrl reads env override when present", () => {
    const original = process.env[GRAPHRAG_WORKER_ENV];
    process.env[GRAPHRAG_WORKER_ENV] = "http://example.test:9999";
    try {
      expect(getGraphRagWorkerUrl()).toBe("http://example.test:9999");
    } finally {
      if (original === undefined) delete process.env[GRAPHRAG_WORKER_ENV];
      else process.env[GRAPHRAG_WORKER_ENV] = original;
    }
  });
});

describe("getGraphRagWorkerStatus()", () => {
  it("returns a normalized status object even when worker is unreachable", async () => {
    const status = await getGraphRagWorkerStatus();
    expect(status).toMatchObject({
      healthy: expect.any(Boolean),
      url: expect.any(String),
      message: expect.any(String),
    });
    // In this test env the Python worker is not running.
    expect(status.healthy).toBe(false);
    expect(status.message).toMatch(/worker is not available/i);
  });
});
