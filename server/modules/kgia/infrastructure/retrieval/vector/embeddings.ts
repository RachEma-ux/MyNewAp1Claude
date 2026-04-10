/**
 * GraphRAG Retrieval — Embeddings
 *
 * Generates text embeddings for chunk content and queries.
 * V1: Simple TF-IDF-like feature vectors.
 * Future: Delegate to platform embedding engine via LlmPort.embed().
 */

/**
 * Generate a simple bag-of-words embedding for text.
 * Returns a normalized vector.
 */
export function generateSimpleEmbedding(text: string, vocabSize: number = 256): number[] {
  const vector = new Array(vocabSize).fill(0);
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  for (const word of words) {
    const hash = simpleHash(word) % vocabSize;
    vector[hash] += 1;
  }

  // Normalize
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) vector[i] /= magnitude;
  }

  return vector;
}

/**
 * Compute cosine similarity between two embeddings.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Find top-k most similar chunks by embedding similarity.
 */
export function findSimilarChunks(
  queryEmbedding: number[],
  chunkEmbeddings: Array<{ id: string; embedding: number[] }>,
  topK: number = 5
): Array<{ id: string; score: number }> {
  return chunkEmbeddings
    .map((c) => ({ id: c.id, score: cosineSimilarity(queryEmbedding, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
