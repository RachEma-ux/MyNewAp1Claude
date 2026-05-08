# Agent Studio DOCX Parser — ADR

**Owner:** Agent Studio module
**Phase:** Retrofit follow-up R5 (post-2026-05-08 audit greenfield)
**Status:** Adopted 2026-05-08
**Authority:** Locks the engine binding, contract, and graceful-degradation pattern for the DOCX parser. Cited as **D-PARSE-DOCX-1..4**.

---

## 1. Why this document exists

CLAUDE.md "Deferred Scope" originally listed DOCX + OCR-PDF parsers behind future `D-PARSE-DOCX-N` / `D-PARSE-OCRPDF-N` ADRs (the §D4 retrofit closure shipped CSV/xlsx/OCR/audio/video but left these two open). The 2026-05-08 RAC audit's R5 closure unblocks the DOCX parser per the §D4 ADR pattern. This ADR satisfies the four sharp acceptance criteria the §D4 spec lays down.

---

## 2. Decision summary

| ID | Decision | One-line rationale |
|---|---|---|
| **D-PARSE-DOCX-1** | DOCX engine = `mammoth` (npm, pure JS, MIT). | Pure-JS lib already in `node_modules` (1.11.0); no native deps; no external service to operate; same shape as `csv-parser` (built-in CSV) and `xlsx-parser` (`exceljs` lib). |
| **D-PARSE-DOCX-2** | No credential surface. Engine is local; no per-workspace or global API key. | Mirrors CSV/xlsx — local libs don't fit D-EMB-1's per-source binding; D-PARSE-AUDIO-2 only applies to engine-bound parsers (forge, OCR worker). |
| **D-PARSE-DOCX-3** | Parser registers always for deterministic boot. Malformed DOCX → throws regular `Error` (parser failure). The "engine unconfigured" branch from D-PARSE-OCR-3 / D-PARSE-AUDIO-3 does not apply (no engine to be unconfigured). | Local-engine parsers don't have a "refuse-on-unconfigured" path — there's no env to misset. Mammoth's `convertToHtml` already throws on invalid ZIP / corrupt OOXML; we let those propagate as parser failures, same as the JSON parser's `SyntaxError`. |
| **D-PARSE-DOCX-4** | Wire contract: `mammoth.convertToHtml({buffer})` for structured output + `mammoth.extractRawText({buffer})` for `fullText`. Output split into per-heading sections (h1–h6) → `markdown_section` units; documents without headings degrade to a single `text` unit. | Heading-anchored splitting matches how Markdown documents normalize into D-NKU-2 `markdown_section` units. Single-unit fallback preserves retrievability for memo-style docs without explicit structure. |

---

## 3. Engine binding (D-PARSE-DOCX-1)

### 3.1 Paths considered

| Option | Engine | Why considered | Why rejected (or accepted) |
|---|---|---|---|
| **A** *(adopted)* | `mammoth` (npm, pure JS) | Already installed; MIT-licensed; produces clean HTML / Markdown / raw text from DOCX; multi-megabyte files parse in milliseconds | Adopted — see §3.2 |
| B | LibreOffice / Pandoc subprocess | Highest-fidelity DOCX → Markdown conversion; handles tables, footnotes, embedded media | External binary dependency; introduces ops surface (install + version + sandbox) we don't have today; same ops cost as `ffmpeg` in `video-parser` but without the equivalent retrieval payoff for prose docs |
| C | Roll-our-own ZIP + XML parser | No external dep beyond what's already in node_modules | DOCX OOXML is rich (numbering, styles, headers, fields, embedded objects); reimplementing what `mammoth` already battle-tests is gratuitous; the §D4 §6 pattern explicitly favors "lean over the existing lib" |
| D | External worker (data-acquisition or forge) | Same shape as OCR / audio / video | DOCX parsing is CPU-bound and stateless; an external worker adds RTT + ops without a clear win. Forge bridge is appropriate when the engine is heavy (Whisper) or non-JS-native (ffmpeg) — neither applies here |

### 3.2 Why Option A

