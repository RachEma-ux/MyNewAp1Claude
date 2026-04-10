/**
 * Port: Vector Store — abstract interface for vector similarity search.
 * Used by GraphRAG retrieval to find relevant chunks.
 */
export interface VectorSearchResult {
  id: string;
  score: number;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface VectorStorePort {
  /** Search for similar vectors */
  search(embedding: number[], topK: number, filter?: Record<string, unknown>): Promise<VectorSearchResult[]>;

  /** Upsert vectors with metadata */
  upsert(vectors: Array<{ id: string; embedding: number[]; content: string; metadata?: Record<string, unknown> }>): Promise<void>;

  /** Delete vectors by IDs */
  delete(ids: string[]): Promise<void>;
}
