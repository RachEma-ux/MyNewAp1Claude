# Agent Studio Video Parser — ADR

**Owner:** Agent Studio module
**Phase:** Retrofit follow-up D4 (additional MVP parsers)
**Status:** Adopted 2026-05-06
**Authority:** Locks the engine binding, contract, and graceful-degradation pattern for the video parser introduced under Universal Ingestion (D-UI-5). Cited as **D-PARSE-VIDEO-1..5**.

---

## 1. Why this document exists

Follow-up §D4 deferred OCR/audio/video parsers behind four sharp acceptance criteria. This ADR satisfies the engine + binding criterion for the video parser and runs parallel to `agent-studio-ocr-parser.md` (D-PARSE-OCR-1..4) and `agent-studio-audio-parser.md` (D-PARSE-AUDIO-1..4) — same closure pattern, different engine.

---

## 2. Decision summary

| ID | Decision | One-line rationale |
|---|---|---|
| **D-PARSE-VIDEO-1** | Engine binding: system `ffmpeg` (PATH lookup) for audio-track extraction; composition with `D-PARSE-AUDIO-1` (forge Whisper proxy) for transcription. **No keyframe OCR in MVP.** | Most "video ingestion" use cases (meetings, screencasts, video podcasts) are dominated by speech. Keyframe OCR is a nice-to-have, not the primary value, and the cadence/dedup/scene-detection design space deserves its own future amendment. |
| **D-PARSE-VIDEO-2** | No per-workspace credential binding. ffmpeg is local; transcription inherits forge's global creds via D-PARSE-AUDIO-2. | Same shape as the prior two engine-bound parsers. |
| **D-PARSE-VIDEO-3** | Parser registers always for deterministic boot. Throws `UnsupportedContentTypeError` from `parse()` when ffmpeg is absent OR when the composed audio parser refuses. ffmpeg/audio runtime errors propagate as parser failures. | Mirrors OCR/audio refusal-on-unavailable; recovery is automatic when ffmpeg installs and the cache expires. |
| **D-PARSE-VIDEO-4** | Wire contract: spawn `ffmpeg -i pipe:0 -vn -acodec libmp3lame -f mp3 pipe:1`; pipe video bytes to stdin, capture audio bytes from stdout; construct a synthetic `RawArtifact` with `audio/mpeg` content-type; delegate to the audio parser. 16 MB original video size limit (mirrors audio's forge limit since the extracted audio inherits the same upstream constraint). | Reuses the forge-validated audio path; the video parser is a thin compose-and-delegate layer that doesn't duplicate transcription logic. |
| **D-PARSE-VIDEO-5** | Output shape: one `extracted_artifact` unit per video. Forwards the audio parser's transcript text + `language` + `durationSec` + `segmentCount` + `segments`. Adds `videoContentType` so traceability survives the audio-as-intermediate hop. | Single-unit-per-video keeps the MVP shape simple; a future per-segment amendment (already noted in D-PARSE-AUDIO ADR §6) can re-shape the units without re-extracting audio. |

---

## 3. Engine binding (D-PARSE-VIDEO-1)

### 3.1 Paths considered

| Option | Approach | Why considered | Why rejected (or accepted) |
|---|---|---|---|
| A | Bundled ffmpeg via `ffmpeg-static` + `fluent-ffmpeg` | Self-contained; no operator install step | ~70 MB binary per platform shipped as npm dep; GPL/LGPL licensing wrinkle (depending on build flags); install bloat for a feature whose usage volume is unknown |
| **B** *(adopted)* | System `ffmpeg` from PATH, refusal-on-absent | Symmetrical with OCR's external-worker pattern; no install bloat; ops-managed binary | Adopted — see §3.2 |
| C | System ffmpeg + keyframe OCR composition | Most powerful (speech + visual text) | Real complexity (cadence/dedup/scene detection); delays MVP; can land later as an amendment without changing parser shape |
| D | Defer entirely with ADR only | No producer asking | Rejected because the audio path is already enabled and a thin video wrapper is genuinely useful for meeting-recording ingestion |

### 3.2 Why Option B

1. **Symmetrical engine pattern.** OCR binds to an HTTP worker; audio binds to the forge HTTP proxy; video binds to the local ffmpeg subprocess. All three share the same "external engine, refuse if absent" shape — operators learn one mental model.
2. **No npm bloat.** ffmpeg ships as an OS package on every relevant target; the operator adds one apt/brew install line to the runbook. The retrofit doesn't need to drag a ~70 MB binary into every install.
3. **Clean composition with D-PARSE-AUDIO.** Audio extraction → forge whisper-1 → unit. The video parser doesn't duplicate transcription logic; it's a pure compose-and-delegate layer.
4. **Future-extensible.** Keyframe OCR can land later as an amendment that adds:
   - A second ffmpeg invocation (`ffmpeg -ss N -frames:v 1 -f image2 pipe:1`) per keyframe.
   - Composition with `D-PARSE-OCR-1` for each frame.
   - A per-frame unit emit using `extracted_artifact` with `frameOffsetSec` in `contentJson`.
   The audio path established here is unchanged by that future addition.

---

## 4. Graceful degradation (D-PARSE-VIDEO-3)

### 4.1 Three failure modes, three error classes

| Failure | Error class | Dispatcher result |
|---|---|---|
| ffmpeg not on PATH | `UnsupportedContentTypeError` | `status="unsupported_type"` (same path operators understand from missing-parser scenarios) |
| Audio parser refuses (forge env unset) | `UnsupportedContentTypeError` (propagated unchanged) | `status="unsupported_type"` |
| ffmpeg subprocess error / forge runtime error | regular `Error` | parser failure with the underlying error preserved for triage |

### 4.2 ffmpeg health-cache TTL

Probing ffmpeg availability requires spawning a process — not free. The parser caches the result with a **60-second TTL**, longer than OCR's 30 seconds because ffmpeg presence on a host is much more stable than a remote worker's reachability. First parse after cache expiry re-probes; subsequent calls within the TTL reuse the cached result.

### 4.3 Dispatcher coupling

The parse-time `UnsupportedContentTypeError` catch added in the OCR PR (D-PARSE-OCR-3) covers video the same way it covers audio. No further dispatcher change.

---

## 5. Wire contract (D-PARSE-VIDEO-4)

### 5.1 Audio extraction

```
ffmpeg -hide_banner -loglevel error \
       -i pipe:0 \
       -vn -acodec libmp3lame -ar 16000 -ac 1 -f mp3 \
       pipe:1
```

- `-vn` — drop video stream.
- `-acodec libmp3lame -f mp3` — encode audio as MP3 (matches `audio/mpeg`).
- `-ar 16000 -ac 1` — 16 kHz mono. Whisper internally resamples to 16 kHz; emitting at the target rate avoids redundant re-encoding cost on the engine side and shrinks the audio payload.
- `pipe:0`/`pipe:1` — stdin/stdout streaming so we never touch disk.
- `-hide_banner -loglevel error` — quiet stderr; only real errors surface for triage.

### 5.2 Synthetic RawArtifact

```ts
{
  bytes: <ffmpeg stdout buffer>,
  contentType: "audio/mpeg",
  sourceUri: <original artifact.sourceUri>,   // preserved for traceability
  contentHash: <sha256 of ffmpeg stdout>,
}
```

The synthetic artifact has a **fresh content hash** of the extracted audio bytes — different from the original video hash. This is correct: the audio parser persists provenance keyed on the audio bytes, so re-ingesting the same video twice does dedupe correctly through the audio parser's own dedupe (D-NKU-4).

### 5.3 Size limit

16 MB applies to the **original video bytes**. We don't have a separate budget for the extracted audio because the audio extraction is bounded by the original — the worst case (audio-only with low compression) is still smaller than the input when starting from 16 MB of full video.

A future amendment could relax this for video-heavy/audio-light inputs by checking the extracted audio size against the audio parser's 16 MB limit instead. Not in MVP scope.

### 5.4 Errors

- **ffmpeg spawn fails (ENOENT)** → cached as unhealthy → `UnsupportedContentTypeError` from `parse()`.
- **ffmpeg non-zero exit** → regular `Error` with stderr text preserved.
- **ffmpeg timeout** (default 60 s wall-clock) → regular `Error`.
- **Audio parser refusal** (forge env unset) → `UnsupportedContentTypeError` propagated.
- **Audio parser runtime error** (forge non-2xx, malformed response) → regular `Error` propagated.

---

## 6. Output shape

```ts
{
  partId: "video-transcript-1",
  text: <audioPart.text>,
  unitTypeHint: "extracted_artifact",
  json: {
    engine: "ffmpeg+whisper-1",
    language: <audioPart.json.language>,
    durationSec: <audioPart.json.durationSec>,
    segmentCount: <audioPart.json.segmentCount>,
    segments: <audioPart.json.segments>,
    videoContentType: <original artifact.contentType>,
  },
}
```

`fullText` mirrors `audioPart.text`. Empty transcript yields `parts: []` (matches audio's no-speech behavior).

---

## 7. Supported content types

```
video/mp4
video/webm
video/quicktime
video/x-matroska
video/x-msvideo
video/mpeg
```

These are the formats ffmpeg accepts natively across all common platforms with a stock build.

---

## 8. Test strategy

Unit tests cover the four failure modes + happy path via injected fakes:

- **Engine probe**: `createVideoParser({ checkFfmpeg, extractAudio, audioParser })` accepts injected dependencies. Default uses `child_process.spawn`; tests pass fakes.
- **Engine-up happy path**: fake `extractAudio` returns dummy mp3 bytes; fake `audioParser` returns a Whisper transcript; assert one `extracted_artifact` unit with `engine: "ffmpeg+whisper-1"` and `videoContentType` set.
- **ffmpeg absent**: fake `checkFfmpeg` returns false; `parse()` throws `UnsupportedContentTypeError` without invoking `extractAudio`.
- **Audio parser refusal**: fake `audioParser` throws `UnsupportedContentTypeError`; video parser propagates unchanged.
- **ffmpeg subprocess error**: fake `extractAudio` throws; video parser throws regular `Error` with the cause preserved.
- **Empty transcript**: audio parser returns `parts: []`; video parser returns `parts: []`.
- **TTL cache**: probe is cached within window; re-probes after expiry; recovery after absent → present flip.
- **Size limit**: artifact > 16 MB throws regular `Error` before any subprocess work.

Engine-down test coverage satisfies criterion #4 of the D4 deferral spec.

---

## 9. What this ADR does *not* cover

- **Keyframe OCR.** Out of MVP scope; future amendment composes ffmpeg keyframe extraction with `D-PARSE-OCR-1` and emits per-frame `extracted_artifact` units.
- **Per-segment retrieval units.** Same situation as audio — segments preserved in `contentJson` for a future D-NKU amendment.
- **Bundled ffmpeg.** Future ADR if the operator install step proves to be a real friction point.
- **Scene detection / chapter boundaries.** Future ADR; ffmpeg's `select='gt(scene,0.4)'` filter would be the basis.

---

## 10. Cross-references

- `docs/implementation/agent-studio-retrofit-followups.md` §D4 — the deferral spec this ADR closes.
- `docs/architecture/agent-studio-ocr-parser.md` D-PARSE-OCR-1..4 — sibling closure; dispatcher widening was added there and covers video too.
- `docs/architecture/agent-studio-audio-parser.md` D-PARSE-AUDIO-1..4 — composed engine; D-PARSE-VIDEO-1 explicitly delegates to the audio parser.
- `docs/architecture/agent-studio-universal-data-ingestion.md` D-UI-5 — the parser contract this implementation honors.
- `docs/architecture/agent-studio-normalized-knowledge-unit.md` D-NKU-2 — `extracted_artifact` unit type.
