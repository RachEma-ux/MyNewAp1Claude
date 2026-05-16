/**
 * Phase B §T-B.4-compose — Static-block compose lane hook lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  defaultComposeShouldContribute,
  makeStaticBlockComposeHook,
} from "../../server/agent-studio/services/extensions/static-block-compose-hook.js";
import type {
  ExtensionRecord,
  InvokeFromExtensionInput,
} from "../../server/agent-studio/services/extensions/contracts.js";

function makeExtensionStub(): ExtensionRecord {
  return {
    id: 9,
    workspaceId: 1,
    extensionKey: "test-static-block",
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
    extensionKey: "test-static-block",
    lane: "compose",
    capabilityKey: "static-block:contribute",
    arguments: args,
  } as InvokeFromExtensionInput;
}

const BLOCK_A: Record<string, unknown> = {
  kind: "citation-rewrite",
  pattern: "[REF:%d]",
};

const BLOCK_B: Record<string, unknown> = {
  kind: "redaction-marker",
  fields: ["ssn", "credit_card"],
};

describe("makeStaticBlockComposeHook (T-B.4-compose)", () => {
  it("contributes fixed blocks when predicate defaults to always", async () => {
    const hook = makeStaticBlockComposeHook({ blocks: [BLOCK_A, BLOCK_B] });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput(),
    });
    expect(out.succeeded).toBe(true);
    expect(out.supplementalBlocks).toEqual([BLOCK_A, BLOCK_B]);
  });

  it("contributes nothing when predicate returns false", async () => {
    const hook = makeStaticBlockComposeHook({
      blocks: [BLOCK_A],
      shouldContribute: () => false,
    });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput(),
    });
    expect(out.succeeded).toBe(true);
    expect(out.supplementalBlocks).toBeUndefined();
  });

  it("contributes when predicate returns true", async () => {
    const hook = makeStaticBlockComposeHook({
      blocks: [BLOCK_A],
      shouldContribute: ({ input }) => input.capabilityKey === "static-block:contribute",
    });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput(),
    });
    expect(out.supplementalBlocks).toEqual([BLOCK_A]);
  });

  it("empty block list contributes nothing", async () => {
    const hook = makeStaticBlockComposeHook({ blocks: [] });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput(),
    });
    expect(out.succeeded).toBe(true);
    expect(out.supplementalBlocks).toBeUndefined();
  });

  it("predicate receives extension + input params", async () => {
    let capturedExt: unknown = null;
    let capturedInput: unknown = null;
    const hook = makeStaticBlockComposeHook({
      blocks: [BLOCK_A],
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

  it("passes blocks through opaquely (no inspection / mutation)", async () => {
    const customBlock = {
      kind: "custom",
      nested: { deep: { value: 42 } },
      arr: [1, 2, 3],
    };
    const hook = makeStaticBlockComposeHook({ blocks: [customBlock] });
    const out = await hook({
      extension: makeExtensionStub(),
      input: makeInput(),
    });
    expect(out.supplementalBlocks).toEqual([customBlock]);
    expect(out.supplementalBlocks?.[0]).toBe(customBlock);
  });

  it("never returns succeeded: false (factory-level error mode)", async () => {
    const onHook = makeStaticBlockComposeHook({ blocks: [BLOCK_A] });
    const offHook = makeStaticBlockComposeHook({
      blocks: [BLOCK_A],
      shouldContribute: () => false,
    });
    const emptyHook = makeStaticBlockComposeHook({ blocks: [] });
    const o1 = await onHook({ extension: makeExtensionStub(), input: makeInput() });
    const o2 = await offHook({ extension: makeExtensionStub(), input: makeInput() });
    const o3 = await emptyHook({ extension: makeExtensionStub(), input: makeInput() });
    expect(o1.succeeded).toBe(true);
    expect(o2.succeeded).toBe(true);
    expect(o3.succeeded).toBe(true);
  });
});

describe("defaultComposeShouldContribute (T-B.4-compose)", () => {
  it("always returns true (always contribute)", () => {
    expect(
      defaultComposeShouldContribute({
        extension: makeExtensionStub(),
        input: makeInput(),
      }),
    ).toBe(true);
  });
});
