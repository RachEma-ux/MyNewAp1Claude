# Agent Studio OCR Parser — ADR

**Owner:** Agent Studio module + Data Acquisition subdomain
**Phase:** Retrofit follow-up D4 (additional MVP parsers)
**Status:** Adopted 2026-05-06
**Authority:** Locks the engine binding, contract, and graceful-degradation pattern for the OCR parser introduced under Universal Ingestion (D-UI-5). Cited as **D-PARSE-OCR-1..4**.

---

## 1. Why this document exists

The Agent Studio retrofit's follow-up §D4 deferred OCR/audio/video parsers behind four sharp acceptance criteria (see `docs/implementation/agent-studio-retrofit-followups.md` §D4). The first is:

> A `D-PARSE-EXTRACT-N` decision record that picks the engine (or per-workspace binding model) and locks the graceful-degradation contract: when the engine is unavailable, does the parser fail, return a `parserKey: "<x>", parts: []` shape with a metadata warning, or refuse registration entirely?

This ADR satisfies that criterion for the OCR parser. It picks the engine, the wire contract, the registration semantics, and the failure mode — so the parser implementation that follows is mechanical.

---

## 2. Decision summary

| ID | Decision | One-line rationale |
|---|---|---|
| **D-PARSE-OCR-1** | OCR engine binding is the existing `data-acquisition` worker's `/ocr` endpoint. | The contract is already declared in `dataAcquisition.worker.ts`; the retrofit parser becomes the first JS consumer rather than a parallel surface. |
| **D-PARSE-OCR-2** | No per-workspace credential binding row. The worker is ops-deployed and workspace-shared (single `DATA_ACQUISITION_WORKER_URL` env var). | The worker is a backend service, not a per-tenant cloud vendor; D-EMB-1's per-source binding pattern doesn't apply. |
| **D-PARSE-OCR-3** | Parser is always registered (deterministic boot), but throws `UnsupportedContentTypeError` from `parse()` when `getDataAcquisitionWorkerStatus()` reports `healthy: false`. The dispatcher catches the throw and records the job as `status="unsupported_type"`. | Always-registered keeps boot deterministic and lets the parser recover automatically when the worker comes back; throwing a typed error keeps the observable failure mode identical to a missing parser. |
| **D-PARSE-OCR-4** | Wire contract: POST `/ocr` with `multipart/form-data` (`file` field + `contentType`), response is `{ text: string, confidence?: number, engine?: string }`. | Multipart is conventional for binary upload to OCR services; the response is the minimum viable surface — the parser doesn't depend on richer fields. |

---

## 3. Engine binding (D-PARSE-OCR-1)

### 3.1 Path considered

Three real options were on the table when this ADR was drafted:

| Option | Engine | Why considered | Why rejected (or accepted) |
|---|---|---|---|
| **A** *(adopted)* | Bridge to `data-acquisition` worker `/ocr` | Existing contract, declared health probing, fallback-chain language already present (`tesseract` → `paddleocr` → `llamaparse`) | Adopted — see §3.2 |
| B | `tesseract.js` in-process | No external service; fully self-contained | ~15–30 MB language data files; CPU-heavy; substantially slower than native tesseract; would block node thread or require `worker_threads` boilerplate the rest of the parser registry does not have |
| C | Cloud vision API (Google Vision / AWS Textract / OpenAI vision) | Best quality + speed | Per-workspace credential binding required (mirrors D-EMB-1); cost gate; privacy gate; new credential infrastructure |

### 3.2 Why Option A

1. **Contract already exists.** `dataAcquisitionWorkerContract.ocrPath = "/ocr"` was declared in retrofit-pre work; the path, health probe, and `workerUnavailable`/`workerRecovered` event taxonomy are already locked. The retrofit OCR parser becomes the **first** JS consumer of an already-blueprinted endpoint.
2. **No new architectural surface.** Workspace-shared, ops-deployed worker; no per-workspace credentials; no new secrets table. The parser is a thin HTTP client.
3. **Fits the deferral spec.** Criterion #3 in the D4 deferral spec said "per-workspace binding row mirroring D-EMB-1 **when the engine is a remote provider**" — Option A's worker is not a remote provider in the credential-bound sense, so no binding row is required.
4. **Falls back to existing degradation.** Health probing already emits transitions on the event bus; the dispatcher already knows how to handle `unsupported_type`. No new observability machinery.

---

## 4. Graceful degradation (D-PARSE-OCR-3)

### 4.1 Refusal-on-unhealthy, not silent empty

A parser that registers unconditionally and returns `parts: []` when the worker is down would mask outages — the operator sees zero `extracted_artifact` units and assumes the source has no extractable text. Throwing `UnsupportedContentTypeError` from `parse()` makes the failure observable: jobs land as `status="unsupported_type"` with a clear "OCR worker offline" message, and once the worker recovers (the existing `workerRecovered` event fires), subsequent jobs route normally.

### 4.2 Health-probe cadence

The parser caches the worker health locally with a 30-second TTL. The first OCR parse after a cache expiry re-probes; subsequent calls within the TTL reuse the cached result. This bounds the worker-side health load to ~2 probes/minute regardless of OCR throughput, while keeping recovery time within ~30 seconds when the worker comes back.

### 4.3 Dispatcher coupling

