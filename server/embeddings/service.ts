import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';

/**
 * Vector embedding service for document chunks
 */
export class EmbeddingService {
  private qdrant: QdrantClient | null = null;
  private openai: OpenAI | null = null;
  private collectionName: string;
  private embeddingModel: string;

  constructor(
    collectionName: string = 'documents',
    embeddingModel: string = 'text-embedding-3-small'
  ) {
    this.collectionName = collectionName;
    this.embeddingModel = embeddingModel;
  }

  /**
   * Initialize Qdrant client (in-memory mode for local development)
   */
  private async initQdrant() {
    if (this.qdrant) return this.qdrant;

    // Use in-memory Qdrant for simplicity (no external service needed)
    this.qdrant = new QdrantClient({ url: ':memory:' });
    
    // Create collection if it doesn't exist
    try {
      await this.qdrant.getCollection(this.collectionName);
      console.log(`[Embeddings] Using existing collection: ${this.collectionName}`);
    } catch (error) {
      // Collection doesn't exist, create it
      await this.qdrant.createCollection(this.collectionName, {
        vectors: {
          size: 1536, // text-embedding-3-small dimension
          distance: 'Cosine',
        },
      });
      console.log(`[Embeddings] Created collection: ${this.collectionName}`);
    }

    return this.qdrant;
  }

  /**
   * Initialize OpenAI client
   */
  private initOpenAI() {
    if (this.openai) return this.openai;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    this.openai = new OpenAI({ apiKey });
    return this.openai;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const openai = this.initOpenAI();

    try {
      const response = await openai.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('[Embeddings] Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const openai = this.initOpenAI();

    try {
      const response = await openai.embeddings.create({
        model: this.embeddingModel,
        input: texts,
      });

      return response.data.map(item => item.embedding);
    } catch (error) {
      console.error('[Embeddings] Error generating embeddings:', error);
      throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store document chunk embeddings in vector database
   */
  async storeChunkEmbeddings(chunks: Array<{
    id: number;
    content: string;
    documentId: number;
    chunkIndex: number;
  }>): Promise<void> {
    if (chunks.length === 0) return;

    const qdrant = await this.initQdrant();

    // Generate embeddings in batches
    const batchSize = 100;
    const allPoints = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map(chunk => chunk.content);
      
      console.log(`[Embeddings] Generating embeddings for batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`);
      const embeddings = await this.generateEmbeddings(texts);

      const points = batch.map((chunk, idx) => ({
        id: chunk.id,
        vector: embeddings[idx],
        payload: {
          documentId: chunk.documentId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
        },
      }));

      allPoints.push(...points);
    }

    // Upsert all points to Qdrant
    await qdrant.upsert(this.collectionName, {
      wait: true,
      points: allPoints,
    });

    console.log(`[Embeddings] Stored ${allPoints.length} chunk embeddings`);
  }

  /**
   * Search for similar chunks using vector similarity
   */
  async searchSimilarChunks(
    query: string,
    limit: number = 5,
    documentIds?: number[]
  ): Promise<Array<{
    id: number;
    score: number;
    documentId: number;
    chunkIndex: number;
    content: string;
  }>> {
    const qdrant = await this.initQdrant();

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Build filter if documentIds provided
    const filter = documentIds ? {
      must: [{
        key: 'documentId',
        match: {
          any: documentIds,
        },
      }],
    } : undefined;

    // Search in Qdrant
    const results = await qdrant.search(this.collectionName, {
      vector: queryEmbedding,
      limit,
      filter,
      with_payload: true,
    });

    return results.map(result => ({
      id: result.id as number,
      score: result.score,
      documentId: (result.payload as any).documentId,
      chunkIndex: (result.payload as any).chunkIndex,
      content: (result.payload as any).content,
    }));
  }

  /**
   * Delete embeddings for a document
   */
  async deleteDocumentEmbeddings(documentId: number): Promise<void> {
    const qdrant = await this.initQdrant();

    await qdrant.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [{
          key: 'documentId',
          match: { value: documentId },
        }],
      },
    });

    console.log(`[Embeddings] Deleted embeddings for document ${documentId}`);
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<{
    vectorCount: number;
    collectionName: string;
  }> {
    const qdrant = await this.initQdrant();
    const info = await qdrant.getCollection(this.collectionName);

    return {
      vectorCount: info.points_count || 0,
      collectionName: this.collectionName,
    };
  }
}

// Singleton instance
let embeddingService: EmbeddingService | null = null;

/**
 * Get or create embedding service instance
 */
export function getEmbeddingService(
  collectionName?: string,
  embeddingModel?: string
): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService(collectionName, embeddingModel);
  }
  return embeddingService;
}
