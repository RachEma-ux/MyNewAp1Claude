# Agent Studio Universal Data Ingestion — ADR

**Owner:** Agent Studio module
**Phase:** 1 (Retrofit ADRs)
**Status:** Adopted — drives Phases 2–4
**Authority:** Locked design contract for the Universal Ingestion subsystem.

---

## 1. Problem statement

Today the repo has fragmented ingestion paths:

- `server/agent-studio/services/rac/ingestion/` — `dispatcher.ts` + adapter stubs (`graphrag-adapter.ts`, `local-pgvector-adapter.ts`).
- `server/catalog-import/file-parser.ts` — narrow parser for the skill-catalog import flow.
- `server/data-analysis/data-acquisition/pipelines/document/parserRouter.ts` — separate parser router for the data-acquisition pipeline.
- `server/documents/` — file upload + chunking pipeline for the existing document store.

There is no unified contract for "given an artifact, produce a normalized knowledge unit with provenance, permission context, and freshness state". Each pipeline invents its own normalization rules; nothing prevents raw artifacts from being injected into prompts; permission and freshness are implicit at best.

This ADR locks a single Universal Ingestion contract that every parser/normalizer/extractor implements.

---

## 2. Decisions

### D-UI-1 — Universal Ingestion is a layered contract, not a monolithic service

The contract has four layers; each is a registry, not a hardcoded list:

```
SourceConnector → Parser → Normalizer → Extractor
```

- **SourceConnector**: knows how to fetch raw artifacts (file upload, URL, MCP source, future: S3 / Drive / Slack). Returns a `RawArtifact` with bytes + content-type + source URL.
- **Parser**: turns `RawArtifact` into a structured intermediate (`ParsedDocument`) — typically text + structure tree (sections, headings, code blocks, tables). One parser per content-type family.
- **Normalizer**: turns `ParsedDocument` into one or more `NormalizedKnowledgeUnit` records (the persistent, retrievable shape). Splits structure into chunkable units; preserves source location.
- **Extractor**: optional — pulls structured data from a unit (e.g., extract code blocks, extract tables, extract URLs). Adds extraction results as sibling rows.

### D-UI-2 — Every NormalizedKnowledgeUnit MUST carry three context fields

No exceptions:

- **Provenance** (`ProvenanceRecord`) — where the unit came from: source connector id, parser id, normalizer id, raw artifact hash, ingestion job id, ingested-at timestamp.
- **Permission context** — workspace id (always), and either an explicit ACL ref or a sentinel for "inherits from source connector". The retrieval planner uses this to filter at query time.
- **Freshness state** — `fresh | stale | expired`, plus a `last_validated_at` timestamp. The data validation service (D-UI-4) flips state on schedule or on adapter callback.

A unit without all three is a contract violation. The KnowledgeUnitService MUST reject `insertUnit({...})` calls that omit any of them.

### D-UI-3 — Raw artifacts are NOT injected into prompts by default

The composer (Phase 6) consumes only `NormalizedKnowledgeUnit` rows (or chunks derived from them). The `RawArtifact` rows are stored in `agsIngestionArtifacts` for audit / re-parse, but they are NOT directly retrievable through the planner. A Phase 9 governance toggle can override (e.g., "this agent is allowed to see raw HTML"); without that override the boundary is hard.

### D-UI-4 — Data validation runs at ingestion time, not at retrieval time

`DataValidationService` runs against each unit on insert:

- Required fields present (provenance, permission, freshness).
- No PII per the configured policy (`piiPolicy ∈ {none, warn, block}` on the source row).
- License compliance per the configured policy (`licensePolicy`).
- Schema validation for structured units (JSON, table rows).

Validation results land in `agsDataValidationResults` (Phase 2 schema). On `block`, the unit is persisted with `validationStatus="blocked"` and the planner skips it. On `warn`, the unit is included but the trace records the warning.

Running validation at retrieval time (per query) was rejected: it duplicates work for every chunk every query, and it makes deterministic reasoning harder.

### D-UI-5 — Six MVP parsers ship in Phase 3

