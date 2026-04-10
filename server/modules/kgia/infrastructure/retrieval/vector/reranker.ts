/**
 * GraphRAG Retrieval — Reranker
 *
 * Reranks retrieval results by combining vector similarity with
 * entity overlap and graph proximity signals.
 */

export interface RerankCandidate {
  id: string;
  content: string;
  vectorScore: number;
  entities: string[];
}

export interface RerankResult {
  id: string;
  finalScore: number;
  vectorScore: number;
  entityOverlapScore: number;
  lengthScore: number;
}

/**
 * Rerank candidates using multiple signals.
 */
export function rerankResults(
  candidates: RerankCandidate[],
  queryEntities: string[],
  weights: { vector: number; entityOverlap: number; length: number } = { vector: 0.5, entityOverlap: 0.35, length: 0.15 }
): RerankResult[] {
  const queryEntitySet = new Set(queryEntities.map((e) => e.toLowerCase()));

  return candidates
    .map((c) => {
      const entityOverlapScore = computeEntityOverlap(c.entities, queryEntitySet);
      const lengthScore = computeLengthScore(c.content);

      const finalScore =
        c.vectorScore * weights.vector +
        entityOverlapScore * weights.entityOverlap +
        lengthScore * weights.length;

      return {
        id: c.id,
        finalScore,
        vectorScore: c.vectorScore,
        entityOverlapScore,
        lengthScore,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

function computeEntityOverlap(chunkEntities: string[], queryEntities: Set<string>): number {
  if (queryEntities.size === 0 || chunkEntities.length === 0) return 0;
  const overlap = chunkEntities.filter((e) => queryEntities.has(e.toLowerCase())).length;
  return overlap / Math.max(queryEntities.size, 1);
}

function computeLengthScore(content: string): number {
  // Prefer medium-length chunks (200-800 chars)
  const len = content.length;
  if (len < 50) return 0.2;
  if (len < 200) return 0.6;
  if (len < 800) return 1.0;
  if (len < 1500) return 0.8;
  return 0.5;
}
