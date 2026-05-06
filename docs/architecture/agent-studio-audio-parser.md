# Agent Studio Audio Parser — ADR

**Owner:** Agent Studio module + `_core` voice-transcription surface
**Phase:** Retrofit follow-up D4 (additional MVP parsers)
**Status:** Adopted 2026-05-06
**Authority:** Locks the engine binding, contract, and graceful-degradation pattern for the audio parser introduced under Universal Ingestion (D-UI-5). Cited as **D-PARSE-AUDIO-1..4**.

---

## 1. Why this document exists

Follow-up §D4 deferred OCR/audio/video parsers behind four sharp acceptance criteria. The first is a `D-PARSE-EXTRACT-N` decision record that picks the engine and locks the graceful-degradation contract. This ADR satisfies that criterion for the audio parser and runs parallel to `agent-studio-ocr-parser.md` (D-PARSE-OCR-1..4) — same closure pattern, different engine.

---

## 2. Decision summary

| ID | Decision | One-line rationale |
|---|---|---|
| **D-PARSE-AUDIO-1** | Audio engine binding is the existing forge API at `{BUILT_IN_FORGE_API_URL}/v1/audio/transcriptions` with the `whisper-1` model. | Forge is already wired in `server/_core/voiceTranscription.ts` and used by the live voice-transcription tRPC surface; the retrofit parser becomes a second JS consumer of an already-running engine. |
| **D-PARSE-AUDIO-2** | No per-workspace credential binding row. Forge uses the global `BUILT_IN_FORGE_API_URL` + `BUILT_IN_FORGE_API_KEY` env vars; workspace-shared, ops-deployed. | Same shape as D-PARSE-OCR-2 — D-EMB-1's per-source binding pattern only applies when credentials are workspace-scoped. Forge is not a per-tenant cloud vendor in the current architecture; if that changes, it'll be a separate `D-PARSE-AUDIO-CRED-N` ADR. |
| **D-PARSE-AUDIO-3** | Parser registers always for deterministic boot. Throws `UnsupportedContentTypeError` from `parse()` when `BUILT_IN_FORGE_API_URL` or `BUILT_IN_FORGE_API_KEY` is missing. Forge runtime errors (non-2xx, network failures) throw a regular `Error` → dispatcher records as parser failure. | Env-var check is free, so no TTL cache. The runtime-error vs unconfigured distinction matches `voiceTranscription.ts`'s SERVICE_ERROR vs TRANSCRIPTION_FAILED split. |
| **D-PARSE-AUDIO-4** | Wire contract: POST `multipart/form-data` with `file` (audio bytes), `model="whisper-1"`, `response_format="verbose_json"`; `Authorization: Bearer {forgeApiKey}`. Response is the native Whisper API shape (`{ text, language, duration, segments[] }`). 16MB request size limit (matches `voiceTranscription.ts`'s validation). | Reuses the wire format the live voice-transcription feature already battle-tests; segments preserved in `contentJson` so future per-segment retrieval can be added without re-ingesting. |

---

## 3. Engine binding (D-PARSE-AUDIO-1)

### 3.1 Path considered

| Option | Engine | Why considered | Why rejected (or accepted) |
|---|---|---|---|
| **A** *(adopted)* | Bridge to forge API `/v1/audio/transcriptions` (whisper-1) | Existing infrastructure; same global env-var pattern voice transcription uses | Adopted — see §3.2 |
| B | `whisper.cpp` / `nodejs-whisper` in-process | Self-contained, no external service | Local model files (~150MB–3GB depending on quality); CPU-heavy; significantly slower than the cloud-backed forge proxy; the platform already runs the forge alternative |
| C | Direct OpenAI Whisper API per-workspace | Best workspace-level control | Requires per-workspace credential infrastructure (mirrors D-EMB-1); duplicates what forge already abstracts; cost gate per workspace |

### 3.2 Why Option A

1. **Engine already running.** The live tRPC voice-transcription endpoint already calls `/v1/audio/transcriptions` against forge. The retrofit parser is a thin client over the same surface.
2. **Same closure pattern as OCR.** D-PARSE-OCR-1 picked the workspace-shared, ops-deployed worker; D-PARSE-AUDIO-1 picks the workspace-shared, ops-deployed forge proxy. Operators learn one mental model.
3. **No new credential surface.** `BUILT_IN_FORGE_API_URL` + `BUILT_IN_FORGE_API_KEY` are already configured in deployments that run voice transcription; no new ops setup for audio ingestion.
4. **Future per-tenant escape hatch.** If a workspace later needs its own Whisper credentials (GDPR, vendor-of-choice, cost attribution), that's a separate `D-PARSE-AUDIO-CRED-N` ADR that adds a per-source credential binding similar to D-EMB-1. This MVP closure does not block that path.

---

## 4. Graceful degradation (D-PARSE-AUDIO-3)

### 4.1 Refusal-on-unconfigured, runtime-error-on-misbehavior

Two distinct failure modes get distinct error classes:

- **Engine unconfigured** (`BUILT_IN_FORGE_API_URL` or `BUILT_IN_FORGE_API_KEY` empty) → `UnsupportedContentTypeError`. Dispatcher records `status="unsupported_type"`. Same path operators already understand from missing-parser scenarios.
- **Engine runtime error** (forge returns non-2xx, network timeout, malformed response) → regular `Error`. Dispatcher records as parser failure with the forge error message. Operators see "TRANSCRIPTION_FAILED: 502 Bad Gateway" rather than the indistinguishable "unsupported."

This matches `voiceTranscription.ts`'s SERVICE_ERROR vs TRANSCRIPTION_FAILED split — operators investigate "engine unconfigured" via deployment env, "engine erroring" via forge logs.

### 4.2 No TTL cache

Unlike OCR, audio has no health-probe HTTP cost — it's a sync env-var check. The parser reads `process.env` on every call (free) and the engine reachability is exercised by the actual POST. There's nothing to cache.

### 4.3 Dispatcher coupling

The dispatcher's parse-time `UnsupportedContentTypeError` catch was widened in the OCR PR (D-PARSE-OCR-3). That single try/catch now covers OCR + audio + any future engine-bound parsers — no further dispatcher change needed.

---

## 5. Wire contract (D-PARSE-AUDIO-4)

### 5.1 Request

```
POST {BUILT_IN_FORGE_API_URL}/v1/audio/transcriptions
Authorization: Bearer {BUILT_IN_FORGE_API_KEY}
Accept-Encoding: identity
Content-Type: multipart/form-data; boundary=...

--boundary
Content-Disposition: form-data; name="file"; filename="audio.<ext>"
Content-Type: <artifact.contentType>
<binary bytes>
--boundary
Content-Disposition: form-data; name="model"

whisper-1
--boundary
Content-Disposition: form-data; name="response_format"

verbose_json
--boundary--
```

The parser does **not** forward `prompt` or `language` hints in MVP — Whisper auto-detects and the live voice-transcription endpoint already shows that auto-detection is good enough for English/Spanish/Chinese/etc. A future enhancement could thread `language` through `RawArtifact.metadata.language`.

### 5.2 Response

Native Whisper API `verbose_json`:

```jsonc
{
  "task": "transcribe",
  "language": "en",          // detected language code
  "duration": 12.45,         // seconds
  "text": "full transcript text",
  "segments": [
    {
      "id": 0,
      "seek": 0,
      "start": 0.0,
      "end": 4.2,
      "text": " segment text",
      "tokens": [...],
      "temperature": 0.0,
      "avg_logprob": -0.18,
      "compression_ratio": 1.34,
      "no_speech_prob": 0.02
    },
    ...
  ]
}
```

The parser depends on `text`. `language`, `duration`, `segments` flow into `contentJson` for downstream observability + future per-segment retrieval; they are not semantically required.

### 5.3 Size limit

16MB request body, matching `voiceTranscription.ts`'s validation. Larger audio files should chunk upstream — out of scope for this parser.

### 5.4 Errors

- HTTP non-2xx → throws regular `Error` → dispatcher records parser failure.
- Missing `text` field → throws regular `Error` → same path.
- Empty `text` → returns `parts: []` (legitimate "audio had no speech").

---

## 6. Output shape

Each successful transcription produces **one** `extracted_artifact` unit (D-NKU-2):

```ts
{
  partId: "audio-transcript-1",
  text: <response.text>,
  unitTypeHint: "extracted_artifact",
  json: {
    engine: "whisper-1",
    language: <response.language | null>,
    durationSec: <response.duration | null>,
    segmentCount: <response.segments?.length | 0>,
    segments: <response.segments | []>,   // preserved for future per-segment retrieval
    contentType: <artifact.contentType>,
  },
}
```

`fullText` mirrors `response.text`. Segment-level units are **out of MVP scope** — when retrieval ergonomics call for per-segment grounding, we add a `audio_segment` unit type (D-NKU-2 amendment) and segment the transcript at parse time. The `segments` array carried in `contentJson` lets that future change re-ingest from the same response without re-calling the engine.

---

## 7. Supported content types

```
audio/webm
audio/mpeg
audio/mp3
audio/wav
audio/wave
audio/ogg
audio/m4a
audio/mp4
```

Mirrors the `getFileExtension` map in `voiceTranscription.ts` exactly so any audio the live voice-transcription feature accepts also flows through this parser.

---

## 8. Test strategy

Unit tests cover both engine-up and engine-down paths via injected fakes:

- **Engine config**: `createAudioParser({ getEnv, fetchImpl })` accepts injected dependencies. Default uses `process.env` + `globalThis.fetch`; tests pass fakes.
- **Engine-up happy path**: fake `fetchImpl` returns a Whisper `verbose_json`; assert one `extracted_artifact` unit with correct shape, language/duration/segments forwarded.
- **Engine unconfigured**: fake `getEnv` returns empty strings; `parse()` throws `UnsupportedContentTypeError`; fetch is never called.
- **Engine runtime error**: fake `fetchImpl` returns 500; parser throws regular `Error` → dispatcher records as parser failure.
- **Empty transcript**: fake response `{ text: "" }`; parser returns `parts: []`.
- **Size limit**: artifact >16MB → parser throws regular `Error` before calling forge.

Engine-down test coverage satisfies criterion #4 of the D4 deferral spec.

---

## 9. What this ADR does *not* cover

- **The forge service.** That lives outside this repo. This ADR specifies what the JS parser sends; forge honoring the OpenAI Whisper-compatible response is a separate engineering responsibility.
- **Video parsing.** Still deferred behind a future `D-PARSE-VIDEO-N` ADR. Video composes ffmpeg keyframe extraction + this audio parser for the speech track.
- **Per-segment retrieval units.** Out of MVP scope; preserved in `contentJson.segments` for a future amendment.
- **Per-workspace credentials.** Future `D-PARSE-AUDIO-CRED-N` ADR if/when that need surfaces.

---

## 10. Cross-references

- `docs/implementation/agent-studio-retrofit-followups.md` §D4 — the deferral spec this ADR closes.
- `docs/architecture/agent-studio-ocr-parser.md` D-PARSE-OCR-1..4 — sibling closure pattern; the dispatcher try/catch widening was added there and covers audio too.
- `docs/architecture/agent-studio-universal-data-ingestion.md` D-UI-5 — the parser contract this implementation honors.
- `docs/architecture/agent-studio-normalized-knowledge-unit.md` D-NKU-2 — `extracted_artifact` unit type.
- `server/_core/voiceTranscription.ts` — the existing forge-based transcription surface this parser parallels.
