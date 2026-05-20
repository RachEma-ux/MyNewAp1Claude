/**
 * Behavior test for the vector + text signal bridge.
 *
 * Closes the partial-implementation gap from PR #1398 item 30
 * follow-up ("vector/text signal caller wiring is a separate slice").
 * `buildSignalLookup` projects vector / lexical / freshness retriever
 * results into the per-block signal lookup that the retrieval router
 * threads into `rankHybrid`.
 */

import { describe, expect, it } from "vitest";
import {
  buildSignalLookup,
  composeSignalLookups,
} from "../../server/agent-studio/services/graph/retrieval/vector-text-signal-bridge";
import type { ContextBlockOutput } from "../../server/agent-studio/services/graph/retrieval/safety-filter";

function makeBlock(id: string): ContextBlockOutput {
  return {
    id,
    kind: "text",
    sourceKind: "Note",
    sourceId: id,
    payload: {},
    citation: { sourceKind: "Note", sourceId: id },
  };
}

describe("vector + text signal bridge", () => {
  describe("buildSignalLookup", () => {
    it("maps vector hits to vectorScore by block id", () => {
      const lookup = buildSignalLookup({
        vectorHits: [
          { blockId: "a", score: 0.9 },
          { blockId: "b", score: 0.4 },
        ],
      });
      expect(lookup(makeBlock("a")).vectorScore).toBe(0.9);
      expect(lookup(makeBlock("b")).vectorScore).toBe(0.4);
      // Unknown ids return undefined (ranker treats as "no signal").
      expect(lookup(makeBlock("c")).vectorScore).toBeUndefined();
    });

    it("maps text hits to textScore independently of vectorScore", () => {
      const lookup = buildSignalLookup({
        textHits: [{ blockId: "a", score: 0.7 }],
      });
      const s = lookup(makeBlock("a"));
      expect(s.textScore).toBe(0.7);
      expect(s.vectorScore).toBeUndefined();
    });

    it("maps freshness hits to freshness signal", () => {
      const lookup = buildSignalLookup({
        freshnessHits: [{ blockId: "a", score: 0.5 }],
      });
      expect(lookup(makeBlock("a")).freshness).toBe(0.5);
    });

    it("merges all three axes for the same block", () => {
      const lookup = buildSignalLookup({
        vectorHits: [{ blockId: "a", score: 0.9 }],
        textHits: [{ blockId: "a", score: 0.7 }],
        freshnessHits: [{ blockId: "a", score: 0.5 }],
      });
      expect(lookup(makeBlock("a"))).toEqual({
        vectorScore: 0.9,
        textScore: 0.7,
        freshness: 0.5,
      });
    });

    it("returns an empty object (not null) for an unknown block id", () => {
      const lookup = buildSignalLookup({
        vectorHits: [{ blockId: "a", score: 0.9 }],
      });
      expect(lookup(makeBlock("z"))).toEqual({});
    });

    it("handles an empty input bag", () => {
      const lookup = buildSignalLookup({});
      expect(lookup(makeBlock("a"))).toEqual({});
    });
  });

  describe("composeSignalLookups", () => {
    it("layers two lookups; later lookup wins on overlap", () => {
      const base = buildSignalLookup({
        vectorHits: [{ blockId: "a", score: 0.3 }],
      });
      const override = buildSignalLookup({
        vectorHits: [{ blockId: "a", score: 0.95 }],
      });
      const merged = composeSignalLookups(base, override);
      expect(merged(makeBlock("a")).vectorScore).toBe(0.95);
    });

    it("merges complementary axes without clobbering", () => {
      const vectorOnly = buildSignalLookup({
        vectorHits: [{ blockId: "a", score: 0.9 }],
      });
      const textOnly = buildSignalLookup({
        textHits: [{ blockId: "a", score: 0.7 }],
      });
      const merged = composeSignalLookups(vectorOnly, textOnly);
      expect(merged(makeBlock("a"))).toEqual({
        vectorScore: 0.9,
        textScore: 0.7,
      });
    });

    it("returns an empty object when no lookup contributes", () => {
      const merged = composeSignalLookups(
        buildSignalLookup({}),
        buildSignalLookup({}),
      );
      expect(merged(makeBlock("a"))).toEqual({});
    });
  });
});
