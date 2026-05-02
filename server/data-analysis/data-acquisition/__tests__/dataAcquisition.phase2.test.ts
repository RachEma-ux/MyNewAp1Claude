/**
 * Phase-2 specialization tests.
 *
 * Covers:
 *   - DATA_ACQUISITION_OWNED_TABLES includes all 21 tables (universal +
 *     10 specializations).
 *   - Pipeline pure modules behave per spec:
 *       sensor.timeSeriesValidator
 *       webhook.signatureVerifier
 *       git.codeClassifier
 *       web.htmlExtractor
 *       saas.collaborationExtractor
 *       saas.saasNormalizer
 *   - Connector registry exposes all expected mode classes.
 *   - Worker per-capability RPC entry points exist (one network-free
 *     reachability check is already covered by the worker.test.ts; this
 *     file verifies the function set is complete).
 */

import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";

import { DATA_ACQUISITION_OWNED_TABLES } from "../dataAcquisition.constants";
import { validateTimeSeries } from "../pipelines/sensor/timeSeriesValidator";
import { verifySignature } from "../pipelines/webhook/signatureVerifier";
import { classifyCode } from "../pipelines/git/codeClassifier";
import { extractHtml, buildWebPageRow } from "../pipelines/web/htmlExtractor";
import { normalizeSaasObject } from "../pipelines/saas/saasNormalizer";
import { extractCollaborationGraph } from "../pipelines/saas/collaborationExtractor";
import {
  WorkerRpcError,
  callWorkerClassify,
  callWorkerRoute,
  callWorkerParse,
  callWorkerOcr,
  callWorkerReconstruct,
  callWorkerValidate,
  callWorkerOutput,
} from "../dataAcquisition.worker";

describe("Phase-2 specializations — owned tables", () => {
  it("declares all 21 owned tables (10 universal + 1 batches + 10 specializations)", () => {
    expect(DATA_ACQUISITION_OWNED_TABLES.length).toBe(21);
    for (const t of [
      "data_acquisition_sources",
      "data_acquisition_batches",
      "data_acquisition_sensor_readings",
      "data_acquisition_stream_events",
      "data_acquisition_api_records",
      "data_acquisition_db_records",
      "data_acquisition_media_assets",
      "data_acquisition_web_pages",
      "data_acquisition_git_objects",
      "data_acquisition_form_submissions",
      "data_acquisition_webhook_events",
    ]) {
      expect(DATA_ACQUISITION_OWNED_TABLES).toContain(t);
    }
  });
});

describe("Pipelines — sensor.timeSeriesValidator", () => {
  it("returns a perfect score for an empty batch", () => {
    const v = validateTimeSeries([]);
    expect(v.confidenceScore).toBe(100);
    expect(v.requiresReview).toBe(false);
    expect(v.issues).toEqual([]);
  });

  it("flags missing recordedAt", () => {
    const v = validateTimeSeries([
      { metricKey: "temp", value: 22 } as any,
    ]);
    expect(v.issues.some((i) => i.code === "NO_RECORDED_AT")).toBe(true);
  });

  it("flags out-of-range values as high severity → requires review", () => {
    const now = new Date();
    const v = validateTimeSeries(
      [{ metricKey: "temp", value: 999, recordedAt: now } as any],
      { clampRange: { min: -10, max: 100 } },
    );
    expect(v.issues.some((i) => i.code === "VALUE_OUT_OF_RANGE")).toBe(true);
    expect(v.requiresReview).toBe(true);
  });

  it("flags duplicate timestamps", () => {
    const t = new Date("2026-01-01T00:00:00Z");
    const v = validateTimeSeries([
      { metricKey: "temp", value: 1, recordedAt: t, deviceId: "d1" } as any,
      { metricKey: "temp", value: 2, recordedAt: t, deviceId: "d1" } as any,
    ]);
    expect(v.issues.some((i) => i.code === "DUPLICATE_TIMESTAMP")).toBe(true);
  });
});

describe("Pipelines — webhook.signatureVerifier", () => {
  const secret = "shhh";
  const body = '{"hello":"world"}';
  const sig = createHmac("sha256", secret).update(body).digest("hex");

  it("verifies a correct sha256 signature with default sha256= prefix", () => {
    expect(
      verifySignature({ body, secret, signatureHeader: `sha256=${sig}` }),
    ).toBe(true);
  });

  it("rejects a wrong signature", () => {
    expect(
      verifySignature({
        body,
        secret,
        signatureHeader: "sha256=" + "0".repeat(sig.length),
      }),
    ).toBe(false);
  });

  it("rejects when body, header, or secret is missing", () => {
    expect(verifySignature({ body: "", secret, signatureHeader: sig })).toBe(false);
    expect(verifySignature({ body, secret: "", signatureHeader: sig })).toBe(false);
    expect(verifySignature({ body, secret, signatureHeader: "" })).toBe(false);
  });
});

