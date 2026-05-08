/**
 * R6 — OCR-PDF parser unit tests.
 *
 * Locks the OCR-PDF parser's contract per `D-PARSE-OCRPDF-1..4`:
 *   - Engine-up: POST `/ocr` with multipart, response → one
 *     `extracted_artifact` unit (D-PARSE-OCRPDF-4).
 *   - Engine-down: throws `UnsupportedContentTypeError` (dispatcher
 *     surfaces as `status="unsupported_type"`) (D-PARSE-OCRPDF-3).
 *   - Worker non-2xx / malformed body: throws regular `Error`.
 *   - Empty text response: `parts: []`.
 *   - Health probe is cached with a TTL; recovery happens after expiry.
 *   - Content-type registration: `application/pdf`; key: `ocr_pdf`.
 *
 * The parser is exercised via the `createOcrPdfParser` factory with
 * injected `getStatus` + `fetchImpl` fakes — no live worker required.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createOcrPdfParser } from "../../server/agent-studio/services/ingestion/parsers/ocr-pdf-parser";
import { UnsupportedContentTypeError } from "../../server/agent-studio/services/ingestion/types";
import type { RawArtifact } from "../../server/agent-studio/services/ingestion/types";
import type { DataAcquisitionWorkerStatus } from "../../server/data-analysis/data-acquisition/dataAcquisition.contracts";

function pdfArtifact(): RawArtifact {
  return {
    bytes: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]), // "%PDF-1.4"
    contentType: "application/pdf",
    sourceUri: "memory://scan.pdf",
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

describe("ocrPdfParser — engine-up happy path", () => {
  it("emits one extracted_artifact unit with text + json metadata (D-PARSE-OCRPDF-4)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        text: "Page one OCR.\n\nPage two OCR.",
        confidence: 0.87,
        engine: "tesseract",
      }),
    );
    const parser = createOcrPdfParser({
      getStatus: async () => status(true),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getWorkerUrl: () => "http://localhost:8485",
      cacheTtlMs: 0,
    });

    const r = await parser.parse(pdfArtifact());
    expect(r.parserKey).toBe("ocr_pdf");
    expect(r.fullText).toBe("Page one OCR.\n\nPage two OCR.");
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].partId).toBe("ocr-pdf-1");
    expect(r.parts[0].unitTypeHint).toBe("extracted_artifact");
    expect(r.parts[0].text).toBe("Page one OCR.\n\nPage two OCR.");
    expect(r.parts[0].json).toMatchObject({
      engine: "tesseract",
      confidence: 0.87,
      contentType: "application/pdf",
    });
    expect(r.metadata).toMatchObject({ engine: "tesseract", confidence: 0.87 });
  });

  it("hits the worker's /ocr endpoint with multipart form data carrying application/pdf", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ text: "x" }));
    const parser = createOcrPdfParser({
      getStatus: async () => status(true),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getWorkerUrl: () => "http://worker:9000",
      cacheTtlMs: 0,
    });
    await parser.parse(pdfArtifact());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://worker:9000/ocr");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  it("treats missing confidence/engine as null/unknown — text is the only required field", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ text: "minimal" }));
    const parser = createOcrPdfParser({
      getStatus: async () => status(true),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheTtlMs: 0,
    });
    const r = await parser.parse(pdfArtifact());
    expect(r.parts[0].json).toMatchObject({
      engine: "unknown",
      confidence: null,
    });
  });

  it("returns parts: [] when worker reports empty text (legit no-readable-text case)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ text: "" }));
    const parser = createOcrPdfParser({
      getStatus: async () => status(true),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheTtlMs: 0,
    });
    const r = await parser.parse(pdfArtifact());
    expect(r.parts).toEqual([]);
    expect(r.fullText).toBe("");
  });
});

describe("ocrPdfParser — engine-down (D-PARSE-OCRPDF-3)", () => {
  it("throws UnsupportedContentTypeError when worker is unhealthy", async () => {
    const parser = createOcrPdfParser({
      getStatus: async () => status(false, "Worker unreachable"),
      fetchImpl: vi.fn() as unknown as typeof fetch,
      cacheTtlMs: 0,
    });
    await expect(parser.parse(pdfArtifact())).rejects.toBeInstanceOf(
      UnsupportedContentTypeError,
    );
  });

  it("does not call the worker when health is unhealthy", async () => {
    const fetchImpl = vi.fn();
    const parser = createOcrPdfParser({
      getStatus: async () => status(false, "down"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheTtlMs: 0,
    });
    await expect(parser.parse(pdfArtifact())).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("error message includes the worker's failure reason for operator triage", async () => {
    const parser = createOcrPdfParser({
      getStatus: async () => status(false, "probe timed out after 1500 ms"),
      fetchImpl: vi.fn() as unknown as typeof fetch,
      cacheTtlMs: 0,
    });
    try {
      await parser.parse(pdfArtifact());
      throw new Error("expected throw");
    } catch (e) {
      expect((e as Error).message).toContain("probe timed out");
    }
  });
});

describe("ocrPdfParser — worker error responses", () => {
  it("throws when worker returns non-2xx (dispatcher records parser_error)", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("internal error", {
          status: 500,
          statusText: "Internal Server Error",
        }),
    );
    const parser = createOcrPdfParser({
      getStatus: async () => status(true),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheTtlMs: 0,
    });
    await expect(parser.parse(pdfArtifact())).rejects.toThrow(/500/);
  });

  it("throws when response is missing the required `text` field", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ confidence: 0.5 }));
    const parser = createOcrPdfParser({
      getStatus: async () => status(true),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheTtlMs: 0,
    });
    await expect(parser.parse(pdfArtifact())).rejects.toThrow(/text/);
  });
});

describe("ocrPdfParser — health cache TTL", () => {
  let probeCount = 0;
  let probeReturns: DataAcquisitionWorkerStatus = status(true);

  beforeEach(() => {
    probeCount = 0;
    probeReturns = status(true);
  });

  function makeParser(cacheTtlMs: number) {
    return createOcrPdfParser({
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
    await parser.parse(pdfArtifact());
    await parser.parse(pdfArtifact());
    await parser.parse(pdfArtifact());
    expect(probeCount).toBe(1);
  });

  it("re-probes when cacheTtlMs is 0 (each call is fresh)", async () => {
    const parser = makeParser(0);
    await parser.parse(pdfArtifact());
    await parser.parse(pdfArtifact());
    expect(probeCount).toBe(2);
  });

  it("recovery: after a cache flip from unhealthy to healthy, next call routes normally", async () => {
    const parser = makeParser(0);
    probeReturns = status(false, "down");
    await expect(parser.parse(pdfArtifact())).rejects.toBeInstanceOf(
      UnsupportedContentTypeError,
    );
    probeReturns = status(true);
    const r = await parser.parse(pdfArtifact());
    expect(r.parts).toHaveLength(1);
    expect(probeCount).toBe(2);
  });
});

describe("ocrPdfParser — registration", () => {
  it("registers application/pdf in acceptsContentTypes", () => {
    expect(createOcrPdfParser().acceptsContentTypes).toContain("application/pdf");
  });

  it("parser key is `ocr_pdf`", () => {
    expect(createOcrPdfParser().key).toBe("ocr_pdf");
  });
});
