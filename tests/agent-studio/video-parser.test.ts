/**
 * Follow-up D4 — Video parser unit tests.
 *
 * Locks the video parser's contract per `D-PARSE-VIDEO-1..5`:
 *   - Engine-up: ffmpeg extracts audio → audio parser transcribes →
 *     one `extracted_artifact` unit with `engine: "ffmpeg+whisper-1"`
 *     and `videoContentType` for traceability.
 *   - ffmpeg absent: throws `UnsupportedContentTypeError`; extractAudio
 *     is never called.
 *   - Audio parser refusal (forge env unset): propagated unchanged so
 *     the dispatcher records `status="unsupported_type"`.
 *   - ffmpeg subprocess error / audio runtime error: throws regular
 *     `Error` (dispatcher records as parser failure).
 *   - Empty transcript → `parts: []` (no-speech case from audio parser
 *     bubbles up as no-units from video parser).
 *   - 16 MB size limit on the original video bytes.
 *   - TTL cache for ffmpeg health probe.
 *
 * The parser is exercised via `createVideoParser` with injected
 * `checkFfmpeg`, `extractAudio`, and `audioParser` fakes — no live
 * ffmpeg or forge required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createVideoParser } from "../../server/agent-studio/services/ingestion/parsers/video-parser";
import {
  UnsupportedContentTypeError,
  type ParsedDocument,
  type Parser,
  type RawArtifact,
} from "../../server/agent-studio/services/ingestion/types";

function videoArtifact(
  contentType = "video/mp4",
  byteCount = 4096,
): RawArtifact {
  return {
    bytes: Buffer.alloc(byteCount, 0xff),
    contentType,
    sourceUri: "memory://meeting.mp4",
    contentHash: "0".repeat(64),
  };
}

function fakeAudioParser(impl: (a: RawArtifact) => Promise<ParsedDocument>): Parser {
  return {
    key: "audio",
    acceptsContentTypes: ["audio/mpeg"],
    parse: impl,
  };
}

function audioOk(text: string, extras: Record<string, unknown> = {}): ParsedDocument {
  return {
    parserKey: "audio",
    fullText: text,
    parts: text.length === 0
      ? []
      : [
          {
            partId: "audio-transcript-1",
            text,
            unitTypeHint: "extracted_artifact",
            json: {
              engine: "whisper-1",
              language: "en",
              durationSec: 12.5,
              segmentCount: 2,
              segments: [{ id: 0, text }],
              contentType: "audio/mpeg",
              ...extras,
            },
          },
        ],
    metadata: { engine: "whisper-1", language: "en", durationSec: 12.5 },
  };
}

describe("videoParser — engine-up happy path", () => {
  it("emits one extracted_artifact unit with `ffmpeg+whisper-1` engine + audio fields forwarded", async () => {
    const audioBytes = Buffer.from("fake mp3 data");
    const extractAudio = vi.fn(async () => audioBytes);
    const audio = fakeAudioParser(async () => audioOk("Hello, world."));

    const parser = createVideoParser({
      checkFfmpeg: async () => true,
      extractAudio,
      audioParser: audio,
      cacheTtlMs: 0,
    });

    const r = await parser.parse(videoArtifact());

    expect(r.parserKey).toBe("video");
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].unitTypeHint).toBe("extracted_artifact");
    expect(r.parts[0].text).toBe("Hello, world.");
    expect(r.parts[0].json).toMatchObject({
      engine: "ffmpeg+whisper-1",
      language: "en",
      durationSec: 12.5,
      segmentCount: 2,
      videoContentType: "video/mp4",
    });
    expect(extractAudio).toHaveBeenCalledTimes(1);
  });

  it("constructs a synthetic audio/mpeg RawArtifact and passes it to the audio parser", async () => {
    const audioBytes = Buffer.from("fake mp3 data");
    const extractAudio = vi.fn(async () => audioBytes);
    let receivedArtifact: RawArtifact | null = null;
    const audio = fakeAudioParser(async (a) => {
      receivedArtifact = a;
      return audioOk("ok");
    });

    const parser = createVideoParser({
      checkFfmpeg: async () => true,
      extractAudio,
      audioParser: audio,
      cacheTtlMs: 0,
    });

    await parser.parse(videoArtifact("video/webm"));

    expect(receivedArtifact).not.toBeNull();
    expect(receivedArtifact!.contentType).toBe("audio/mpeg");
    expect(receivedArtifact!.bytes.equals(audioBytes)).toBe(true);
    // Hash is freshly computed from the extracted audio (not the
    // original video hash).
    expect(receivedArtifact!.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(receivedArtifact!.contentHash).not.toBe("0".repeat(64));
    // sourceUri preserved for traceability.
    expect(receivedArtifact!.sourceUri).toBe("memory://meeting.mp4");
    // Metadata flag the audio is video-extracted.
    expect(receivedArtifact!.metadata).toMatchObject({ extractedFromVideo: true });
  });

  it("returns parts: [] when audio parser yields empty transcript (no-speech case)", async () => {
    const audio = fakeAudioParser(async () => audioOk(""));
    const parser = createVideoParser({
      checkFfmpeg: async () => true,
      extractAudio: async () => Buffer.alloc(0),
      audioParser: audio,
      cacheTtlMs: 0,
    });

    const r = await parser.parse(videoArtifact());
    expect(r.parts).toEqual([]);
    expect(r.fullText).toBe("");
  });
});

describe("videoParser — ffmpeg unavailable (D-PARSE-VIDEO-3)", () => {
  it("throws UnsupportedContentTypeError when ffmpeg is not on PATH", async () => {
    const extractAudio = vi.fn();
    const parser = createVideoParser({
      checkFfmpeg: async () => false,
      extractAudio,
      audioParser: fakeAudioParser(async () => audioOk("never reached")),
      cacheTtlMs: 0,
    });

    await expect(parser.parse(videoArtifact())).rejects.toBeInstanceOf(
      UnsupportedContentTypeError,
    );
    expect(extractAudio).not.toHaveBeenCalled();
  });

  it("error message names the install path for operator triage", async () => {
    const parser = createVideoParser({
      checkFfmpeg: async () => false,
      extractAudio: async () => Buffer.alloc(0),
      audioParser: fakeAudioParser(async () => audioOk("x")),
      cacheTtlMs: 0,
    });

    try {
      await parser.parse(videoArtifact());
      throw new Error("expected throw");
    } catch (e) {
      expect((e as Error).message).toContain("ffmpeg");
      expect((e as Error).message).toMatch(/PATH|install/i);
    }
  });
});

describe("videoParser — audio parser refusal propagates unchanged", () => {
  it("propagates UnsupportedContentTypeError from the audio parser (forge env unset)", async () => {
    const audio = fakeAudioParser(async () => {
      throw new UnsupportedContentTypeError("audio/mpeg (forge env unconfigured)");
    });
    const parser = createVideoParser({
      checkFfmpeg: async () => true,
      extractAudio: async () => Buffer.from("audio"),
      audioParser: audio,
      cacheTtlMs: 0,
    });

    await expect(parser.parse(videoArtifact())).rejects.toBeInstanceOf(
      UnsupportedContentTypeError,
    );
  });
});

describe("videoParser — runtime errors", () => {
  it("throws regular Error (not UnsupportedContentTypeError) when ffmpeg subprocess fails", async () => {
    const audio = fakeAudioParser(async () => audioOk("never reached"));
    const parser = createVideoParser({
      checkFfmpeg: async () => true,
      extractAudio: async () => {
        throw new Error("ffmpeg exited with code 1: invalid data");
      },
      audioParser: audio,
      cacheTtlMs: 0,
    });

    const promise = parser.parse(videoArtifact());
    await expect(promise).rejects.toThrow(/ffmpeg/);
    await expect(promise).rejects.not.toBeInstanceOf(UnsupportedContentTypeError);
  });

  it("propagates regular Error from audio parser (forge non-2xx)", async () => {
    const audio = fakeAudioParser(async () => {
      throw new Error("Forge transcription failed: 502 Bad Gateway");
    });
    const parser = createVideoParser({
      checkFfmpeg: async () => true,
      extractAudio: async () => Buffer.from("audio"),
      audioParser: audio,
      cacheTtlMs: 0,
    });

    const promise = parser.parse(videoArtifact());
    await expect(promise).rejects.toThrow(/502/);
    await expect(promise).rejects.not.toBeInstanceOf(UnsupportedContentTypeError);
  });
});

describe("videoParser — size limit", () => {
  it("rejects video files larger than 16 MB before any subprocess work", async () => {
    const checkFfmpeg = vi.fn(async () => true);
    const extractAudio = vi.fn();
    const parser = createVideoParser({
      checkFfmpeg,
      extractAudio,
      audioParser: fakeAudioParser(async () => audioOk("never reached")),
      cacheTtlMs: 0,
    });

    const big = videoArtifact("video/mp4", 17 * 1024 * 1024);
    await expect(parser.parse(big)).rejects.toThrow(/16 MB/);
    expect(checkFfmpeg).not.toHaveBeenCalled();
    expect(extractAudio).not.toHaveBeenCalled();
  });

  it("accepts files at the boundary (exactly 16 MB)", async () => {
    const audio = fakeAudioParser(async () => audioOk("ok"));
    const parser = createVideoParser({
      checkFfmpeg: async () => true,
      extractAudio: async () => Buffer.from("audio"),
      audioParser: audio,
      cacheTtlMs: 0,
    });
    const exact = videoArtifact("video/mp4", 16 * 1024 * 1024);
    const r = await parser.parse(exact);
    expect(r.parts).toHaveLength(1);
  });
});

describe("videoParser — ffmpeg health TTL cache", () => {
  let probeCount = 0;
  let probeReturns = true;

  beforeEach(() => {
    probeCount = 0;
    probeReturns = true;
  });

  function makeParser(cacheTtlMs: number) {
    return createVideoParser({
      checkFfmpeg: async () => {
        probeCount += 1;
        return probeReturns;
      },
      extractAudio: async () => Buffer.from("audio"),
      audioParser: fakeAudioParser(async () => audioOk("ok")),
      cacheTtlMs,
    });
  }

  it("probes once across multiple calls within the TTL window", async () => {
    const parser = makeParser(60_000);
    await parser.parse(videoArtifact());
    await parser.parse(videoArtifact());
    await parser.parse(videoArtifact());
    expect(probeCount).toBe(1);
  });

  it("re-probes when cacheTtlMs is 0 (each call is fresh)", async () => {
    const parser = makeParser(0);
    await parser.parse(videoArtifact());
    await parser.parse(videoArtifact());
    expect(probeCount).toBe(2);
  });

  it("recovery: after a flip from absent to present, next call routes normally", async () => {
    const parser = makeParser(0);
    probeReturns = false;
    await expect(parser.parse(videoArtifact())).rejects.toBeInstanceOf(
      UnsupportedContentTypeError,
    );
    probeReturns = true;
    const r = await parser.parse(videoArtifact());
    expect(r.parts).toHaveLength(1);
    expect(probeCount).toBe(2);
  });
});

describe("videoParser — supported content types", () => {
  it("registers all 6 video MIMEs in `acceptsContentTypes`", () => {
    const parser = createVideoParser();
    expect(parser.acceptsContentTypes).toEqual(
      expect.arrayContaining([
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "video/x-matroska",
        "video/x-msvideo",
        "video/mpeg",
      ]),
    );
  });

  it("parser key is `video`", () => {
    expect(createVideoParser().key).toBe("video");
  });
});
