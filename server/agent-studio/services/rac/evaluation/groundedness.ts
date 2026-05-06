/**
 * RAC Evaluation — Groundedness scorer (Phase 8).
 *
 * Scores a model output against the retrieval evidence it was given.
 * MVP: token-overlap heuristic (no LLM call). The trace schema's
 * `groundedness_score` column is `real`; this function emits a value
 * in [0, 1].
 *
 * Locked design notes:
 *   - **No LLM dependency.** Groundedness scoring runs synchronously
 *     against the trace; pulling in a model call would couple
 *     evaluation latency to provider throughput. A real LLM-based
 *     groundedness check lands in a follow-up phase.
 *   - **Citation-aware.** A claim that appears in a chunk's content
 *     is counted as grounded; one that appears anywhere else (the
 *     model's general knowledge) doesn't pollute the score.
 *   - **Token-level.** Whole-sentence matching is too brittle for
 *     paraphrase, exact-string matching is too lenient. We tokenise
 *     output + chunks, drop stopwords, and compute the fraction of
 *     output tokens that also appear in the evidence.
 *
 * The scorer is pure and deterministic — same inputs always produce
 * the same score. Caller persists via `updateTraceScores`.
 */

import type { RacRetrievalChunk } from "../ingestion";

/**
 * English stopwords kept tiny on purpose — bigger lists overfit and
 * make scoring jittery. The intent is to drop noise, not to do real
 * NLP.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "he",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "she",
  "that",
  "the",
  "they",
  "this",
  "to",
  "was",
  "were",
  "will",
  "with",
  "you",
  "your",
  "we",
  "our",
  "their",
  "his",
  "her",
  "i",
  "me",
  "my",
  "but",
  "if",
  "so",
  "do",
  "does",
  "did",
  "have",
  "had",
  "been",
  "being",
  "than",
  "then",
  "there",
  "here",
  "what",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "why",
  "how",
]);

const TOKEN_RE = /[A-Za-z][A-Za-z0-9'-]*/g;

function tokenise(text: string): string[] {
  const tokens: string[] = [];
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const t = m[0].toLowerCase();
    if (t.length < 3) continue;
    if (STOPWORDS.has(t)) continue;
    tokens.push(t);
  }
  return tokens;
}

export interface GroundednessInput {
  /** Final model output (assistant message). */
  output: string;
  /** Retrieval-evidence chunks the model was shown. */
  chunks: RacRetrievalChunk[];
}

export interface GroundednessResult {
  /** [0, 1]. 1.0 = every output token appears in the evidence. */
  score: number;
  /** Total output tokens (post-stopword removal). */
  outputTokens: number;
  /** Tokens that also appear somewhere in the chunks. */
  matchedTokens: number;
  /** Output tokens with no match — surfaced for the inspector UI. */
  ungroundedSample: string[];
  warnings: string[];
}

/**
 * Compute groundedness. Returns score=1 (vacuously grounded) when
 * the output is empty; score=0 when chunks are empty (nothing to
 * ground against) — both with a warning so the trace reflects the
 * edge case.
 */
export function scoreGroundedness(input: GroundednessInput): GroundednessResult {
  const warnings: string[] = [];
  const outputTokens = tokenise(input.output);

  if (outputTokens.length === 0) {
    warnings.push("groundedness: output is empty after tokenisation; score=1 (vacuous)");
    return {
      score: 1,
      outputTokens: 0,
      matchedTokens: 0,
      ungroundedSample: [],
      warnings,
    };
  }
  if (input.chunks.length === 0) {
    warnings.push("groundedness: no evidence chunks; score=0");
    return {
      score: 0,
      outputTokens: outputTokens.length,
      matchedTokens: 0,
      ungroundedSample: outputTokens.slice(0, 12),
      warnings,
    };
  }

  // Build evidence vocabulary across all chunks (set, not multiset —
  // we just want to know which tokens are *available* in evidence).
  const evidenceVocab = new Set<string>();
  for (const c of input.chunks) {
    for (const t of tokenise(c.content)) evidenceVocab.add(t);
  }

  let matched = 0;
  const unmatched: string[] = [];
  for (const t of outputTokens) {
    if (evidenceVocab.has(t)) matched += 1;
    else if (unmatched.length < 12) unmatched.push(t);
  }

  const score = outputTokens.length > 0 ? matched / outputTokens.length : 1;

  return {
    score,
    outputTokens: outputTokens.length,
    matchedTokens: matched,
    ungroundedSample: unmatched,
    warnings,
  };
}
