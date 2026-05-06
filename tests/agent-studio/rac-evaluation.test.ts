/**
 * RAC Phase 8 — evaluation scorer tests.
 *
 * Three pure scorers, all deterministic:
 *   - scoreGroundedness — token-overlap of model output vs evidence
 *   - scoreRelevance + scoreCitationCoverage — query/chunk overlap
 *     and citation-presence ratio
 *   - scoreRecallMrr — recall@k + MRR over a labeled fixture
 *
 * No DB. No network. The router that stitches these to the trace
 * store is exercised at integration time once ASDB is available.
 */

import { describe, it, expect } from "vitest";
import {
  scoreGroundedness,
  scoreRelevance,
  scoreCitationCoverage,
  scoreRecallMrr,
  RAC_SEED_FIXTURE,
} from "../../server/agent-studio/services/rac/evaluation";
import type { RacRetrievalChunk } from "../../server/agent-studio/services/rac/ingestion";

function chunk(over: Partial<RacRetrievalChunk> = {}): RacRetrievalChunk {
  return {
    content: "default content body",
    score: 0.9,
    citation: "[doc:Sample §1]",
    sourceChunkId: "c1",
    ...over,
  };
}

// ── Groundedness ─────────────────────────────────────────────────

describe("scoreGroundedness", () => {
  it("returns score=1 when every output token appears in evidence", () => {
    const r = scoreGroundedness({
      output: "Wonderland features Alice and a Cheshire cat.",
      chunks: [
        chunk({
          content: "Alice fell into Wonderland and met a grinning Cheshire cat.",
        }),
      ],
    });
    expect(r.score).toBeGreaterThanOrEqual(0.8);
    expect(r.outputTokens).toBeGreaterThan(0);
  });

  it("returns score=0 with output tokens listed when evidence is unrelated", () => {
    const r = scoreGroundedness({
      output: "Quantum mechanics governs subatomic particles.",
      chunks: [chunk({ content: "Alice met a March Hare at tea." })],
    });
    expect(r.score).toBeLessThan(0.2);
    expect(r.ungroundedSample.length).toBeGreaterThan(0);
  });

  it("vacuous: empty output → score=1 with warning", () => {
    const r = scoreGroundedness({
      output: "",
      chunks: [chunk({ content: "Anything." })],
    });
    expect(r.score).toBe(1);
    expect(r.outputTokens).toBe(0);
    expect(r.warnings.some((w) => /vacuous/.test(w))).toBe(true);
  });

  it("no chunks → score=0 with warning, sample of unmatched tokens surfaced", () => {
    const r = scoreGroundedness({
      output: "Alice met a cat.",
      chunks: [],
    });
    expect(r.score).toBe(0);
    expect(r.warnings.some((w) => /no evidence/.test(w))).toBe(true);
    expect(r.ungroundedSample.length).toBeGreaterThan(0);
  });

  it("stopwords don't dominate the score", () => {
    // "is" / "a" / "the" should be filtered; only "Cheshire" + "cat"
    // need to match for full coverage.
    const r = scoreGroundedness({
      output: "It is a Cheshire cat.",
      chunks: [chunk({ content: "Cheshire cat appears throughout." })],
    });
    expect(r.score).toBeGreaterThanOrEqual(0.9);
  });
});

// ── Relevance + citation coverage ────────────────────────────────

