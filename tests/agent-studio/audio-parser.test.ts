/**
 * Follow-up D4 — Audio parser unit tests.
 *
 * Locks the audio parser's contract per `D-PARSE-AUDIO-1..4`:
 *   - Engine-up: POST `/v1/audio/transcriptions` with multipart →
 *     Whisper `verbose_json` → one `extracted_artifact` unit.
 *   - Engine unconfigured (env vars empty): throws
 *     `UnsupportedContentTypeError` (dispatcher records as
 *     `status="unsupported_type"`); fetch is never called.
 *   - Engine runtime error (forge non-2xx): throws regular `Error`
 *     (dispatcher records as parser failure with the error preserved).
 *   - Empty transcript: `parts: []` (legitimate "no speech" case).
 *   - 16 MB size limit enforced before forge call.
 *   - language / duration / segments forwarded into json metadata.
 *
 * The parser is exercised via `createAudioParser` with injected
 * `getEnv` + `fetchImpl` fakes — no live forge required.
 */

import { describe, it, expect, vi } from "vitest";
import { createAudioParser } from "../../server/agent-studio/services/ingestion/parsers/audio-parser";
import { UnsupportedContentTypeError } from "../../server/agent-studio/services/ingestion/types";
import type { RawArtifact } from "../../server/agent-studio/services/ingestion/types";

function audioArtifact(
  contentType = "audio/mpeg",
  byteCount = 1024,
): RawArtifact {
  return {
    bytes: Buffer.alloc(byteCount, 0xa5),
    contentType,
    sourceUri: "memory://meeting.mp3",
    contentHash: "0".repeat(64),
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const okEnv = () => ({
  forgeApiUrl: "https://forge.test/api",
  forgeApiKey: "fake-key",
});

const emptyEnv = () => ({ forgeApiUrl: "", forgeApiKey: "" });

const SAMPLE_WHISPER = {
  task: "transcribe",
  language: "en",
  duration: 12.5,
  text: "Hello, world. This is a test.",
  segments: [
    {
      id: 0,
      seek: 0,
      start: 0,
      end: 6.2,
      text: " Hello, world.",
      tokens: [1, 2, 3],
      temperature: 0.0,
      avg_logprob: -0.18,
      compression_ratio: 1.34,
      no_speech_prob: 0.02,
    },
    {
      id: 1,
      seek: 0,
      start: 6.2,
      end: 12.5,
      text: " This is a test.",
      tokens: [4, 5, 6],
      temperature: 0.0,
      avg_logprob: -0.21,
      compression_ratio: 1.4,
      no_speech_prob: 0.01,
    },
  ],
};

describe("audioParser — engine-up happy path", () => {
  it("emits one extracted_artifact unit with text + language + duration + segments", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SAMPLE_WHISPER));
    const parser = createAudioParser({
      getEnv: okEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const r = await parser.parse(audioArtifact());

    expect(r.parserKey).toBe("audio");
    expect(r.fullText).toBe(SAMPLE_WHISPER.text);
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].unitTypeHint).toBe("extracted_artifact");
    expect(r.parts[0].text).toBe(SAMPLE_WHISPER.text);
    expect(r.parts[0].json).toMatchObject({
      engine: "whisper-1",
      language: "en",
      durationSec: 12.5,
      segmentCount: 2,
      contentType: "audio/mpeg",
    });
    const segments = (r.parts[0].json as { segments: unknown[] }).segments;
    expect(segments).toHaveLength(2);
  });

  it("posts multipart to {forgeApiUrl}/v1/audio/transcriptions with whisper-1 model", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SAMPLE_WHISPER));
    const parser = createAudioParser({
      getEnv: okEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await parser.parse(audioArtifact());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://forge.test/api/v1/audio/transcriptions");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
    expect(
      ((init as RequestInit).headers as Record<string, string>).authorization,
    ).toBe("Bearer fake-key");
  });

  it("treats forgeApiUrl with or without trailing slash identically", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SAMPLE_WHISPER));
    const parser = createAudioParser({
      getEnv: () => ({
        forgeApiUrl: "https://forge.test/api/",
        forgeApiKey: "k",
      }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await parser.parse(audioArtifact());
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://forge.test/api/v1/audio/transcriptions",
    );
  });

  it("treats missing language/duration as null and missing segments as [] (only text is required)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ text: "minimal" }));
    const parser = createAudioParser({
      getEnv: okEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const r = await parser.parse(audioArtifact());
    expect(r.parts[0].json).toMatchObject({
      language: null,
      durationSec: null,
      segmentCount: 0,
      segments: [],
    });
  });

  it("returns parts: [] when transcript is empty (legit no-speech case)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ text: "", language: "en", duration: 1.5, segments: [] }),
    );
    const parser = createAudioParser({
      getEnv: okEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const r = await parser.parse(audioArtifact());
    expect(r.parts).toEqual([]);
    expect(r.fullText).toBe("");
    expect(r.metadata).toMatchObject({ language: "en", durationSec: 1.5 });
  });
});

