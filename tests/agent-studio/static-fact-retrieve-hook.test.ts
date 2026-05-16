/**
 * Phase B §T-B.4-retrieve — Static-fact retrieve lane hook lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  defaultExtractFactKey,
  makeStaticFactChunk,
  makeStaticFactRetrieveHook,
} from "../../server/agent-studio/services/extensions/static-fact-retrieve-hook.js";
import type {
  ExtensionRecord,
  InvokeFromExtensionInput,
} from "../../server/agent-studio/services/extensions/contracts.js";

function makeExtensionStub(): ExtensionRecord {
  return {
    id: 7,
    workspaceId: 1,
    extensionKey: "test-static-fact",
    name: "Test",
    description: null,
    version: "0.0.1",
    manifest: {} as never,
    signingKeyId: null,
    governanceStatus: "approved",
    installedAt: new Date(),
    installedByUserId: 1,
    approvedAt: null,
    approvedByUserId: null,
    disabledAt: null,
    disabledByUserId: null,
    config: {},
  } as unknown as ExtensionRecord;
}

function makeInput(args: Record<string, unknown>): InvokeFromExtensionInput {
  return {
    extensionKey: "test-static-fact",
    lane: "retrieve",
    capabilityKey: "static-fact:read",
    arguments: args,
  } as InvokeFromExtensionInput;
}

const SAMPLE_CHUNK = makeStaticFactChunk({
  content: "The capital of France is Paris.",
  score: 0.9,
  provenance: {
    sourceType: "static-fact",
    sourceId: "geography:france-capital",
  },
});

describe("makeStaticFactRetrieveHook (T-B.4-retrieve)", () => {
  it("contributes a supplemental chunk when factKey matches", async () => {
    const hook = makeStaticFactRetrieveHook({
      facts: [{ factKey: "france_capital", chunk: SAMPLE_CHUNK }],
    });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput({ factKey: "france_capital" }),
    });
    expect(out.succeeded).toBe(true);
    expect(out.supplementalChunks).toEqual([SAMPLE_CHUNK]);
  });

  it("contributes nothing when factKey does not match", async () => {
    const hook = makeStaticFactRetrieveHook({
      facts: [{ factKey: "france_capital", chunk: SAMPLE_CHUNK }],
    });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput({ factKey: "unknown_key" }),
    });
    expect(out.succeeded).toBe(true);
    expect(out.supplementalChunks).toBeUndefined();
  });

  it("contributes nothing when arguments.factKey is missing", async () => {
    const hook = makeStaticFactRetrieveHook({
      facts: [{ factKey: "france_capital", chunk: SAMPLE_CHUNK }],
    });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput({}),
    });
    expect(out.succeeded).toBe(true);
    expect(out.supplementalChunks).toBeUndefined();
  });

  it("contributes nothing when factKey is non-string", async () => {
    const hook = makeStaticFactRetrieveHook({
      facts: [{ factKey: "france_capital", chunk: SAMPLE_CHUNK }],
    });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput({ factKey: 42 as unknown as string }),
    });
    expect(out.succeeded).toBe(true);
    expect(out.supplementalChunks).toBeUndefined();
  });

  it("duplicate fact keys: last-write-wins", async () => {
    const chunk2 = makeStaticFactChunk({
      content: "Replacement",
      provenance: { sourceType: "static-fact", sourceId: "replacement" },
    });
    const hook = makeStaticFactRetrieveHook({
      facts: [
        { factKey: "k", chunk: SAMPLE_CHUNK },
        { factKey: "k", chunk: chunk2 },
      ],
    });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput({ factKey: "k" }),
    });
    expect(out.supplementalChunks).toEqual([chunk2]);
  });

  it("empty fact table contributes nothing for any key", async () => {
    const hook = makeStaticFactRetrieveHook({ facts: [] });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput({ factKey: "anything" }),
    });
    expect(out.succeeded).toBe(true);
    expect(out.supplementalChunks).toBeUndefined();
  });

  it("custom extractFactKey overrides the default", async () => {
    const hook = makeStaticFactRetrieveHook({
      facts: [{ factKey: "shifted", chunk: SAMPLE_CHUNK }],
      extractFactKey: (args) => {
        const v = args?.altKey;
        return typeof v === "string" ? v : null;
      },
    });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput({ altKey: "shifted" }),
    });
    expect(out.supplementalChunks).toEqual([SAMPLE_CHUNK]);
  });

  it("never returns succeeded: false (factory-level error mode)", async () => {
    const hook = makeStaticFactRetrieveHook({
      facts: [{ factKey: "k", chunk: SAMPLE_CHUNK }],
    });
    const matchOut = await hook({
      extension: makeExtensionStub(),
      input: makeInput({ factKey: "k" }),
    });
    const missOut = await hook({
      extension: makeExtensionStub(),
      input: makeInput({ factKey: "missing" }),
    });
    const nullOut = await hook({
      extension: makeExtensionStub(),
      input: makeInput({}),
    });
    expect(matchOut.succeeded).toBe(true);
    expect(missOut.succeeded).toBe(true);
    expect(nullOut.succeeded).toBe(true);
  });
});

describe("defaultExtractFactKey (T-B.4-retrieve)", () => {
  it("extracts string factKey", () => {
    expect(defaultExtractFactKey({ factKey: "ok" })).toBe("ok");
  });

  it("returns null for missing arguments", () => {
    expect(defaultExtractFactKey(undefined)).toBeNull();
  });

  it("returns null for empty arguments", () => {
    expect(defaultExtractFactKey({})).toBeNull();
  });

  it("returns null for non-string factKey", () => {
    expect(defaultExtractFactKey({ factKey: 123 })).toBeNull();
    expect(defaultExtractFactKey({ factKey: null })).toBeNull();
    expect(defaultExtractFactKey({ factKey: {} })).toBeNull();
  });

  it("returns null for empty-string factKey", () => {
    expect(defaultExtractFactKey({ factKey: "" })).toBeNull();
  });
});

describe("makeStaticFactChunk (T-B.4-retrieve)", () => {
  it("builds a ContractedRetrievalChunk with provenance", () => {
    const chunk = makeStaticFactChunk({
      content: "hello",
      provenance: { sourceType: "static-fact", sourceId: "x" },
    });
    expect(chunk.content).toBe("hello");
    expect(chunk.provenance.sourceType).toBe("static-fact");
    expect(chunk.provenance.sourceId).toBe("x");
  });

  it("preserves optional score", () => {
    const chunk = makeStaticFactChunk({
      content: "x",
      score: 0.5,
      provenance: { sourceType: "static-fact", sourceId: "x" },
    });
    expect(chunk.score).toBe(0.5);
  });
});