The Universal Ingestion dispatcher (`universal-ingestion-service.ts`) wraps `parser.parse()` in a try/catch for `UnsupportedContentTypeError` so a parse-time refusal lands as `status="unsupported_type"` — the same code path used by parser-selection failures. This is a deliberate widening of the existing catch added as part of D-PARSE-OCR-3; it costs one extra try/catch and unifies the failure surface.

### 4.4 What "unhealthy" means

Per `dataAcquisition.worker.ts`:
- **reachable + 2xx** → `healthy: true`
- **reachable + non-2xx** → `healthy: false`
- **unreachable / timeout** → `healthy: false`

The parser treats `healthy: false` as "not registered." Operators investigate via the existing data-acquisition worker status surface (`DataAcquisitionWorkerStatus` UI banner).

---

## 5. Wire contract (D-PARSE-OCR-4)

### 5.1 Request

```
POST {DATA_ACQUISITION_WORKER_URL}/ocr
Content-Type: multipart/form-data; boundary=...

--boundary
Content-Disposition: form-data; name="file"; filename="<sourceUri-basename>"
Content-Type: <artifact.contentType>
<binary bytes>
--boundary
Content-Disposition: form-data; name="contentType"

<artifact.contentType>
--boundary--
```

### 5.2 Response

```jsonc
{
  "text": "extracted text content",   // required
  "confidence": 0.85,                  // optional, 0..1
  "engine": "tesseract"                // optional — informational
}
```

The parser depends only on `text`. `confidence` and `engine` flow into the `ParsedPart.json` metadata for downstream observability but are not semantically required.

### 5.3 Timeouts

The parser uses the same `DATA_ACQUISITION_WORKER_TIMEOUT_MS` constant the health probe uses. OCR runs are bounded by that timeout; longer-running OCR is a worker-side scaling concern, not a parser concern.

### 5.4 Errors

- HTTP non-2xx → parser throws — the ingestion dispatcher catches and records `status="parser_error"` per D-UI-5.
- Missing `text` field → parser throws — same path.
- Empty `text` → parser returns `parts: []` (legitimate "image had no readable text").

---

## 6. Output shape

Each successful OCR call produces **one** `extracted_artifact` unit (D-NKU-2):

```ts
{
  partId: "ocr-1",
  text: <response.text>,
  unitTypeHint: "extracted_artifact",
  json: {
    engine: <response.engine | "unknown">,
    confidence: <response.confidence | null>,
    contentType: <artifact.contentType>,
  },
}
```

The full document text mirror is also `response.text`. No multi-block segmentation in MVP — when the worker grows section-aware OCR (currently undefined in its contract), we revisit `parts` segmentation.

---

## 7. Supported content types

```
image/png
image/jpeg
image/jpg
image/tiff
image/webp
image/gif
```

These are the formats `tesseract` and `paddleocr` support natively. PDF-with-images is **out of scope** — that path goes through `basic-pdf-parser` which extracts embedded text; if a future scanned-PDF parser needs OCR, it composes the basic-pdf-parser + this OCR parser at the dispatcher level (a future ADR).

---

## 8. Test strategy

Unit tests cover both the engine-up and engine-down paths via injected fakes:

- **Health gate**: `registerOcrParser({ getStatus, fetchImpl })` accepts injected dependencies. Default uses `getDataAcquisitionWorkerStatus` + `globalThis.fetch`; tests pass fakes.
- **Engine-up happy path**: fake `fetchImpl` returns `{ text, confidence }` JSON; assert one `extracted_artifact` unit with the right shape.
- **Engine-down**: fake `getStatus` returns `healthy: false`; `selectParserForContentType("image/png")` throws `UnsupportedContentTypeError`.
- **Worker error**: fake `fetchImpl` returns 500; parser throws — dispatcher records `parser_error`.
- **Empty text**: fake `fetchImpl` returns `{ text: "" }`; parser returns `parts: []`.

Engine-down test coverage satisfies criterion #4 of the D4 deferral spec ("Acceptance test coverage for the engine-down path, not just the happy path").

---

## 9. What this ADR does *not* cover

- **The Python worker implementation.** That lives outside this repo. This ADR specifies what the JS parser expects from `/ocr`; the worker honoring that contract is a separate engineering responsibility.
- **Audio / video parsers.** Those are still deferred behind their own future `D-PARSE-AUDIO-N` / `D-PARSE-VIDEO-N` ADRs. The audio path likely picks Option C (Whisper API + per-workspace binding) since `voiceTranscription.ts` already wraps that surface. Video is downstream of audio + ffmpeg.
- **PDF-with-images.** Out of scope; see §7.
- **Multi-language OCR.** The worker contract carries `language` as future scope; the parser does not pass a language hint today (worker auto-detects).

---

## 10. Cross-references

- `docs/implementation/agent-studio-retrofit-followups.md` §D4 — the deferral spec this ADR closes.
- `docs/architecture/agent-studio-universal-data-ingestion.md` D-UI-5 — the parser contract this implementation honors.
- `docs/architecture/agent-studio-normalized-knowledge-unit.md` D-NKU-2 — `extracted_artifact` unit type.
- `server/data-analysis/data-acquisition/dataAcquisition.worker.ts` — the worker contract this parser binds to.
