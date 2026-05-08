/**
 * OCR-PDF parser — D-UI-5 follow-up R6, locked by `D-PARSE-OCRPDF-1..4`
 * in `docs/architecture/agent-studio-ocr-pdf-parser.md`.
 *
 * Routes `application/pdf` artifacts through the data-acquisition
 * worker's `/ocr` endpoint when the operator explicitly opts in via
 * `IngestionJobRequest.parserKey="ocr_pdf"`. Default content-type
 * dispatch still hits `basic-pdf-parser` (text extraction); OCR-PDF is
 * an operator-driven retry path for scanned PDFs that text extraction
 * silently dropped.
 *
 * The shape mirrors `ocr-parser.ts` exactly: factory + production
 * singleton, 30s TTL health cache, throws `UnsupportedContentTypeError`
 * when the worker is unhealthy (D-PARSE-OCRPDF-3), produces one
 * `extracted_artifact` unit per non-empty OCR result (D-PARSE-OCRPDF-4).
 */

import type { Parser, ParsedDocument, ParsedPart, RawArtifact } from "../types";
import { UnsupportedContentTypeError } from "../types";
import {
  dataAcquisitionWorkerContract,
  getDataAcquisitionWorkerStatus,
  getDataAcquisitionWorkerUrl,
} from "../../../../data-analysis/data-acquisition/dataAcquisition.worker";
import type { DataAcquisitionWorkerStatus } from "../../../../data-analysis/data-acquisition/dataAcquisition.contracts";
import { DATA_ACQUISITION_WORKER_TIMEOUT_MS } from "../../../../data-analysis/data-acquisition/dataAcquisition.constants";

const ACCEPTS = ["application/pdf"] as const;

const DEFAULT_HEALTH_TTL_MS = 30_000;

interface OcrWorkerResponse {
  text?: unknown;
  confidence?: unknown;
  engine?: unknown;
}

export interface OcrPdfParserDeps {
  /** Probe the OCR worker's health. Default uses the data-acquisition module. */
  getStatus?: () => Promise<DataAcquisitionWorkerStatus>;
  /** HTTP fetch impl. Default `globalThis.fetch`. Override in tests. */
  fetchImpl?: typeof fetch;
  /** Resolves the worker base URL. Default reads `DATA_ACQUISITION_WORKER_URL`. */
  getWorkerUrl?: () => string;
  /** Health-cache TTL in ms. Default 30 000. Tests use 0 to force re-probe. */
  cacheTtlMs?: number;
  /** Per-call timeout. Default matches the worker's own probe timeout. */
  requestTimeoutMs?: number;
}

/**
 * Create an OCR-PDF parser bound to the supplied dependencies. The
 * default singleton (`ocrPdfParser`) wires production deps; tests
 * inject fakes for `getStatus` + `fetchImpl`.
 */
export function createOcrPdfParser(deps: OcrPdfParserDeps = {}): Parser {
  const getStatus = deps.getStatus ?? getDataAcquisitionWorkerStatus;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const getWorkerUrl = deps.getWorkerUrl ?? getDataAcquisitionWorkerUrl;
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_HEALTH_TTL_MS;
  const requestTimeoutMs =
    deps.requestTimeoutMs ?? DATA_ACQUISITION_WORKER_TIMEOUT_MS;

  let cached: { status: DataAcquisitionWorkerStatus; expiresAt: number } | null =
    null;

  async function readHealth(): Promise<DataAcquisitionWorkerStatus> {
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.status;
    const status = await getStatus();
    cached = { status, expiresAt: now + cacheTtlMs };
    return status;
  }

  return {
    key: "ocr_pdf",
    acceptsContentTypes: ACCEPTS,

    async parse(artifact: RawArtifact): Promise<ParsedDocument> {
      const health = await readHealth();
      if (!health.healthy) {
        throw new UnsupportedContentTypeError(
          `${artifact.contentType} (OCR worker offline: ${health.message})`,
        );
      }

      const url = `${getWorkerUrl()}${dataAcquisitionWorkerContract.ocrPath}`;
      const form = new FormData();
      const filename = basename(artifact.sourceUri) ?? "upload.pdf";
      const bodyBytes = new Uint8Array(artifact.bytes);
      form.append(
        "file",
        new Blob([bodyBytes], { type: artifact.contentType }),
        filename,
      );
      form.append("contentType", artifact.contentType);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        throw new Error(
          `OCR worker responded ${response.status} ${response.statusText}`,
        );
      }

      const body = (await response.json()) as OcrWorkerResponse;
      if (typeof body.text !== "string") {
        throw new Error("OCR worker response missing required 'text' field");
      }

      const text = body.text;
      const confidence =
        typeof body.confidence === "number" ? body.confidence : null;
      const engine = typeof body.engine === "string" ? body.engine : "unknown";

      const parts: ParsedPart[] = [];
      if (text.length > 0) {
        parts.push({
          partId: "ocr-pdf-1",
          text,
          unitTypeHint: "extracted_artifact",
          json: {
            engine,
            confidence,
            contentType: artifact.contentType,
          },
        });
      }

      return {
        parserKey: "ocr_pdf",
        fullText: text,
        parts,
        metadata: { engine, confidence },
      };
    },
  };
}

function basename(uri: string | null): string | null {
  if (!uri) return null;
  const m = uri.match(/[^\/?#]+(?=[?#]|$)/);
  return m ? m[0] : null;
}

/** Production singleton — wired with the data-acquisition worker deps. */
export const ocrPdfParser: Parser = createOcrPdfParser();
