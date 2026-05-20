/**
 * Source-scan integrity test for the GraphRetrievalRouter ↔
 * hybrid-ranker wiring (PR #1398 item 30 follow-up closure).
 *
 * Guards against regression where the ranker reverts to "exists but
 * has no callers." Every assertion checks a load-bearing wire in
 * `retrieval-router.ts`:
 *   - The ranker module is actually imported.
 *   - `GraphRetrievalInput` accepts caller-supplied `signalLookup`.
 *   - The router invokes `rankHybrid` on filtered blocks.
 *   - `contextBlocks` + `citations` get re-ordered by score.
 *   - `rankedBlocks` is surfaced on `GraphRetrievalOutput`.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("retrieval-router ↔ hybrid-ranker wiring", () => {
  const routerSrc = read(
    "server/agent-studio/services/graph/retrieval/retrieval-router.ts",
  );
  const bridgeSrc = read(
    "server/agent-studio/services/graph/retrieval/vector-text-signal-bridge.ts",
  );
  const publicApiSrc = read(
    "server/agent-studio/services/graph/retrieval/public-api.ts",
  );

  describe("router imports the ranker", () => {
    it("imports rankHybrid + extractDefaultSignals from hybrid-ranker", () => {
      expect(
        /import\s+\{[\s\S]+?extractDefaultSignals[\s\S]+?rankHybrid[\s\S]+?\}\s+from\s+["']\.\/hybrid-ranker\.js["']/.test(
          routerSrc,
        ),
      ).toBe(true);
    });

    it("imports the RankedBlock + RankSignals + HybridRankOptions types", () => {
      expect(/RankedBlock/.test(routerSrc)).toBe(true);
      expect(/RankSignals/.test(routerSrc)).toBe(true);
      expect(/HybridRankOptions/.test(routerSrc)).toBe(true);
    });
  });

  describe("GraphRetrievalInput accepts caller signals", () => {
    it("declares an optional signalLookup callback", () => {
      expect(
        /readonly\s+signalLookup\?:\s*\(block:\s*ContextBlockOutput\)\s*=>\s*Partial<RankSignals>/.test(
          routerSrc,
        ),
      ).toBe(true);
    });

    it("declares an optional rankOptions pass-through", () => {
      expect(/readonly\s+rankOptions\?:\s*HybridRankOptions/.test(routerSrc)).toBe(
        true,
      );
    });
  });

  describe("router invokes the ranker", () => {
    it("merges default signals with caller-supplied signals", () => {
      expect(
        /extractDefaultSignals\(block\)[\s\S]+?signalLookup\(block\)/.test(
          routerSrc,
        ),
      ).toBe(true);
      expect(/\{\s*\.\.\.defaults,\s*\.\.\.caller\s*\}/.test(routerSrc)).toBe(true);
    });

    it("calls rankHybrid with rankInputs + rankOptions", () => {
      expect(
        /rankHybrid\(rankInputs,\s*input\.rankOptions\s*\?\?\s*\{\}\)/.test(
          routerSrc,
        ),
      ).toBe(true);
    });

    it("re-orders contextBlocks AND citations by descending score", () => {
      expect(/orderedBlocks\s*=\s*rankedBlocks\.map\(\(r\)\s*=>\s*r\.block\)/.test(routerSrc)).toBe(
        true,
      );
      expect(/orderedCitations\s*=\s*orderedBlocks\.map\(\(b\)\s*=>\s*b\.citation\)/.test(routerSrc)).toBe(
        true,
      );
      expect(/contextBlocks:\s*orderedBlocks/.test(routerSrc)).toBe(true);
      expect(/citations:\s*orderedCitations/.test(routerSrc)).toBe(true);
    });

    it("surfaces rankedBlocks on the GraphRetrievalOutput return", () => {
      expect(/rankedBlocks,/.test(routerSrc)).toBe(true);
    });

    it("GraphRetrievalOutput interface declares the optional rankedBlocks field", () => {
      expect(
        /readonly\s+rankedBlocks\?:\s*ReadonlyArray<RankedBlock<ContextBlockOutput>>/.test(
          routerSrc,
        ),
      ).toBe(true);
    });

    it("ranking ALWAYS runs (no guard skipping graph-only paths)", () => {
      // Documented invariant: even without caller signals, hop +
      // confidence defaults still produce a stable order. Assert
      // there is no `if (input.signalLookup)` guard wrapped around
      // the rankHybrid call.
      const guarded =
        /if\s*\(input\.signalLookup\)[\s\S]+?rankHybrid\(/.test(routerSrc);
      expect(guarded).toBe(false);
    });
  });

  describe("vector-text-signal-bridge module", () => {
    it("exports buildSignalLookup + composeSignalLookups", () => {
      expect(/export\s+function\s+buildSignalLookup/.test(bridgeSrc)).toBe(true);
      expect(/export\s+function\s+composeSignalLookups/.test(bridgeSrc)).toBe(
        true,
      );
    });

    it("keys lookups on ContextBlockOutput.id", () => {
      expect(/block\.id/.test(bridgeSrc)).toBe(true);
    });

    it("returns Partial<RankSignals> per block", () => {
      expect(
        /\(block:\s*ContextBlockOutput\)\s*=>\s*Partial<RankSignals>/.test(
          bridgeSrc,
        ),
      ).toBe(true);
    });

    it("supports all three axes: vector + text + freshness", () => {
      expect(/vectorHits/.test(bridgeSrc)).toBe(true);
      expect(/textHits/.test(bridgeSrc)).toBe(true);
      expect(/freshnessHits/.test(bridgeSrc)).toBe(true);
    });
  });

  describe("public-api barrel", () => {
    it("re-exports the ranker surface", () => {
      expect(/rankHybrid/.test(publicApiSrc)).toBe(true);
      expect(/extractDefaultSignals/.test(publicApiSrc)).toBe(true);
      expect(/DEFAULT_RANK_WEIGHTS/.test(publicApiSrc)).toBe(true);
    });

    it("re-exports the signal bridge surface", () => {
      expect(/buildSignalLookup/.test(publicApiSrc)).toBe(true);
      expect(/composeSignalLookups/.test(publicApiSrc)).toBe(true);
      expect(/VectorRetrieverHit/.test(publicApiSrc)).toBe(true);
      expect(/TextRetrieverHit/.test(publicApiSrc)).toBe(true);
    });
  });
});