1. **Already in `node_modules`.** Version 1.11.0 is present on `main`. No new dependency to vet.
2. **Pure JS.** No native bindings, no CPU architecture sensitivity, runs anywhere Node runs (matches `csv-parser` / `xlsx-parser` shape).
3. **Clean output.** `mammoth.convertToHtml` produces standard HTML5 with semantic headings, paragraphs, lists, and tables; `extractRawText` produces clean Unicode text. Both are exactly what RAC retrieval consumes.
4. **MIT licensed.** Compatible with the platform's license posture.
5. **Battle-tested.** ~6M weekly npm downloads; primary author actively maintains.

---

## 4. Graceful degradation (D-PARSE-DOCX-3)

### 4.1 No engine-unconfigured path

Unlike OCR / audio / video, there is no remote engine to be unconfigured. The lib loads from disk; if `node_modules` is intact, the parser works. If a deployment somehow ships without `mammoth`, the parser crashes at *boot* (import failure) — that's a deploy bug, not a runtime degradation surface.

### 4.2 Parse-time failure modes

| Failure | Cause | Outcome |
|---|---|---|
| Not a valid ZIP | Bytes truncated, wrong content-type negotiated | Mammoth throws — parser propagates as regular `Error` → dispatcher records as parser failure |
| Valid ZIP but not OOXML / corrupt `word/document.xml` | Some other ZIP-based file mis-identified as DOCX | Same as above |
| Empty document (no headings, no paragraphs) | Author created and saved a blank `.docx` | Parser returns `parts: []` (legitimate "no content"); `fullText` is empty string |
| `.doc` (legacy binary format, pre-2007) | Operator uploaded a `.doc` thinking it would work | We do **not** register `application/msword` — selection falls through to `UnsupportedContentTypeError` |

### 4.3 Dispatcher coupling

No new try/catch needed in `universal-ingestion-service.ts`. The existing `UnsupportedContentTypeError` catch (added in D-PARSE-OCR-3) already covers this parser; it just won't fire because we don't register `.doc`.

---

## 5. Wire contract (D-PARSE-DOCX-4)

### 5.1 Engine calls

```ts
const html = await mammoth.convertToHtml({ buffer: artifact.bytes });
// html.value: HTML string (semantic headings, paragraphs, lists, tables)
// html.messages: Mammoth warnings (unparseable styles, etc.) — surfaced as ParsedDocument.metadata.warnings

const text = await mammoth.extractRawText({ buffer: artifact.bytes });
// text.value: plain text projection
// text.messages: same shape as above (we keep only one)
```

### 5.2 Section splitting

The HTML is parsed via `cheerio` (already a dep). We walk top-level `<body>` children:

- An `<h1>`–`<h6>` element starts a new section. The heading text is captured as the section's anchor.
- All non-heading elements between two headings are concatenated into the prior section's body.
- Pre-heading content (paragraphs before the first heading) becomes a leading "preamble" section with empty heading.
- A document with no headings produces zero sections at this stage; falls through to §5.3.

Each section becomes a `ParsedPart`:

```ts
{
  partId: `docx-section-${idx + 1}`,
  text: `${heading}\n\n${body}`.trim(),  // heading + body, separated
  unitTypeHint: "markdown_section",
  json: { heading, level, body },
  location: { selector: heading ? `#${slugify(heading)}` : null },
}
```

### 5.3 No-heading fallback

If the section walk produces zero sections (no headings AND no body content) but `fullText` is non-empty, emit one `text` unit:

```ts
{
  partId: "docx-text",
  text: fullText.trim(),
  unitTypeHint: "text",
}
```

This keeps memo-style and unstructured documents retrievable.

### 5.4 Empty document

If both the section walk AND the fallback yield no parts (truly empty `.docx`), return `parts: []`. The orchestrator persists no units; the job completes with `unitsCreated: 0`. Same shape as an empty CSV.

### 5.5 Mammoth warning forwarding

`mammoth.convertToHtml` emits warnings for unparseable styles, missing fonts, etc. These flow into `ParsedDocument.metadata.mammothWarnings: string[]` so operator inspection (RetrofitPage Provenance Inspector) surfaces them. No effect on the unit shape.

---

## 6. Output shape

### 6.1 Heading-rich document (typical)

```
DOCX with structure:
  H1 "Project Overview"
    P "First paragraph..."
    P "Second paragraph..."
  H2 "Goals"
    UL "Goal 1, Goal 2"
  H2 "Open Questions"
    P "Question paragraph..."