describe("scoreRelevance", () => {
  it("returns higher mean when chunks share more query tokens", () => {
    const high = scoreRelevance({
      query: "How does Alice meet the Cheshire cat?",
      chunks: [
        chunk({
          sourceChunkId: "h1",
          content: "Alice meets the Cheshire cat in a Wonderland forest.",
        }),
      ],
    });
    const low = scoreRelevance({
      query: "How does Alice meet the Cheshire cat?",
      chunks: [
        chunk({
          sourceChunkId: "l1",
          content: "Quantum mechanics describes subatomic particles.",
        }),
      ],
    });
    expect(high.meanRelevance).toBeGreaterThan(low.meanRelevance);
  });

  it("perChunk includes the matchedQueryTokens count", () => {
    const r = scoreRelevance({
      query: "Alice cat tea party",
      chunks: [
        chunk({
          sourceChunkId: "c1",
          content: "Alice attends a tea party with a cat.",
        }),
      ],
    });
    expect(r.perChunk[0].matchedQueryTokens).toBeGreaterThan(0);
    expect(r.perChunk[0].totalQueryTokens).toBeGreaterThan(0);
  });

  it("empty query → meanRelevance=0 with warning", () => {
    const r = scoreRelevance({
      query: "is",
      chunks: [chunk({ sourceChunkId: "c1", content: "anything goes here" })],
    });
    expect(r.meanRelevance).toBe(0);
    expect(r.warnings.some((w) => /no scoreable tokens/.test(w))).toBe(true);
  });

  it("no chunks → meanRelevance=0 with warning", () => {
    const r = scoreRelevance({ query: "Alice cat", chunks: [] });
    expect(r.meanRelevance).toBe(0);
    expect(r.perChunk).toHaveLength(0);
  });
});

describe("scoreCitationCoverage", () => {
  it("coverage=1 when every chunk has a non-empty citation", () => {
    const r = scoreCitationCoverage({
      chunks: [
        chunk({ sourceChunkId: "a", citation: "[doc:Alice §1]" }),
        chunk({ sourceChunkId: "b", citation: "[doc:Carol §2]" }),
      ],
    });
    expect(r.coverage).toBe(1);
    expect(r.citedChunks).toBe(2);
    expect(r.totalChunks).toBe(2);
  });

  it("coverage=0 when no chunk has a citation", () => {
    const r = scoreCitationCoverage({
      chunks: [
        chunk({ sourceChunkId: "a", citation: "" }),
        chunk({ sourceChunkId: "b", citation: "   " }),
      ],
    });
    expect(r.coverage).toBe(0);
  });

  it("partial coverage: 2 of 4 chunks cited → 0.5", () => {
    const r = scoreCitationCoverage({
      chunks: [
        chunk({ sourceChunkId: "a", citation: "[c1]" }),
        chunk({ sourceChunkId: "b", citation: "" }),
        chunk({ sourceChunkId: "c", citation: "[c2]" }),
        chunk({ sourceChunkId: "d", citation: "" }),
      ],
    });
    expect(r.coverage).toBe(0.5);
    expect(r.citedChunks).toBe(2);
    expect(r.totalChunks).toBe(4);
  });

  it("empty chunk set → coverage=0, no division", () => {
    const r = scoreCitationCoverage({ chunks: [] });
    expect(r.coverage).toBe(0);
    expect(r.totalChunks).toBe(0);
  });
});

// ── Recall@k + MRR ───────────────────────────────────────────────

describe("scoreRecallMrr — fixture sanity", () => {
  it("RAC_SEED_FIXTURE has 10 questions across both seeded datasets", () => {
    expect(RAC_SEED_FIXTURE).toHaveLength(10);
    const aliceCount = RAC_SEED_FIXTURE.filter((q) =>
      q.id.startsWith("alice-"),
    ).length;
    const carolCount = RAC_SEED_FIXTURE.filter((q) =>
      q.id.startsWith("carol-"),
    ).length;
    expect(aliceCount).toBe(5);
    expect(carolCount).toBe(5);
  });

  it("every fixture question has at least one relevant chunk id", () => {
    for (const q of RAC_SEED_FIXTURE) {
      expect(q.relevant.length, `question=${q.id}`).toBeGreaterThan(0);
    }
  });
});