describe("Pipelines — git.codeClassifier", () => {
  it("classifies common code extensions", () => {
    expect(classifyCode("src/index.ts").language).toBe("typescript");
    expect(classifyCode("main.go").language).toBe("go");
    expect(classifyCode("script.py").language).toBe("python");
  });

  it("treats yaml/json/toml as config", () => {
    expect(classifyCode("ci.yaml").kind).toBe("config");
    expect(classifyCode("pkg.json").kind).toBe("config");
  });

  it("treats markdown as doc", () => {
    expect(classifyCode("README.md").kind).toBe("doc");
  });

  it("treats binary extensions as binary", () => {
    expect(classifyCode("logo.png").kind).toBe("binary");
  });

  it("returns 'unknown' for unmapped extensions but still classifies kind", () => {
    expect(classifyCode("file.xyz").language).toBe("unknown");
    expect(classifyCode("file.xyz").kind).toBe("code");
  });
});

describe("Pipelines — web.htmlExtractor", () => {
  it("lifts <title> and strips script/style/tags", () => {
    const html = `<html><head><title>Hello &amp; World</title><style>x{}</style></head><body><script>bad()</script><p>Visible <b>text</b>.</p></body></html>`;
    const out = extractHtml({
      url: "https://x",
      httpStatus: 200,
      bodyText: html,
      headersJson: {},
      fetchedAt: new Date(),
      contentLength: html.length,
    } as any);
    expect(out.titleText).toBe("Hello & World");
    // Body text after strip; tag stripping leaves a space before the period.
    expect(out.bodyText).toContain("Visible text");
    expect(out.bodyText).not.toContain("bad()");
    expect(out.bodyText).not.toContain("<script");
  });

  it("buildWebPageRow stamps itemId + crawl fields", () => {
    const row = buildWebPageRow(7, {
      url: "https://x",
      httpStatus: 200,
      bodyText: "<title>T</title><p>B</p>",
      headersJson: { ct: "text/html" },
      fetchedAt: new Date(0),
      contentLength: 10,
    } as any);
    expect(row.itemId).toBe(7);
    expect(row.url).toBe("https://x");
    expect(row.titleText).toBe("T");
  });
});

describe("Pipelines — saas normalizer + collaboration extractor", () => {
  it("normalizes timestamps and preserves raw", () => {
    const norm = normalizeSaasObject({
      provider: "slack",
      objectType: "message",
      externalId: "C123/1700000000.000100",
      body: "Hi @alice see https://example.com",
      createdAt: "2026-01-01T00:00:00Z",
      raw: { thread_ts: "1700000000.000000" },
    });
    expect(norm.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(norm.raw.thread_ts).toBe("1700000000.000000");
  });

  it("extracts mentions, links, and threadRoot", () => {
    const norm = normalizeSaasObject({
      provider: "slack",
      objectType: "message",
      externalId: "x",
      body: "ping @alice and @bob — see https://example.com and https://example.com (dup)",
      raw: { thread_ts: "9999.0" },
    });
    const frag = extractCollaborationGraph(norm);
    expect(frag.mentions.sort()).toEqual(["alice", "bob"]);
    // The extractor de-duplicates URLs; only one example.com URL remains.
    expect(frag.links).toEqual(["https://example.com"]);
    expect(frag.threadRoot).toBe("9999.0");
  });
});

describe("Worker RPC entry points", () => {
  it("exports all 7 per-capability call helpers", () => {
    expect(typeof callWorkerClassify).toBe("function");
    expect(typeof callWorkerRoute).toBe("function");
    expect(typeof callWorkerParse).toBe("function");
    expect(typeof callWorkerOcr).toBe("function");
    expect(typeof callWorkerReconstruct).toBe("function");
    expect(typeof callWorkerValidate).toBe("function");
    expect(typeof callWorkerOutput).toBe("function");
  });

  it("WorkerRpcError carries a kind", () => {
    const e = new WorkerRpcError("unreachable", "boom");
    expect(e.kind).toBe("unreachable");
    expect(e.message).toBe("boom");
  });

  it("call*() rejects with a WorkerRpcError when worker is unreachable", async () => {
    const original = process.env.DATA_ACQUISITION_WORKER_URL;
    process.env.DATA_ACQUISITION_WORKER_URL = "http://127.0.0.1:1";
    try {
      await callWorkerClassify({ itemId: 1, contentSummary: "x" } as any);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(WorkerRpcError);
      expect(["unreachable", "timeout", "http_error", "bad_response"]).toContain(
        (err as WorkerRpcError).kind,
      );
    } finally {
      if (original === undefined) delete process.env.DATA_ACQUISITION_WORKER_URL;
      else process.env.DATA_ACQUISITION_WORKER_URL = original;
    }
  });
});

describe("Connector registry", () => {
  it("registers all 13 connector mode classes", async () => {
    const { listConnectorKeys, getConnector } = await import(
      "../connectors/connector.registry"
    );
    const keys = listConnectorKeys();
    for (const m of [
      "local",
      "manual",
      "webhook",
      "s3",
      "gdrive",
      "github",
      "api",
      "database",
      "sensor",
      "stream",
      "saas",
      "web",
    ]) {
      expect(keys).toContain(m);
      expect(getConnector(m)).toBeDefined();
    }
    expect(
      keys.includes("object-storage") || keys.includes("objectStorage"),
    ).toBe(true);
  });
});