→ Three `markdown_section` units:
  - partId: docx-section-1, heading="Project Overview", level=1
  - partId: docx-section-2, heading="Goals", level=2
  - partId: docx-section-3, heading="Open Questions", level=2
```

### 6.2 Memo-style document (no headings)

```
DOCX with no headings:
  P "Status update..."
  P "Action items..."

→ One `text` unit:
  - partId: docx-text, content = full text projection
```

### 6.3 Mixed (preamble + headings)

```
DOCX:
  P "Document subtitle..."
  H1 "Section A"
    P "..."

→ Two units:
  - partId: docx-section-1, heading="" (preamble), body="Document subtitle..."
  - partId: docx-section-2, heading="Section A", body="..."
```

---

## 7. Supported content types

```
application/vnd.openxmlformats-officedocument.wordprocessingml.document
application/vnd.ms-word.document.macroenabled.12
```

Both modern OOXML formats (`.docx` + `.docm` macro-enabled). Legacy `.doc` (pre-2007 binary format) is **NOT** supported — mammoth doesn't parse it. Operators uploading `.doc` files see the standard `UnsupportedContentTypeError` shape.

---

## 8. Test strategy

Unit tests cover happy paths + structural variants + failure modes via injected fake mammoth (matches the `createOcrParser({getStatus, fetchImpl})` and `createAudioParser({getEnv, fetchImpl})` patterns):

- **`createDocxParser({mammothImpl})`** factory — production singleton wired with real `mammoth`; tests inject a `mammothImpl` that returns synthetic `convertToHtml` / `extractRawText` results.
- **Heading-rich document** — fake response with multiple `<h1>` / `<h2>` elements; assert one `markdown_section` per heading + correct `partId` numbering + heading text on `json`.
- **No-heading fallback** — fake response with only `<p>` elements; assert one `text` unit with full content.
- **Pre-heading preamble** — paragraphs before first heading; assert preamble appears as a section with empty heading.
- **Empty document** — fake response with empty `value`; assert `parts: []`.
- **Mammoth warnings** — fake response with non-empty `messages`; assert they surface in `ParsedDocument.metadata.mammothWarnings`.
- **Mammoth throws** — fake `convertToHtml` rejects with `Error("malformed DOCX")`; assert the parser propagates the error (the dispatcher records as parser failure).

No DB-backed integration test for this PR — DOCX parsing is pure-function over bytes. Integration coverage via the existing ingestion-orchestrator path (already DB-backed via `tests/integration/agent-studio/`) lands when a real DOCX fixture is added to that suite.

---

## 9. What this ADR does *not* cover

- **Legacy `.doc` parsing.** Out of scope; would need a separate ADR + a different lib (`antiword`-based or LibreOffice subprocess).
- **Embedded media extraction.** Mammoth can extract images via custom `convertImage` handler — deferred. The MVP parser drops images; future enhancement could route them through OCR.
- **Track changes / comments.** Mammoth surfaces these as warnings but doesn't include them in the output. Future enhancement could expose comments as separate `extracted_artifact` units.
- **Fields, formulas, embedded Excel objects.** Out of scope; fall under §5.5's mammoth warnings.
- **Per-paragraph splitting.** MVP splits on headings only. Heading-less long-form docs become a single `text` unit; per-paragraph chunking is a retrieval-side concern (existing `retrieval-filter.ts` `dedupeBy` + `maxChunks` head-cap handles size).

---

## 10. Cross-references

- `docs/implementation/agent-studio-retrofit-followups.md` §D4 — the deferral spec this ADR closes (DOCX half).
- `docs/architecture/agent-studio-audio-parser.md` D-PARSE-AUDIO-1..4 — sibling §D4 ADR pattern; this ADR mirrors its structure.
- `docs/architecture/agent-studio-ocr-parser.md` D-PARSE-OCR-1..4 — sibling closure; the dispatcher try/catch widening covers DOCX implicitly.
- `docs/architecture/agent-studio-universal-data-ingestion.md` D-UI-5 — the parser contract this implementation honors.
- `docs/architecture/agent-studio-normalized-knowledge-unit.md` D-NKU-2 — `markdown_section` and `text` unit types.
- `CLAUDE.md` "Deferred Scope" — DOCX line removed at this ADR's merge.
- 2026-05-08 RAC audit closure summary §4.2 — R5 (DOCX) referenced; this PR delivers it.
