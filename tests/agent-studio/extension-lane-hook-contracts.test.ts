/**
 * Extension lane hook contracts — V1+ 18-γ-contracts (PR-V1-42).
 *
 * Covers:
 *   - CONTRACTED_EXTENSION_LANES closed 3-value union (retrieve,
 *     assemble, compose) — excludes the dispatcher-only "tool" lane.
 *   - Contract types compose with the existing lane-hooks registry:
 *     a registered hook conforming to a contract is retrievable and
 *     invocable, and returns the contract-shaped outcome.
 *   - Contracted retrieve outcome carries supplemental chunks +
 *     plan items shape.
 *   - Contracted assemble outcome carries supplemental chunks +
 *     tokensAttributed.
 *   - Contracted compose outcome carries supplemental blocks.
 *   - Provenance fields are required on every contributed chunk
 *     (type-level — exercised by constructing valid + structural-
 *     verifying samples at runtime).
 *   - Public-api re-export shape.
 *   - Source-scan boundary: contract module is hard-rule clean.
 *
 * NOTE: the `tool` lane is excluded from the typed surface by
 * construction (`ContractedExtensionLane` doesn't include it). A
 * compile-time test ensures `ContractedLaneHookFn<"tool">` is not a
 * valid instantiation (commented out as a documentary test — leaving
 * the test in would intentionally fail tsc; we verify the same
 * invariant via the const-array equality assertion below).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CONTRACTED_EXTENSION_LANES,
  type ContractedAssembleOutcome,
  type ContractedComposeOutcome,
  type ContractedLaneHookFn,
  type ContractedLaneHookOutcome,
  type ContractedRetrievalChunk,
  type ContractedRetrieveOutcome,
} from "../../server/agent-studio/services/extensions/lane-hook-contracts.js";
import {
  __resetExtensionLaneHooksForTests,
  getLaneHook,
  registerLaneHook,
  type LaneHookFn,
} from "../../server/agent-studio/services/extensions/lane-hooks.js";
import type {
  ExtensionRecord,
  InvokeFromExtensionInput,
} from "../../server/agent-studio/services/extensions/contracts.js";

afterEach(() => {
  __resetExtensionLaneHooksForTests();
});

const FAKE_EXTENSION: ExtensionRecord = {
  id: 1,
  workspaceId: 10,
  extensionKey: "test-ext",
  name: "Test Extension",
  version: "0.1.0",
  signingKeyId: null,
  governanceStatus: "approved",
  capabilityLanes: ["retrieve", "assemble", "compose"],
  declaredToolNames: [],
  config: null,
  installedAt: new Date(),
  approvedAt: new Date(),
  disabledAt: null,
};

function fakeInput(lane: "retrieve" | "assemble" | "compose"): InvokeFromExtensionInput {
  return {
    extensionId: 1,
    lane,
  };
}

describe("CONTRACTED_EXTENSION_LANES taxonomy", () => {
  it("is the closed 3-value union (excludes the dispatcher-only tool lane)", () => {
    expect([...CONTRACTED_EXTENSION_LANES]).toEqual([
      "retrieve",
      "assemble",
      "compose",
    ]);
  });
});

describe("contracted retrieve outcome shape", () => {
  it("accepts supplemental plan items + chunks with provenance", () => {
    const chunk: ContractedRetrievalChunk = {
      content: "supplemental",
      score: 0.7,
      provenance: {
        sourceType: "extension_static",
        sourceId: "ext:1:item:42",
        sourceVersionId: "v1",
        authoredAt: new Date(),
      },
    };
    const outcome: ContractedRetrieveOutcome = {
      succeeded: true,
      supplementalChunks: [chunk],
    };
    expect(outcome.supplementalChunks).toHaveLength(1);
    expect(outcome.supplementalChunks?.[0].provenance.sourceType).toBe(
      "extension_static",
    );
  });

  it("provenance fields are part of the chunk shape (runtime structural check)", () => {
    const chunk: ContractedRetrievalChunk = {
      content: "x",
      provenance: { sourceType: "t", sourceId: "id" },
    };
    expect("sourceType" in chunk.provenance).toBe(true);
    expect("sourceId" in chunk.provenance).toBe(true);
  });
});

describe("contracted assemble outcome shape", () => {
  it("accepts supplemental chunks + tokensAttributed", () => {
    const outcome: ContractedAssembleOutcome = {
      succeeded: true,
      supplementalChunks: [
        {
          content: "snippet",
          provenance: { sourceType: "extension_assemble", sourceId: "x" },
        },
      ],
      tokensAttributed: 128,
    };
    expect(outcome.tokensAttributed).toBe(128);
  });
});

describe("contracted compose outcome shape", () => {
  it("accepts supplemental userBlocks (CAG BuildPackInput shape)", () => {
    const outcome: ContractedComposeOutcome = {
      succeeded: true,
      supplementalBlocks: [
        {
          kind: "user_text",
          content: "extension contribution",
        } as unknown as ContractedComposeOutcome["supplementalBlocks"] extends
          | readonly (infer B)[]
          | undefined
          ? B
          : never,
      ],
    };
    expect(outcome.supplementalBlocks).toHaveLength(1);
  });
});

describe("contract composes with the existing lane-hooks registry", () => {
  it("a ContractedLaneHookFn<\"retrieve\"> is assignable to LaneHookFn", async () => {
    const retrieveHook: ContractedLaneHookFn<"retrieve"> = async () => ({
      succeeded: true,
      supplementalChunks: [
        {
          content: "via contract",
          provenance: { sourceType: "ext", sourceId: "id-1" },
        },
      ],
    });
    // Up-cast: contract is a refinement of LaneHookFn. Up-casting is
    // safe because Contracted*Outcome extends LaneHookOutcome.
    const registryHook: LaneHookFn = retrieveHook;
    registerLaneHook("retrieve", registryHook);
    const got = getLaneHook("retrieve");
    expect(got).toBe(registryHook);
    const result = await got!({
      extension: FAKE_EXTENSION,
      input: fakeInput("retrieve"),
    });
    expect(result.succeeded).toBe(true);
    expect("supplementalChunks" in (result as ContractedRetrieveOutcome)).toBe(
      true,
    );
  });

  it("a ContractedLaneHookFn<\"assemble\"> is assignable to LaneHookFn", async () => {
    const assembleHook: ContractedLaneHookFn<"assemble"> = async () => ({
      succeeded: true,
      tokensAttributed: 64,
    });
    const registryHook: LaneHookFn = assembleHook;
    registerLaneHook("assemble", registryHook);
    const result = await getLaneHook("assemble")!({
      extension: FAKE_EXTENSION,
      input: fakeInput("assemble"),
    });
    expect((result as ContractedAssembleOutcome).tokensAttributed).toBe(64);
  });

  it("a ContractedLaneHookFn<\"compose\"> is assignable to LaneHookFn", async () => {
    const composeHook: ContractedLaneHookFn<"compose"> = async () => ({
      succeeded: true,
    });
    const registryHook: LaneHookFn = composeHook;
    registerLaneHook("compose", registryHook);
    const result = await getLaneHook("compose")!({
      extension: FAKE_EXTENSION,
      input: fakeInput("compose"),
    });
    expect(result.succeeded).toBe(true);
  });
});

describe("discriminated outcome union", () => {
  it("ContractedLaneHookOutcome includes all three contracted outcomes", () => {
    const r: ContractedLaneHookOutcome = { succeeded: true } as ContractedRetrieveOutcome;
    const a: ContractedLaneHookOutcome = { succeeded: true } as ContractedAssembleOutcome;
    const c: ContractedLaneHookOutcome = { succeeded: true } as ContractedComposeOutcome;
    expect(r.succeeded).toBe(true);
    expect(a.succeeded).toBe(true);
    expect(c.succeeded).toBe(true);
  });
});

describe("public-api re-exports", () => {
  it("the extensions barrel re-exports the contract surface", async () => {
    const barrel = await import(
      "../../server/agent-studio/services/extensions/public-api.js"
    );
    expect([...barrel.CONTRACTED_EXTENSION_LANES]).toEqual([
      "retrieve",
      "assemble",
      "compose",
    ]);
  });
});

describe("source-scan boundary", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/lane-hook-contracts.ts",
  );
  const src = readFileSync(file, "utf8");

  it("does not import credential-resolver", () => {
    expect(/from\s+["'][^"']*credential-resolver/.test(src)).toBe(false);
  });

  it("does not import dispatchMcpToolCall", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        src,
      ),
    ).toBe(false);
  });

  it("does not read process.env.*_API_KEY", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(src)).toBe(false);
  });

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(src)).toBe(false);
  });

  it("does not import openrouter model-access", () => {
    expect(/from\s+["'][^"']*openrouter\/model-access/.test(src)).toBe(false);
  });

  it("does not import GraphRepository", () => {
    expect(/from\s+["'][^"']*graph\/repository/.test(src)).toBe(false);
  });

  it("RAC types are imported type-only (runtime boundary preserved)", () => {
    // The file uses multi-line `import type { ... } from "../rac/..."`;
    // check the whole block by matching `import type` ... `from "../rac/`.
    expect(
      /import\s+type\s*\{[^}]*\}\s*from\s+["']\.\.\/rac\//s.test(src),
    ).toBe(true);
    // And confirm no plain (non-type) value import from RAC.
    expect(/import\s+\{[^}]*\}\s*from\s+["']\.\.\/rac\//s.test(src)).toBe(
      false,
    );
  });

  it("CAG types are imported type-only", () => {
    expect(
      /import\s+type\s*\{[^}]*\}\s*from\s+["']\.\.\/cag\//s.test(src),
    ).toBe(true);
    expect(/import\s+\{[^}]*\}\s*from\s+["']\.\.\/cag\//s.test(src)).toBe(
      false,
    );
  });
});
