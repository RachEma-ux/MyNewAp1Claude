# Agent Studio — OCR-PDF Parser ADR

**Status:** Locked 2026-05-08 (R6 of the post-RAC audit closure)

**Closes:** Last open item from D-UI-5's deferred-parser set
(`docs/architecture/agent-studio-roadmap-delta.md` §"Deferred Scope").

**Pattern:** §D4 — same shape as the audio / video / OCR parsers locked
in `D-PARSE-AUDIO-1..4`, `D-PARSE-VIDEO-1..4`, `D-PARSE-OCR-1..4`.

---

## Context

`basic-pdf-parser` (D-UI-5 MVP parser #5) extracts text from PDFs via
the local `pdf-parse` dependency. Its own docstring records the gap:

> Multi-page PDFs that produce no text on a page (e.g., scanned image
> pages without OCR) are skipped silently — the operator can see the
> gap in the UI and request OCR re-processing in a follow-up.

The follow-up never landed. Scanned PDFs (board-meeting minutes saved
as image-only scans, signed contracts, archival statements, etc.) are
silently dropped from retrieval. The audit closure summary lists this
as `R6`.

## Scope

A second parser keyed `ocr_pdf` that processes `application/pdf`
artifacts through OCR rather than text extraction. The default
content-type dispatch still hits `basic-pdf-parser`; OCR-PDF is reached
via the existing `IngestionJobRequest.parserKey` operator override
(D-UI-3 — already wired). No dispatcher changes.

## Decisions

### D-PARSE-OCRPDF-1 — Engine binding

Engine = the existing `data-acquisition` worker's `/ocr` endpoint
(same as `D-PARSE-OCR-1`). The worker accepts arbitrary
`multipart/form-data` payloads (`file` + `contentType`) and returns
`{ text, confidence?, engine? }`; it already handles `application/pdf`
internally (rasterize per page → OCR → concatenate).

Rationale: zero new infrastructure. The worker is ops-deployed,
workspace-shared, already health-probed, already in the OCR pipeline.
Routing PDF bytes through the same `/ocr` endpoint reuses every piece
of existing plumbing.

### D-PARSE-OCRPDF-2 — Credentials

No per-workspace credentials (same as `D-PARSE-OCR-2`). The worker is
authenticated at the network boundary; the parser passes the artifact
bytes through unmodified.

### D-PARSE-OCRPDF-3 — Failure modes

Same shape as `D-PARSE-OCR-3`:

- **Worker offline** (health probe failed) → parser throws
  `UnsupportedContentTypeError` carrying the worker's status message.
  Dispatcher records the job as `status="unsupported_type"`. Parser
  is **always registered** for deterministic boot.
- **Worker HTTP error** (non-2xx response) → parser throws regular
  `Error`. Dispatcher records the job as failed.
- **Malformed worker response** (missing `text`) → parser throws
  regular `Error`. Same handling as the OCR parser's malformed-body
  branch.

A 30-second TTL caches the health probe so back-to-back ingestion
jobs don't re-probe the worker on every artifact. Tests pass
`cacheTtlMs: 0` to force re-probe.

### D-PARSE-OCRPDF-4 — Output unit shape

The OCR worker returns a single text blob covering the whole PDF (page
splits are not preserved across the OCR pipeline). Output:

- One `extracted_artifact` unit (D-NKU-2) with `partId="ocr-pdf-1"`,
  carrying the full transcribed text and `{engine, confidence,
  contentType: "application/pdf"}` in `json`.
- `metadata.engine` and `metadata.confidence` mirror the unit's `json`
  for operator inspection at the document level.
- Truly empty OCR output (worker returned `""`) → `parts: []`. Same
  contract as the OCR parser.

Rationale: the existing `extracted_artifact` unit type already carries
OCR transcriptions for image artifacts (`D-NKU-2`); reusing it keeps
the unit-type catalog small. Per-page splitting would require either
worker-side changes (page-aware OCR response) or client-side
rasterization — both out of scope for R6.

### Operator workflow

1. Operator ingests a PDF through the default flow → `basic-pdf-parser`
   runs, emits zero or near-zero text → operator sees the gap in the
   ingestion-job UI.
2. Operator triggers a retry with `parserKey: "ocr_pdf"` from the
   retrofit page (the same surface that already lets operators flip
   license / clear PII findings).
3. Dispatcher uses `getParser("ocr_pdf")` (registry lookup) instead
   of content-type dispatch. New `extracted_artifact` unit lands in
   the KB with the OCR transcription.

This keeps OCR-PDF a *deliberate* operator action — it is materially
more expensive than text extraction, and the worker time / cost is
non-trivial. Auto-fallback is a candidate future enhancement once the
operator workflow has been observed in practice.

## Out of scope

- Per-page units. The OCR worker returns a single text blob; preserving
  page splits requires worker-side changes.
- Auto-fallback from `basic-pdf-parser` when text density is low.
  Operator-driven only at R6.
- Hybrid output (text-extracted pages + OCR-only pages). Either the
  whole PDF runs through OCR or it runs through `pdf-parse`; they don't
  combine.
- Local rasterization fallback when the worker is unavailable. The
  existing `UnsupportedContentTypeError` path is the contract.

## Tests

Unit tests use injected `fetchImpl` + `getStatus` (matches the OCR
parser pattern):

- Worker healthy + non-empty OCR result → one `extracted_artifact`
  unit; metadata propagates engine + confidence.
- Worker healthy + empty result → `parts: []`.
- Worker unhealthy → throws `UnsupportedContentTypeError`.
- Worker HTTP 500 → propagates regular `Error`.
- Worker malformed body (missing `text`) → propagates regular `Error`.
- Health cache: `cacheTtlMs: 0` re-probes; default TTL caches.
- Content-type registration claims `application/pdf` (so the parser
  is also reachable by content-type dispatch when registered ahead of
  `basic-pdf-parser` in alternate boot orders).

Acceptance test (`retrofit-acceptance`):
- Parser count 12 → 13.
- `selectParserForContentType("application/pdf")` still returns the
  text parser (registration order: `basic_pdf_text` first).
- `getParser("ocr_pdf")` returns the new parser.

## Implementation pointer

- Parser: `server/agent-studio/services/ingestion/parsers/ocr-pdf-parser.ts`
- Tests: `tests/agent-studio/ocr-pdf-parser.test.ts`
- Registry: `server/agent-studio/services/ingestion/parser-registry.ts`
  (registered after `basicPdfTextParser`).

## Status after R6

`docs/implementation/agent-studio-roadmap-delta.md` "Deferred Scope":
multi-region remains the only open item. All twelve original D-UI-5
parsers + DOCX (R5) + OCR-PDF (R6) ship.
