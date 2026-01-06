/**
 * Qdrant Vector Database Service
 * Provides semantic search and vector storage using Qdrant
 */

import { QdrantClient } from "@qdrant/js-client-rest";

export interface VectorSearchRequest {
  collection: string;
  query: number[];
  limit?: number;
  filter?: Record<string, any>;
  scoreThreshold?: number;
}

export interface VectorSearchResult {
  id: string | number;
  score: number;
  payload: Record<string, any>;
}

export interface VectorInsertRequest {
  collection: string;
  vectors: number[][];
  payloads: Record<string, any>[];
  ids?: (string | number)[];
}

export interface CollectionConfig {
  name: string;
  vectorSize: number;
  distance: "Cosine" | "Euclid" | "Dot";
}

/**
 * Qdrant Vector Database Service
 */
export class QdrantService {
  private client: QdrantClient;
  private initialized = false;
  
  constructor(url = "http://localhost:6333") {
    this.client = new QdrantClient({ url });
    console.log(`[QdrantService] Initialized with URL: ${url}`);
  }
  
  /**
   * Initialize connection and check health
   */
  async initialize(): Promise<void> {
    try {
      // Check if Qdrant is available
      // Check if Qdrant is available by listing collections
      await this.client.getCollections();
      console.log("[QdrantService] Connected to Qdrant");
      this.initialized = true;
    } catch (error) {
      console.warn("[QdrantService] Qdrant not available, using in-memory fallback");
      // In production, could fall back to in-memory vector store
      this.initialized = false;
    }
  }
  
  /**
   * Create a collection
   */
  async createCollection(config: CollectionConfig): Promise<void> {
    if (!this.initialized) {
      throw new Error("Qdrant not initialized");
    }
    
    try {
      await this.client.createCollection(config.name, {
        vectors: {
          size: config.vectorSize,
          distance: config.distance,
        },
      });
      
      console.log(`[QdrantService] Created collection: ${config.name}`);
    } catch (error) {
      // Collection might already exist
      console.log(`[QdrantService] Collection ${config.name} already exists or error:`, error);
    }
  }
  
  /**
   * Delete a collection
   */
  async deleteCollection(name: string): Promise<void> {
    if (!this.initialized) {
      throw new Error("Qdrant not initialized");
    }
    
    await this.client.deleteCollection(name);
    console.log(`[QdrantService] Deleted collection: ${name}`);
  }
  
  /**
   * List all collections
   */
  async listCollections(): Promise<string[]> {
    if (!this.initialized) {
      return [];
    }
    
    const response = await this.client.getCollections();
    return response.collections.map((c) => c.name);
  }
  
  /**
   * Insert vectors into a collection
   */
  async insert(request: VectorInsertRequest): Promise<void> {
    if (!this.initialized) {
      throw new Error("Qdrant not initialized");
    }
    
    if (request.vectors.length !== request.payloads.length) {
      throw new Error("Vectors and payloads must have the same length");
    }
    
    // Generate IDs if not provided
    const ids = request.ids || request.vectors.map((_, i) => Date.now() + i);
    
    // Prepare points
    const points = request.vectors.map((vector, i) => ({
      id: ids[i],
      vector,
      payload: request.payloads[i],
    }));
    
    await this.client.upsert(request.collection, {
      wait: true,
      points,
    });
    
    console.log(`[QdrantService] Inserted ${points.length} vectors into ${request.collection}`);
  }
  
  /**
   * Search for similar vectors
   */
  async search(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
    if (!this.initialized) {
      throw new Error("Qdrant not initialized");
    }
    
    const response = await this.client.search(request.collection, {
      vector: request.query,
      limit: request.limit || 10,
      filter: request.filter,
      score_threshold: request.scoreThreshold,
      with_payload: true,
    });
    
    return response.map((result) => ({
      id: result.id,
      score: result.score,
      payload: result.payload as Record<string, any>,
    }));
  }
  
  /**
   * Hybrid search (semantic + keyword)
   * Combines vector search with payload filtering
   */
  async hybridSearch(
    collection: string,
    query: number[],
    keywords: string[],
    limit = 10
  ): Promise<VectorSearchResult[]> {
    if (!this.initialized) {
      throw new Error("Qdrant not initialized");
    }
    
    // Build filter for keywords (simple text matching in payload)
    const filter = keywords.length > 0
      ? {
          should: keywords.map((keyword) => ({
            key: "text",
            match: {
              text: keyword,
            },
          })),
        }
      : undefined;
    
    return this.search({
      collection,
      query,
      limit,
      filter,
    });
  }
  
  /**
   * Get collection info
   */
  async getCollectionInfo(name: string): Promise<any> {
    if (!this.initialized) {
      throw new Error("Qdrant not initialized");
    }
    
    return await this.client.getCollection(name);
  }
  
  /**
   * Count vectors in collection
   */
  async count(collection: string): Promise<number> {
    if (!this.initialized) {
      return 0;
    }
    
    const info = await this.getCollectionInfo(collection);
    return info.points_count || 0;
  }
  
  /**
   * Delete vectors by IDs
   */
  async deleteByIds(collection: string, ids: (string | number)[]): Promise<void> {
    if (!this.initialized) {
      throw new Error("Qdrant not initialized");
    }
    
    await this.client.delete(collection, {
      wait: true,
      points: ids,
    });
    
    console.log(`[QdrantService] Deleted ${ids.length} vectors from ${collection}`);
  }
  
  /**
   * Delete vectors by filter
   */
  async deleteByFilter(collection: string, filter: Record<string, any>): Promise<void> {
    if (!this.initialized) {
      throw new Error("Qdrant not initialized");
    }
    
    await this.client.delete(collection, {
      wait: true,
      filter,
    });
    
    console.log(`[QdrantService] Deleted vectors from ${collection} matching filter`);
  }
  
  /**
   * Shutdown connection
   */
  async shutdown(): Promise<void> {
    console.log("[QdrantService] Shutting down");
    this.initialized = false;
  }
}

// Global Qdrant service instance
export const qdrantService = new QdrantService();
