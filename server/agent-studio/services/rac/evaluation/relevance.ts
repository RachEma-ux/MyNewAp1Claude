/**
 * RAC Evaluation — Relevance + citation coverage (Phase 8).
 *
 * Two pure scorers operating on the chunk set the orchestrator
 * already produced (post-filter, post-assemble — these are the
 * chunks the model actually saw):
 *
 *   - `scoreRelevance(query, chunks)` — per-chunk relevance score in
 *     [0, 1] from token-overlap with the query, plus an aggregate
 *     mean for the trace's `relevance` headline number.
 *   - `scoreCitationCoverage(chunks)` — fraction of chunks carrying
 *     non-empty citation metadata. Trace persists this in the
 *     existing `citation_coverage` column.
 *
 * Both scorers are deterministic and side-effect-free.
 */

import type { RacRetrievalChunk } from "../ingestion";

const TOKEN_RE = /[A-Za-z][A-Za-z0-9'-]*/g;

function tokenSet(text: string): Set<string> {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const t = m[0].toLowerCase();
    if (t.length < 3) continue;
    out.add(t);
  }
  return out;
}

// ── Relevance ────────────────────────────────────────────────────

export interface RelevanceInput {
  query: string;
  chunks: RacRetrievalChunk[];
}

export interface PerChunkRelevance {
  sourceChunkId: string;
  /** Jaccard similarity of query tokens vs chunk tokens, in [0, 1]. */
  score: number;
  /** Fields surfaced for the inspector. */
  matchedQueryTokens: number;
  totalQueryTokens: number;
}

export interface RelevanceResult {
  perChunk: PerChunkRelevance[];
  /** Mean of perChunk scores; 0 when the chunk set is empty. */
  meanRelevance: number;
  warnings: string[];
}

export function scoreRelevance(input: RelevanceInput): RelevanceResult {
  const warnings: string[] = [];
  const queryTokens = tokenSet(input.query);

  if (queryTokens.size === 0) {
    warnings.push("relevance: query has no scoreable tokens (length<3 or all stopwords); meanRelevance=0");
    return {
      perChunk: input.chunks.map((c) => ({
        sourceChunkId: c.sourceChunkId,
        score: 0,
        matchedQueryTokens: 0,
        totalQueryTokens: 0,
      })),
      meanRelevance: 0,
      warnings,
    };
  }
  if (input.chunks.length === 0) {
    warnings.push("relevance: no chunks; meanRelevance=0");
    return { perChunk: [], meanRelevance: 0, warnings };
  }

  const perChunk: PerChunkRelevance[] = input.chunks.map((c) => {
    const chunkTokens = tokenSet(c.content);
    let matched = 0;
    for (const t of queryTokens) if (chunkTokens.has(t)) matched += 1;
    // Jaccard: |Q ∩ C| / |Q ∪ C|. Using |Q| as the denominator gives
    // the friendlier "fraction of query satisfied by chunk" number,
    // which is what callers usually want — a chunk that adds extra
    // background shouldn't be penalised.
    const score = matched / queryTokens.size;
    return {
      sourceChunkId: c.sourceChunkId,
      score,
      matchedQueryTokens: matched,
      totalQueryTokens: queryTokens.size,
    };
  });

  const mean =
    perChunk.reduce((sum, c) => sum + c.score, 0) / perChunk.length;

  return { perChunk, meanRelevance: mean, warnings };
}

// ── Citation coverage ──────────────────────────────────────────────

export interface CitationCoverageInput {
  chunks: RacRetrievalChunk[];
}

export interface CitationCoverageResult {
  /** Fraction of chunks with a non-empty citation, in [0, 1]. */
  coverage: number;
  totalChunks: number;
  citedChunks: number;
}

export function scoreCitationCoverage(
  input: CitationCoverageInput,
): CitationCoverageResult {
  const total = input.chunks.length;
  if (total === 0) return { coverage: 0, totalChunks: 0, citedChunks: 0 };
  let cited = 0;
  for (const c of input.chunks) {
    if (c.citation && c.citation.trim().length > 0) cited += 1;
  }
  return { coverage: cited / total, totalChunks: total, citedChunks: cited };
}