describe("audioParser — engine-unconfigured (D-PARSE-AUDIO-3)", () => {
  it("throws UnsupportedContentTypeError when both env vars are empty", async () => {
    const fetchImpl = vi.fn();
    const parser = createAudioParser({
      getEnv: emptyEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(parser.parse(audioArtifact())).rejects.toBeInstanceOf(
      UnsupportedContentTypeError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws UnsupportedContentTypeError when only forgeApiKey is missing", async () => {
    const parser = createAudioParser({
      getEnv: () => ({ forgeApiUrl: "https://forge.test", forgeApiKey: "" }),
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    await expect(parser.parse(audioArtifact())).rejects.toBeInstanceOf(
      UnsupportedContentTypeError,
    );
  });

  it("throws UnsupportedContentTypeError when only forgeApiUrl is missing", async () => {
    const parser = createAudioParser({
      getEnv: () => ({ forgeApiUrl: "", forgeApiKey: "k" }),
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    await expect(parser.parse(audioArtifact())).rejects.toBeInstanceOf(
      UnsupportedContentTypeError,
    );
  });

  it("error message names the offending env vars for operator triage", async () => {
    const parser = createAudioParser({
      getEnv: emptyEnv,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    try {
      await parser.parse(audioArtifact());
      throw new Error("expected throw");
    } catch (e) {
      expect((e as Error).message).toContain("BUILT_IN_FORGE_API_URL");
      expect((e as Error).message).toContain("BUILT_IN_FORGE_API_KEY");
    }
  });
});

describe("audioParser — engine runtime errors", () => {
  it("throws regular Error (not UnsupportedContentTypeError) on forge non-2xx", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("Bad Gateway", { status: 502, statusText: "Bad Gateway" }),
    );
    const parser = createAudioParser({
      getEnv: okEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const promise = parser.parse(audioArtifact());
    await expect(promise).rejects.toThrow(/502/);
    await expect(promise).rejects.not.toBeInstanceOf(
      UnsupportedContentTypeError,
    );
  });

  it("includes forge response body in the error for triage", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("rate limit exceeded", {
          status: 429,
          statusText: "Too Many Requests",
        }),
    );
    const parser = createAudioParser({
      getEnv: okEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    try {
      await parser.parse(audioArtifact());
      throw new Error("expected throw");
    } catch (e) {
      expect((e as Error).message).toContain("rate limit exceeded");
    }
  });

  it("throws when forge response is missing the required `text` field", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ language: "en", duration: 5 }),
    );
    const parser = createAudioParser({
      getEnv: okEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(parser.parse(audioArtifact())).rejects.toThrow(/text/);
  });
});

describe("audioParser — size limit", () => {
  it("rejects audio files larger than 16 MB before calling forge", async () => {
    const fetchImpl = vi.fn();
    const parser = createAudioParser({
      getEnv: okEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const big = audioArtifact("audio/mpeg", 17 * 1024 * 1024);
    await expect(parser.parse(big)).rejects.toThrow(/16 MB/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts files at the boundary (exactly 16 MB)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ text: "ok" }));
    const parser = createAudioParser({
      getEnv: okEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const exact = audioArtifact("audio/mpeg", 16 * 1024 * 1024);
    const r = await parser.parse(exact);
    expect(r.parts).toHaveLength(1);
  });
});

describe("audioParser — supported content types", () => {
  it("registers all 8 audio MIMEs in `acceptsContentTypes`", () => {
    const parser = createAudioParser();
    expect(parser.acceptsContentTypes).toEqual(
      expect.arrayContaining([
        "audio/webm",
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/wave",
        "audio/ogg",
        "audio/m4a",
        "audio/mp4",
      ]),
    );
  });

  it("parser key is `audio`", () => {
    expect(createAudioParser().key).toBe("audio");
  });
});
