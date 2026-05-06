/**
 * Audio parser — D-UI-5 follow-up D4, locked by `D-PARSE-AUDIO-1..4`
 * in `docs/architecture/agent-studio-audio-parser.md`.
 *
 * Each successful transcription produces one `extracted_artifact` unit
 * (D-NKU-2) carrying the full Whisper transcript plus `language`,
 * `durationSec`, `segmentCount`, and the raw `segments` array (so a
 * future per-segment retrieval amendment can re-shape the units
 * without re-calling the engine).
 *
 * Engine binding (D-PARSE-AUDIO-1): the existing forge proxy at
 * `{BUILT_IN_FORGE_API_URL}/v1/audio/transcriptions` with the
 * `whisper-1` model. Workspace-shared, ops-deployed; no per-workspace
 * credentials (D-PARSE-AUDIO-2) — same shape as D-PARSE-OCR-2.
 *
 * Graceful degradation (D-PARSE-AUDIO-3):
 *   - Engine unconfigured (env vars empty) → throws
 *     `UnsupportedContentTypeError` → dispatcher records
 *     `status="unsupported_type"`.
 *   - Engine runtime error (forge non-2xx, network failure, malformed
 *     response) → throws regular `Error` → dispatcher records as a
 *     parser failure with the forge message preserved for triage.
 *
 * Wire contract (D-PARSE-AUDIO-4): POST `multipart/form-data` with
 * `file` + `model="whisper-1"` + `response_format="verbose_json"`;
 * `Authorization: Bearer {forgeApiKey}`. 16MB request size limit
 * matches `voiceTranscription.ts`.
 */

import type { Parser, ParsedDocument, ParsedPart, RawArtifact } from "../types";
import { UnsupportedContentTypeError } from "../types";
import { ENV } from "../../../../_core/env";

const SUPPORTED_AUDIO_TYPES: ReadonlyArray<string> = [
  "audio/webm",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/ogg",
  "audio/m4a",
  "audio/mp4",
];

const MAX_AUDIO_BYTES = 16 * 1024 * 1024; // 16 MB — matches voiceTranscription.ts

const MIME_TO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp3": "mp3",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/m4a": "m4a",
  "audio/mp4": "m4a",
};

interface WhisperSegment {
  id?: number;
  start?: number;
  end?: number;
  text?: string;
}

interface WhisperResponse {
  task?: string;
  language?: unknown;
  duration?: unknown;
  text?: unknown;
  segments?: unknown;
}

export interface AudioParserDeps {
  /** Resolves forge config. Default reads from `_core/env`. Tests inject. */
  getEnv?: () => { forgeApiUrl: string; forgeApiKey: string };
  /** HTTP fetch impl. Default `globalThis.fetch`. Override in tests. */
  fetchImpl?: typeof fetch;
  /** Per-call timeout in ms. Default 60s — Whisper transcription can be slow. */
  requestTimeoutMs?: number;
}

/**
 * Create an audio parser bound to the supplied dependencies. The
 * default singleton (`audioParser`) wires production deps; tests
 * inject fakes for `getEnv` + `fetchImpl`.
 */
export function createAudioParser(deps: AudioParserDeps = {}): Parser {
  const getEnv =
    deps.getEnv ??
    (() => ({ forgeApiUrl: ENV.forgeApiUrl, forgeApiKey: ENV.forgeApiKey }));
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const requestTimeoutMs = deps.requestTimeoutMs ?? 60_000;

  return {
    key: "audio",
    acceptsContentTypes: SUPPORTED_AUDIO_TYPES,

    async parse(artifact: RawArtifact): Promise<ParsedDocument> {
      const { forgeApiUrl, forgeApiKey } = getEnv();
      if (!forgeApiUrl || !forgeApiKey) {
        throw new UnsupportedContentTypeError(
          `${artifact.contentType} (forge transcription engine unconfigured: ` +
            `BUILT_IN_FORGE_API_URL/BUILT_IN_FORGE_API_KEY not set)`,
        );
      }

      if (artifact.bytes.length > MAX_AUDIO_BYTES) {
        const sizeMB = (artifact.bytes.length / (1024 * 1024)).toFixed(2);
        throw new Error(
          `Audio file exceeds 16 MB limit (received ${sizeMB} MB)`,
        );
      }

      const baseUrl = forgeApiUrl.endsWith("/") ? forgeApiUrl : `${forgeApiUrl}/`;
      const url = new URL("v1/audio/transcriptions", baseUrl).toString();

      const ext = MIME_TO_EXT[artifact.contentType] ?? "audio";
      const filename = `audio.${ext}`;

      const form = new FormData();
      // Buffer's underlying ArrayBufferLike loses ArrayBuffer narrowing
      // under TS strictNullChecks; copy into a fresh Uint8Array so the
      // Blob constructor sees a plain BlobPart.
      const bodyBytes = new Uint8Array(artifact.bytes);
      form.append(
        "file",
        new Blob([bodyBytes], { type: artifact.contentType }),
        filename,
      );
      form.append("model", "whisper-1");
      form.append("response_format", "verbose_json");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${forgeApiKey}`,
            "Accept-Encoding": "identity",
          },
          body: form,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `Forge transcription failed: ${response.status} ${response.statusText}` +
            (errorText ? `: ${errorText}` : ""),
        );
      }

      const body = (await response.json()) as WhisperResponse;
      if (typeof body.text !== "string") {
        throw new Error("Forge transcription response missing required 'text' field");
      }

      const text = body.text;
      const language = typeof body.language === "string" ? body.language : null;
      const durationSec =
        typeof body.duration === "number" ? body.duration : null;
      const segments = Array.isArray(body.segments)
        ? (body.segments as WhisperSegment[])
        : [];

      const parts: ParsedPart[] = [];
      if (text.length > 0) {
        parts.push({
          partId: "audio-transcript-1",
          text,
          unitTypeHint: "extracted_artifact",
          json: {
            engine: "whisper-1",
            language,
            durationSec,
            segmentCount: segments.length,
            segments,
            contentType: artifact.contentType,
          },
        });
      }

      return {
        parserKey: "audio",
        fullText: text,
        parts,
        metadata: {
          engine: "whisper-1",
          language,
          durationSec,
          segmentCount: segments.length,
        },
      };
    },
  };
}

/** Production singleton — wired with `_core/env` + `globalThis.fetch`. */
export const audioParser: Parser = createAudioParser();
