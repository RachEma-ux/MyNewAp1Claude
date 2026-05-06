/**
 * Follow-up D4 — OCR parser unit tests.
 *
 * Locks the OCR parser's contract per `D-PARSE-OCR-1..4`:
 *   - Engine-up: POST `/ocr` with multipart, response → one
 *     `extracted_artifact` unit.
 *   - Engine-down: throws `UnsupportedContentTypeError` (dispatcher
 *     surfaces as `status="unsupported_type"`).
 *   - Worker non-2xx: throws (dispatcher records as parser_error path).
 *   - Empty text response: `parts: []` (legitimate "no readable text").
 *   - Confidence + engine fields are forwarded into json metadata.
 *   - Health probe is cached with a TTL; recovery happens after expiry.
 *
 * The parser is exercised via the `createOcrParser` factory with
 * injected `getStatus` + `fetchImpl` fakes — no live worker required.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createOcrParser } from "../../server/agent-studio/services/ingestion/parsers/ocr-parser";
import { UnsupportedContentTypeError } from "../../server/agent-studio/services/ingestion/types";
import type { RawArtifact } from "../../server/agent-studio/services/ingestion/types";
import type { DataAcquisitionWorkerStatus } from "../../server/data-analysis/data-acquisition/dataAcquisition.contracts";

function imageArtifact(contentType = "image/png"): RawArtifact {
  return {
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG magic prefix
    contentType,
    sourceUri: "memory://scan.png",
    contentHash: "0".repeat(64),
  };
}

function status(healthy: boolean, message = ""): DataAcquisitionWorkerStatus {
  return {
    healthy,
    url: "http://localhost:8485",
    message: message || (healthy ? "ok" : "unreachable"),
    lastCheckedAt: Date.now(),
    capabilities: ["ocr"],
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("ocrParser — engine-up happy path", () => {
  it("emits one extracted_artifact unit with text + json metadata", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        text: "Hello, world.",
        confidence: 0.92,
        engine: "tesseract",
      }),
    );
    const parser = createOcrParser({
      getStatus: async () => status(true),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getWorkerUrl: () => "http://localhost:8485",
      cacheTtlMs: 0,
    });

    const r = await parser.parse(imageArtifact());
    expect(r.parserKey).toBe("ocr");
    expect(r.fullText).toBe("Hello, world.");
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].unitTypeHint).toBe("extracted_artifact");
    expect(r.parts[0].text).toBe("Hello, world.");
    expect(r.parts[0].json).toMatchObject({
      engine: "tesseract",
      confidence: 0.92,
      contentType: "image/png",
    });
    expect(r.metadata).toMatchObject({ engine: "tesseract", confidence: 0.92 });
  });

  it("hits the worker's /ocr endpoint with multipart form data", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ text: "x" }));
    const parser = createOcrParser({
      getStatus: async () => status(true),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getWorkerUrl: () => "http://worker:9000",
      cacheTtlMs: 0,
    });
    await parser.parse(imageArtifact());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://worker:9000/ocr");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  it("treats missing confidence/engine as null/unknown — text is the only required field", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ text: "minimal" }));
    const parser = createOcrParser({
      getStatus: async () => status(true),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheTtlMs: 0,
    });
    const r = await parser.parse(imageArtifact());
    expect(r.parts[0].json).toMatchObject({
      engine: "unknown",
      confidence: null,
    });
  });

  it("returns parts: [] when worker reports empty text (legit no-readable-text case)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ text: "" }));
    const parser = createOcrParser({
      getStatus: async () => status(true),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheTtlMs: 0,
    });
    const r = await parser.parse(imageArtifact());
    expect(r.parts).toEqual([]);
    expect(r.fullText).toBe("");
  });
});

describe("ocrParser — engine-down (D-PARSE-OCR-3)", () => {
  it("throws UnsupportedContentTypeError when worker is unhealthy", async () => {
    const parser = createOcrParser({
      getStatus: async () => status(false, "Worker unreachable"),
      fetchImpl: vi.fn() as unknown as typeof fetch,
      cacheTtlMs: 0,
    });
    await expect(parser.parse(imageArtifact())).rejects.toBeInstanceOf(
      UnsupportedContentTypeError,
    );
  });

  it("does not call the worker when health is unhealthy", async () => {
    const fetchImpl = vi.fn();
    const parser = createOcrParser({
      getStatus: async () => status(false, "down"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheTtlMs: 0,
    });
    await expect(parser.parse(imageArtifact())).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("error message includes the worker's failure reason for operator triage", async () => {
    const parser = createOcrParser({
      getStatus: async () => status(false, "probe timed out after 1500 ms"),
      fetchImpl: vi.fn() as unknown as typeof fetch,
      cacheTtlMs: 0,
    });
    try {
      await parser.parse(imageArtifact());
      throw new Error("expected throw");
    } catch (e) {
      expect((e as Error).message).toContain("probe timed out");
    }
  });
});

describe("ocrParser — worker error responses", () => {
  it("throws when worker returns non-2xx (so dispatcher records parser_error)", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("internal error", {
          status: 500,
          statusText: "Internal Server Error",
        }),
    );
    const parser = createOcrParser({
      getStatus: async () => status(true),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheTtlMs: 0,
    });
    await expect(parser.parse(imageArtifact())).rejects.toThrow(/500/);
  });

  it("throws when response is missing the required `text` field", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ confidence: 0.5 }));
    const parser = createOcrParser({
      getStatus: async () => status(true),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheTtlMs: 0,
    });
    await expect(parser.parse(imageArtifact())).rejects.toThrow(/text/);
  });
});

describe("ocrParser — health cache TTL (D-PARSE-OCR-3 §4.2)", () => {
  let probeCount = 0;
  let probeReturns: DataAcquisitionWorkerStatus = status(true);

  beforeEach(() => {
    probeCount = 0;
    probeReturns = status(true);
  });

  function makeParser(cacheTtlMs: number) {
    return createOcrParser({
      getStatus: async () => {
        probeCount += 1;
        return probeReturns;
      },
      fetchImpl: (async () => jsonResponse({ text: "ok" })) as unknown as typeof fetch,
      cacheTtlMs,
    });
  }

  it("probes once across multiple calls within the TTL window", async () => {
    const parser = makeParser(60_000);
    await parser.parse(imageArtifact());
    await parser.parse(imageArtifact());
    await parser.parse(imageArtifact());
    expect(probeCount).toBe(1);
  });

  it("re-probes when cacheTtlMs is 0 (each call is fresh)", async () => {
    const parser = makeParser(0);
    await parser.parse(imageArtifact());
    await parser.parse(imageArtifact());
    expect(probeCount).toBe(2);
  });

  it("recovery: after a cache flip from unhealthy to healthy, next call routes normally", async () => {
    const parser = makeParser(0);
    probeReturns = status(false, "down");
    await expect(parser.parse(imageArtifact())).rejects.toBeInstanceOf(
      UnsupportedContentTypeError,
    );
    probeReturns = status(true);
    const r = await parser.parse(imageArtifact());
    expect(r.parts).toHaveLength(1);
    expect(probeCount).toBe(2);
  });
});

describe("ocrParser — supported content types", () => {
  it("registers all 6 image MIMEs in `acceptsContentTypes`", () => {
    const parser = createOcrParser();
    expect(parser.acceptsContentTypes).toEqual(
      expect.arrayContaining([
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/tiff",
        "image/webp",
        "image/gif",
      ]),
    );
  });

  it("parser key is `ocr`", () => {
    expect(createOcrParser().key).toBe("ocr");
  });
});
