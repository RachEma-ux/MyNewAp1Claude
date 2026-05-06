/**
 * Video parser — D-UI-5 follow-up D4, locked by `D-PARSE-VIDEO-1..5`
 * in `docs/architecture/agent-studio-video-parser.md`.
 *
 * Audio-only video parsing in MVP: extracts the audio track via the
 * system `ffmpeg` binary and delegates to the audio parser
 * (D-PARSE-AUDIO-1) for transcription. Each successful run produces
 * one `extracted_artifact` unit (D-NKU-2) with the speech transcript
 * + language + duration + segments + the original video content-type
 * for traceability.
 *
 * Engine binding (D-PARSE-VIDEO-1): system ffmpeg from PATH, no
 * bundled binary. Symmetrical with OCR's external-worker pattern;
 * operators add one apt/brew install line for video ingestion.
 *
 * Graceful degradation (D-PARSE-VIDEO-3):
 *   - ffmpeg absent (PATH lookup fails) → `UnsupportedContentTypeError`
 *     (cached for 60 s; recovery automatic on cache expiry).
 *   - Audio parser refusal (forge env unset) → propagates unchanged.
 *   - ffmpeg subprocess / forge runtime errors → regular `Error`.
 *
 * Wire contract (D-PARSE-VIDEO-4): spawn
 * `ffmpeg -i pipe:0 -vn -acodec libmp3lame -ar 16000 -ac 1 -f mp3 pipe:1`,
 * pipe video bytes in, capture audio bytes out, build a synthetic
 * `RawArtifact` with `audio/mpeg`, delegate to `audioParser.parse()`.
 * 16 MB original video size limit (mirrors audio's forge limit).
 */

import { spawn } from "child_process";
import { createHash } from "crypto";
import type { Parser, ParsedDocument, ParsedPart, RawArtifact } from "../types";
import { UnsupportedContentTypeError } from "../types";
import { audioParser as defaultAudioParser } from "./audio-parser";

const SUPPORTED_VIDEO_TYPES: ReadonlyArray<string> = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/x-msvideo",
  "video/mpeg",
];

const MAX_VIDEO_BYTES = 16 * 1024 * 1024; // 16 MB — mirrors audio's forge limit
const FFMPEG_PROBE_TIMEOUT_MS = 2_000;
const FFMPEG_EXTRACT_TIMEOUT_MS = 60_000;
const HEALTH_CACHE_TTL_MS = 60_000;

export interface VideoParserDeps {
  /** Probe whether ffmpeg is available. Default uses `child_process.spawn`. */
  checkFfmpeg?: () => Promise<boolean>;
  /** Extract audio bytes from video bytes via ffmpeg. Default spawns ffmpeg. */
  extractAudio?: (videoBytes: Buffer) => Promise<Buffer>;
  /** Audio parser to delegate transcription to. Default = production audio singleton. */
  audioParser?: Parser;
  /** Health-cache TTL in ms. Default 60 000. Tests use 0 to force re-probe. */
  cacheTtlMs?: number;
}

export function createVideoParser(deps: VideoParserDeps = {}): Parser {
  const checkFfmpeg = deps.checkFfmpeg ?? defaultCheckFfmpeg;
  const extractAudio = deps.extractAudio ?? defaultExtractAudio;
  const audioParser = deps.audioParser ?? defaultAudioParser;
  const cacheTtlMs = deps.cacheTtlMs ?? HEALTH_CACHE_TTL_MS;

  let cached: { available: boolean; expiresAt: number } | null = null;

  async function readFfmpegHealth(): Promise<boolean> {
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.available;
    const available = await checkFfmpeg();
    cached = { available, expiresAt: now + cacheTtlMs };
    return available;
  }

  return {
    key: "video",
    acceptsContentTypes: SUPPORTED_VIDEO_TYPES,

    async parse(artifact: RawArtifact): Promise<ParsedDocument> {
      if (artifact.bytes.length > MAX_VIDEO_BYTES) {
        const sizeMB = (artifact.bytes.length / (1024 * 1024)).toFixed(2);
        throw new Error(
          `Video file exceeds 16 MB limit (received ${sizeMB} MB)`,
        );
      }

      const ffmpegAvailable = await readFfmpegHealth();
      if (!ffmpegAvailable) {
        throw new UnsupportedContentTypeError(
          `${artifact.contentType} (system ffmpeg not on PATH — install via apt/brew/etc. for video ingestion)`,
        );
      }

      const audioBytes = await extractAudio(artifact.bytes);
      const audioHash = createHash("sha256").update(audioBytes).digest("hex");
      const syntheticArtifact: RawArtifact = {
        bytes: audioBytes,
        contentType: "audio/mpeg",
        sourceUri: artifact.sourceUri,
        contentHash: audioHash,
        metadata: { ...(artifact.metadata ?? {}), extractedFromVideo: true },
      };

      // Delegate transcription to the audio parser. Refusals propagate
      // unchanged (forge env unset → UnsupportedContentTypeError); runtime
      // errors propagate as regular Error.
      const audioDoc = await audioParser.parse(syntheticArtifact);

      const audioPart = audioDoc.parts[0];
      const parts: ParsedPart[] = [];
      if (audioPart && audioPart.text.length > 0) {
        const audioJson = (audioPart.json ?? {}) as Record<string, unknown>;
        parts.push({
          partId: "video-transcript-1",
          text: audioPart.text,
          unitTypeHint: "extracted_artifact",
          json: {
            engine: "ffmpeg+whisper-1",
            language: audioJson.language ?? null,
            durationSec: audioJson.durationSec ?? null,
            segmentCount: audioJson.segmentCount ?? 0,
            segments: audioJson.segments ?? [],
            videoContentType: artifact.contentType,
          },
        });
      }

      return {
        parserKey: "video",
        fullText: audioDoc.fullText,
        parts,
        metadata: {
          engine: "ffmpeg+whisper-1",
          videoContentType: artifact.contentType,
          ...(audioDoc.metadata ?? {}),
        },
      };
    },
  };
}

// ── Default ffmpeg subprocess implementations ────────────────────────

async function defaultCheckFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      resolve(ok);
    };
    try {
      const proc = spawn("ffmpeg", ["-version"], {
        stdio: ["ignore", "ignore", "ignore"],
      });
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        finish(false);
      }, FFMPEG_PROBE_TIMEOUT_MS);
      proc.on("error", () => {
        clearTimeout(timer);
        finish(false);
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        finish(code === 0);
      });
    } catch {
      finish(false);
    }
  });
}

async function defaultExtractAudio(videoBytes: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-vn",
        "-acodec",
        "libmp3lame",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-f",
        "mp3",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already exited */
      }
      reject(err);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    };

    const timer = setTimeout(
      () => fail(new Error(`ffmpeg audio extraction timed out after ${FFMPEG_EXTRACT_TIMEOUT_MS} ms`)),
      FFMPEG_EXTRACT_TIMEOUT_MS,
    );

    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => errChunks.push(c));
    proc.on("error", (err) => {
      clearTimeout(timer);
      fail(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString("utf-8").trim();
        fail(
          new Error(
            `ffmpeg exited with code ${code}` + (stderr ? `: ${stderr}` : ""),
          ),
        );
        return;
      }
      succeed();
    });

    proc.stdin.on("error", (err) => {
      clearTimeout(timer);
      fail(err);
    });
    proc.stdin.end(videoBytes);
  });
}

/** Production singleton — system ffmpeg + production audio parser. */
export const videoParser: Parser = createVideoParser();
