/**
 * Phase B §T-B.4-assemble — Static-chunk assemble lane hook lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  defaultAssembleShouldContribute,
  defaultTokensAttributed,
  makeStaticChunkAssembleHook,
} from "../../server/agent-studio/services/extensions/static-chunk-assemble-hook.js";
import type {
  ContractedRetrievalChunk,
} from "../../server/agent-studio/services/extensions/lane-hook-contracts.js";
import type {
  ExtensionRecord,
  InvokeFromExtensionInput,
} from "../../server/agent-studio/services/extensions/contracts.js";

function makeExtensionStub(): ExtensionRecord {
  return {
    id: 7,
    workspaceId: 1,
    extensionKey: "test-static-chunk",
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

function makeInput(args: Record<string, unknown> = {}): InvokeFromExtensionInput {
  return {
    extensionKey: "test-static-chunk",
    lane: "assemble",
    capabilityKey: "static-chunk:contribute",
    arguments: args,
  } as InvokeFromExtensionInput;
}

const CHUNK_A: ContractedRetrievalChunk = {
  content: "Workspace policy summary: 256 chars max per response.",
  provenance: { sourceType: "static-chunk", sourceId: "policy-summary" },
};

const CHUNK_B: ContractedRetrievalChunk = {
  content: "Operator-mandated citation footer.",
  provenance: { sourceType: "static-chunk", sourceId: "citation-footer" },
};

describe("makeStaticChunkAssembleHook (T-B.4-assemble)", () => {
  it("contributes fixed chunks when predicate defaults to always", async () => {
    const hook = makeStaticChunkAssembleHook({ chunks: [CHUNK_A, CHUNK_B] });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput(),
    });
    expect(out.succeeded).toBe(true);
    expect(out.supplementalChunks).toEqual([CHUNK_A, CHUNK_B]);
    expect(typeof out.tokensAttributed).toBe("number");
    expect(out.tokensAttributed).toBeGreaterThan(0);
  });

  it("contributes nothing when predicate returns false", async () => {
    const hook = makeStaticChunkAssembleHook({
      chunks: [CHUNK_A],
      shouldContribute: () => false,
    });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput(),
    });
    expect(out.succeeded).toBe(true);
    expect(out.supplementalChunks).toBeUndefined();
    expect(out.tokensAttributed).toBeUndefined();
  });

  it("contributes when predicate returns true", async () => {
    const hook = makeStaticChunkAssembleHook({
      chunks: [CHUNK_A],
      shouldContribute: ({ input }) => input.capabilityKey === "static-chunk:contribute",
    });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput(),
    });
    expect(out.supplementalChunks).toEqual([CHUNK_A]);
  });

  it("empty chunk list contributes nothing", async () => {
    const hook = makeStaticChunkAssembleHook({ chunks: [] });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput(),
    });
    expect(out.succeeded).toBe(true);
    expect(out.supplementalChunks).toBeUndefined();
  });

  it("predicate receives extension + input params", async () => {
    let capturedExt: unknown = null;
    let capturedInput: unknown = null;
    const hook = makeStaticChunkAssembleHook({
      chunks: [CHUNK_A],
      shouldContribute: ({ extension, input }) => {
        capturedExt = extension;
        capturedInput = input;
        return true;
      },
    });
    const ext = makeExtensionStub();
    const inp = makeInput({ key: "value" });
    await hook({ extension: ext, input: inp });
    expect(capturedExt).toBe(ext);
    expect(capturedInput).toBe(inp);
  });

  it("explicit tokensAttributed overrides the default estimator", async () => {
    const hook = makeStaticChunkAssembleHook({
      chunks: [CHUNK_A, CHUNK_B],
      tokensAttributed: 99,
    });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput(),
    });
    expect(out.tokensAttributed).toBe(99);
  });

  it("never returns succeeded: false (factory-level error mode)", async () => {
    const onHook = makeStaticChunkAssembleHook({ chunks: [CHUNK_A] });
    const offHook = makeStaticChunkAssembleHook({
      chunks: [CHUNK_A],
      shouldContribute: () => false,
    });
    const emptyHook = makeStaticChunkAssembleHook({ chunks: [] });
    const o1 = await onHook({ extension: makeExtensionStub(), input: makeInput() });
    const o2 = await offHook({ extension: makeExtensionStub(), input: makeInput() });
    const o3 = await emptyHook({ extension: makeExtensionStub(), input: makeInput() });
    expect(o1.succeeded).toBe(true);
    expect(o2.succeeded).toBe(true);
    expect(o3.succeeded).toBe(true);
  });
});

describe("defaultTokensAttributed (T-B.4-assemble)", () => {
  it("returns 0 for empty array", () => {
    expect(defaultTokensAttributed([])).toBe(0);
  });

  it("returns ceil(chars/4) for single chunk", () => {
    expect(defaultTokensAttributed([{ content: "abcd", provenance: { sourceType: "x", sourceId: "y" } }])).toBe(1);
    expect(defaultTokensAttributed([{ content: "abcde", provenance: { sourceType: "x", sourceId: "y" } }])).toBe(2);
  });

  it("sums across multiple chunks", () => {
    const chunks: ContractedRetrievalChunk[] = [
      { content: "aaaa", provenance: { sourceType: "x", sourceId: "1" } },
      { content: "bbbb", provenance: { sourceType: "x", sourceId: "2" } },
    ];
    expect(defaultTokensAttributed(chunks)).toBe(2);
  });

  it("returns 0 for chunks with empty content", () => {
    expect(
      defaultTokensAttributed([
        { content: "", provenance: { sourceType: "x", sourceId: "y" } },
      ]),
    ).toBe(0);
  });
});

describe("defaultAssembleShouldContribute (T-B.4-assemble)", () => {
  it("always returns true (always contribute)", () => {
    expect(
      defaultAssembleShouldContribute({
        extension: makeExtensionStub(),
        input: makeInput(),
      }),
    ).toBe(true);
  });
});
