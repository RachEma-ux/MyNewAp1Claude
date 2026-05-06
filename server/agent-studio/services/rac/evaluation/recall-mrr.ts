/**
 * RAC Evaluation — Recall@k + MRR (Phase 8).
 *
 * Off-the-shelf information-retrieval metrics, applied to a labeled
 * fixture. Plan §P8 ships P8 with a minimal fixture (5–10 questions)
 * for the `christmas-carol` and `alice-wonderland` sample datasets
 * the boot log shows are seeded. Real evaluation lands when real
 * corpora are registered and operators stand up their own fixtures.
 *
 * Formulas:
 *
 *   Recall@k(q) = |relevant ∩ retrieved[:k]| / |relevant|
 *   MRR(q)      = 1 / rank-of-first-relevant-in-retrieved (or 0 if none)
 *
 * Aggregates: macro-mean over questions.
 *
 * Pure functions. No DB, no network.
 */

export interface LabeledQuestion {
  /** Stable id, e.g. "carol-q01". */
  id: string;
  /** Free-text question used as the retrieval query. */
  query: string;
  /** Source-chunk ids that should appear in the retrieved set. */
  relevant: string[];
  /** Optional human-readable note for the inspector. */
  notes?: string;
}

export type LabeledFixture = ReadonlyArray<LabeledQuestion>;

/**
 * MVP fixture pinned to the seeded sample datasets. Each question
 * names chunk ids in the form `<dataset>:<chapter>:<idx>` so the
 * fixture stays portable: an evaluator passes a retrieval function
 * that maps a query → a list of chunk ids, and we score against
 * `relevant`.
 *
 * 5 questions per dataset (10 total), per plan §P8 ("5–10 questions").
 */
export const RAC_SEED_FIXTURE: LabeledFixture = Object.freeze([
  // ── alice-wonderland ────────────────────────────────────────────
  {
    id: "alice-q01",
    query: "What did Alice see when she fell down the rabbit-hole?",
    relevant: ["alice:01:001", "alice:01:002", "alice:01:003"],
    notes: "Falling sequence — opening of the book.",
  },
  {
    id: "alice-q02",
    query: "Who is the Cheshire Cat and where does Alice meet it?",
    relevant: ["alice:06:004", "alice:06:005", "alice:06:006"],
  },
  {
    id: "alice-q03",
    query: "What happens at the Mad Tea-Party?",
    relevant: ["alice:07:001", "alice:07:002", "alice:07:003", "alice:07:004"],
  },
  {
    id: "alice-q04",
    query: "How does Alice grow and shrink in size?",
    relevant: ["alice:01:005", "alice:02:001", "alice:04:003"],
    notes: "Multiple chapters — drink-me bottle, eat-me cake, mushroom.",
  },
  {
    id: "alice-q05",
    query: "Who wins the Caucus race?",
    relevant: ["alice:03:002", "alice:03:003"],
  },
  // ── christmas-carol ─────────────────────────────────────────────
  {
    id: "carol-q01",
    query: "Who is Jacob Marley and what does he warn Scrooge about?",
    relevant: ["carol:01:008", "carol:01:009", "carol:01:010"],
  },
  {
    id: "carol-q02",
    query: "What does the Ghost of Christmas Past show Scrooge?",
    relevant: ["carol:02:001", "carol:02:002", "carol:02:005"],
  },
  {
    id: "carol-q03",
    query: "Who is Tiny Tim?",
    relevant: ["carol:03:004", "carol:03:005"],
  },
  {
    id: "carol-q04",
    query: "What does the Ghost of Christmas Yet to Come reveal?",
    relevant: ["carol:04:002", "carol:04:003", "carol:04:006"],
  },
  {
    id: "carol-q05",
    query: "How does Scrooge change on Christmas morning?",
    relevant: ["carol:05:001", "carol:05:002", "carol:05:003"],
  },
]);

// ── Per-question metrics ────────────────────────────────────────────

export interface RecallMrrPerQuestion {
  questionId: string;
  recallAtK: number;
  reciprocalRank: number;
  /** Convenience: the rank (1-indexed) of the first relevant chunk; 0 if none in top-k. */
  firstRelevantRank: number;
}

export interface RecallMrrInput {
  retrievedByQuestion: Record<string, string[]>;
  k: number;
  fixture?: LabeledFixture;
}

export interface RecallMrrResult {
  perQuestion: RecallMrrPerQuestion[];
  /** Macro-mean of perQuestion.recallAtK over questions WITH retrieval results. */
  meanRecallAtK: number;
  /** Macro-mean of perQuestion.reciprocalRank. */
  mrr: number;
  /** Number of fixture questions covered by the retrieval map. */
  questionsScored: number;
  /** Fixture questions that had NO retrieval result supplied. */
  questionsMissing: string[];
  warnings: string[];
}

/**
 * Score a recall@k + MRR run. Caller supplies a map of
 * `{ questionId -> retrievedChunkIds[] }` produced by their own
 * retrieval pipeline. Missing questions are listed in `questionsMissing`
 * (caller decides whether to treat that as failure).
 */
export function scoreRecallMrr(input: RecallMrrInput): RecallMrrResult {
  const fixture = input.fixture ?? RAC_SEED_FIXTURE;
  const warnings: string[] = [];
  if (input.k <= 0) {
    warnings.push(`recall: k=${input.k} is non-positive; coercing to 1`);
  }
  const k = Math.max(1, input.k);

  const perQuestion: RecallMrrPerQuestion[] = [];
  const missing: string[] = [];

  for (const q of fixture) {
    const retrieved = input.retrievedByQuestion[q.id];
    if (!retrieved) {
      missing.push(q.id);
      continue;
    }
    const head = retrieved.slice(0, k);
    const relevantSet = new Set(q.relevant);
    let hits = 0;
    let firstRelevantRank = 0;
    head.forEach((id, idx) => {
      if (relevantSet.has(id)) {
        hits += 1;
        if (firstRelevantRank === 0) firstRelevantRank = idx + 1;
      }
    });
    const recallAtK =
      relevantSet.size === 0 ? 0 : hits / relevantSet.size;
    const reciprocalRank =
      firstRelevantRank === 0 ? 0 : 1 / firstRelevantRank;
    perQuestion.push({
      questionId: q.id,
      recallAtK,
      reciprocalRank,
      firstRelevantRank,
    });
  }

  const scored = perQuestion.length;
  const meanRecallAtK =
    scored === 0
      ? 0
      : perQuestion.reduce((s, p) => s + p.recallAtK, 0) / scored;
  const mrr =
    scored === 0
      ? 0
      : perQuestion.reduce((s, p) => s + p.reciprocalRank, 0) / scored;

  return {
    perQuestion,
    meanRecallAtK,
    mrr,
    questionsScored: scored,
    questionsMissing: missing,
    warnings,
  };
}