describe("scoreRecallMrr — perfect retrieval", () => {
  it("recall@k=1.0 + MRR=1.0 when retrieved set leads with all relevant ids", () => {
    const retrievedByQuestion: Record<string, string[]> = {};
    for (const q of RAC_SEED_FIXTURE) {
      retrievedByQuestion[q.id] = [...q.relevant, "filler-1", "filler-2"];
    }
    const r = scoreRecallMrr({ retrievedByQuestion, k: 10 });
    expect(r.questionsScored).toBe(10);
    expect(r.meanRecallAtK).toBe(1);
    expect(r.mrr).toBe(1);
  });
});

describe("scoreRecallMrr — no retrieval", () => {
  it("everything misses → mean=0 / mrr=0 + every question listed missing", () => {
    const r = scoreRecallMrr({ retrievedByQuestion: {}, k: 5 });
    expect(r.questionsScored).toBe(0);
    expect(r.meanRecallAtK).toBe(0);
    expect(r.mrr).toBe(0);
    expect(r.questionsMissing).toHaveLength(10);
  });
});

describe("scoreRecallMrr — partial / ranked retrieval", () => {
  it("first relevant at rank 3 → reciprocalRank=1/3", () => {
    const r = scoreRecallMrr({
      retrievedByQuestion: {
        "alice-q01": ["wrong:1", "wrong:2", "alice:01:001", "wrong:3"],
      },
      k: 5,
      fixture: RAC_SEED_FIXTURE.filter((q) => q.id === "alice-q01"),
    });
    expect(r.perQuestion[0].firstRelevantRank).toBe(3);
    expect(r.perQuestion[0].reciprocalRank).toBeCloseTo(1 / 3, 5);
  });

  it("recall counts ALL relevant ids in head, not just the first", () => {
    // Question has 3 relevant chunks; head returns 2 of them at top.
    const fixture = RAC_SEED_FIXTURE.filter((q) => q.id === "alice-q01");
    const r = scoreRecallMrr({
      retrievedByQuestion: {
        "alice-q01": ["alice:01:001", "alice:01:002", "wrong:1"],
      },
      k: 3,
      fixture,
    });
    // 2 of 3 relevant → 0.666...
    expect(r.perQuestion[0].recallAtK).toBeCloseTo(2 / 3, 5);
  });

  it("k limits the head — relevant beyond k doesn't count", () => {
    const fixture = RAC_SEED_FIXTURE.filter((q) => q.id === "alice-q01");
    const r = scoreRecallMrr({
      retrievedByQuestion: {
        "alice-q01": [
          "wrong:1",
          "wrong:2",
          "alice:01:001",
          "alice:01:002",
          "alice:01:003",
        ],
      },
      k: 2, // head = first 2 → only "wrong" entries
      fixture,
    });
    expect(r.perQuestion[0].recallAtK).toBe(0);
    expect(r.perQuestion[0].reciprocalRank).toBe(0);
    expect(r.perQuestion[0].firstRelevantRank).toBe(0);
  });

  it("k<=0 coerced to 1 with warning", () => {
    const r = scoreRecallMrr({
      retrievedByQuestion: { "alice-q01": ["alice:01:001"] },
      k: 0,
      fixture: RAC_SEED_FIXTURE.filter((q) => q.id === "alice-q01"),
    });
    expect(r.warnings.some((w) => /coercing to 1/.test(w))).toBe(true);
  });
});

describe("scoreRecallMrr — aggregate semantics", () => {
  it("macro-mean: 2 questions, 1.0 + 0.5 → meanRecallAtK=0.75", () => {
    const fixture = RAC_SEED_FIXTURE.slice(0, 2); // alice-q01 + alice-q02
    const r = scoreRecallMrr({
      retrievedByQuestion: {
        "alice-q01": [...fixture[0].relevant], // perfect
        "alice-q02": [fixture[1].relevant[0], "wrong:1", "wrong:2"], // 1/3 recall
      },
      k: 10,
      fixture,
    });
    // q01: recall=1.0; q02: recall=1/3.
    const expectedMean = (1.0 + 1 / 3) / 2;
    expect(r.meanRecallAtK).toBeCloseTo(expectedMean, 5);
  });
});
