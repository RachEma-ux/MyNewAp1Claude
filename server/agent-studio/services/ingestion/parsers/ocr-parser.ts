/**
 * OCR parser — D-UI-5 follow-up D4, locked by `D-PARSE-OCR-1..4` in
 * `docs/architecture/agent-studio-ocr-parser.md`.
 *
 * Each successful OCR call produces one `extracted_artifact` unit
 * (D-NKU-2) carrying the worker's plain-text transcription plus
 * `engine` + `confidence` in the structured shape.
 *
 * Engine binding: the existing `data-acquisition` worker's `/ocr`
 * endpoint (D-PARSE-OCR-1). The worker is ops-deployed, workspace-
 * shared, no per-workspace credential binding (D-PARSE-OCR-2).
 *
 * Graceful degradation: parser is always registered for deterministic
 * boot, but `parse()` consults a 30-second TTL cache of the worker's
 * health probe; when the worker is unhealthy the parser throws
 * `UnsupportedContentTypeError` and the dispatcher records the job as
 * `status="unsupported_type"` (D-PARSE-OCR-3). When the worker
 * recovers the next call after the TTL transparently routes again.
 *
 * Wire contract (D-PARSE-OCR-4): POST {workerUrl}/ocr with
 * `multipart/form-data` carrying `file` (image bytes) + `contentType`,
 * response is `{ text: string, confidence?: number, engine?: string }`.
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

const SUPPORTED_IMAGE_TYPES: ReadonlyArray<string> = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/tiff",
  "image/webp",
  "image/gif",
];

const DEFAULT_HEALTH_TTL_MS = 30_000;

interface OcrWorkerResponse {
  text?: unknown;
  confidence?: unknown;
  engine?: unknown;
}

export interface OcrParserDeps {
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
 * Create an OCR parser bound to the supplied dependencies. The default
 * singleton (`ocrParser`) wires production deps; tests inject fakes
 * for `getStatus` + `fetchImpl`.
 */
export function createOcrParser(deps: OcrParserDeps = {}): Parser {
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
    key: "ocr",
    acceptsContentTypes: SUPPORTED_IMAGE_TYPES,

    async parse(artifact: RawArtifact): Promise<ParsedDocument> {
      const health = await readHealth();
      if (!health.healthy) {
        throw new UnsupportedContentTypeError(
          `${artifact.contentType} (OCR worker offline: ${health.message})`,
        );
      }

      const url = `${getWorkerUrl()}${dataAcquisitionWorkerContract.ocrPath}`;
      const form = new FormData();
      const filename = basename(artifact.sourceUri) ?? "upload";
      // Buffer's underlying ArrayBufferLike loses ArrayBuffer narrowing
      // under TS strictNullChecks; copy into a fresh Uint8Array so the
      // Blob constructor sees a plain BlobPart.
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
          partId: "ocr-1",
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
        parserKey: "ocr",
        fullText: text,
        parts,
        metadata: { engine, confidence },
      };
    },
  };
}

/** Reset the cached health state. Tests use this between cases. */
export function _resetOcrParserCacheForTests(parser: Parser): void {
  // The cache is closed over inside `createOcrParser`; tests that need
  // a clean slate should construct a fresh parser instance via
  // `createOcrParser({ cacheTtlMs: 0 })` rather than reaching into
  // module state. This export is a stub for symmetry with other parser
  // modules that ship a reset hook.
  void parser;
}

function basename(uri: string | null): string | null {
  if (!uri) return null;
  const m = uri.match(/[^\/?#]+(?=[?#]|$)/);
  return m ? m[0] : null;
}

/** Production singleton — wired with the data-acquisition worker deps. */
export const ocrParser: Parser = createOcrParser();