| Parser | Content type | Notes |
|---|---|---|
| TextParser | `text/plain` | UTF-8 only; chunk by paragraph |
| MarkdownParser | `text/markdown` | Preserves heading structure; code blocks become sibling units |
| HtmlSnapshotParser | `text/html` | Strips scripts/styles; preserves anchors for citations |
| JsonParser | `application/json` | Treats top-level keys as units; arrays expanded |
| BasicPdfTextParser | `application/pdf` | Text only, no OCR; page-level chunking |
| BasicCodeFileParser | `text/x-{lang}` | Per-function or per-class units; preserves imports |

Future parsers (DOCX) are deferred. Unsupported content types fail safely: `IngestionJobService` records the job with `status="unsupported_type"` and the user sees a clear error.

**Amended 2026-05-06 (follow-up §D4):** five additional parsers shipped after the initial six and are now in `registerDefaultParsers()` — `csv`, `xlsx`, `ocr`, `audio`, `video`. The decision logic for each engine-bound parser (OCR / audio / video) is locked in its own ADR (`agent-studio-ocr-parser.md`, `agent-studio-audio-parser.md`, `agent-studio-video-parser.md`); CSV and xlsx are in-process and need no separate ADR. The retrofit ships **11 parsers total**, not the original six. The "future parsers (DOCX...)" deferral still stands for shapes the §D4 follow-ups did not cover.

**Amended 2026-05-06 (dispatcher widening for engine-bound parsers):** the original D-UI-5 promise — "unsupported content types fail safely as `status='unsupported_type'`" — was implemented as a try/catch around parser **selection** only. The §D4 follow-ups added four engine-bound parsers (OCR, audio, video, pgvector) that register their content types unconditionally but throw `UnsupportedContentTypeError` from `parse()` when their engine is unhealthy (D-PARSE-OCR-3 / -AUDIO-3 / -VIDEO-3 / -PGVECTOR-3). The dispatcher (`universal-ingestion-service.ts`) was widened to catch parse-time `UnsupportedContentTypeError` so engine-down scenarios surface as the same `status="unsupported_type"` operators already understand from missing-parser scenarios. Single shared try/catch covers all current and future engine-bound parsers; no per-parser dispatcher change needed.

### D-UI-6 — Ingestion never executes tools

The Universal Ingestion path consumes raw artifacts and produces normalized units. It MUST NOT invoke MCP tools, MUST NOT call out to the OpenRouter / model layer, MUST NOT trigger any agent runtime path. The only side effects are DB writes (units, provenance, jobs, artifacts, validation results).

---

## 3. Consequences

- **Downstream phases are unblocked.** Phase 4 wires units into the existing RAC retrieval; Phase 8's `ProposedToolCall` evidence references `knowledgeUnitIds` that are guaranteed to be unit IDs from this contract.
- **Existing pipelines are not deleted in this retrofit.** `server/data-analysis/.../parserRouter.ts` and `server/catalog-import/file-parser.ts` continue to work for their narrow purposes; a follow-up phase can migrate them onto Universal Ingestion if the cost/benefit justifies it.
- **Validation is upfront.** Ingestion time is more expensive; retrieval time is cheaper and more deterministic. This is the right tradeoff for a governance-sensitive system.
- **Six parsers is enough for MVP — eleven shipped post-MVP.** The original deferred set was DOCX / audio / video / OCR-PDF. §D4 follow-ups closed audio + video + image-OCR (and added CSV + xlsx); DOCX and OCR-PDF remain deferred. See `docs/implementation/agent-studio-retrofit-followups.md` §D4 for the closure record.

---

## 4. Acceptance

- [x] Four-layer contract locked (SourceConnector → Parser → Normalizer → Extractor).
- [x] Three required context fields locked (provenance, permission, freshness).
- [x] Raw-artifact prompt injection prohibited by default.
- [x] Validation runs at ingestion, not retrieval.
- [x] Six MVP parsers enumerated.
- [x] Tool execution prohibited.
- [ ] Schema for `agsKnowledgeUnits`, `agsProvenanceRecords`, `agsIngestionJobs`, `agsIngestionArtifacts`, `agsDataValidationResults`, `agsExtractionResults` lands in Phase 2.
- [ ] Service implementations (`UniversalIngestionService`, registries, `KnowledgeUnitService`, `ProvenanceService`, `DataValidationService`, `IngestionJobService`) land in Phase 3.
- [ ] Six MVP parsers implemented + tested in Phase 3.
- [ ] KB retrieval integration lands in Phase 4.
