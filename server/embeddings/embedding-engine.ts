/**
 * Embedding Engine
 * Generates text embeddings using various models (BGE, MiniLM, E5)
 */

export type EmbeddingModel = "bge-large-en" | "bge-base-en" | "minilm-l6" | "e5-large" | "e5-base";

export interface EmbeddingConfig {
  model: EmbeddingModel;
  dimensions: number;
  maxBatchSize: number;
  device: "cpu" | "cuda";
}

export interface EmbeddingRequest {
  texts: string[];
  model?: EmbeddingModel;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: EmbeddingModel;
  dimensions: number;
  usage: {
    totalTokens: number;
  };
}

/**
 * LRU Cache for embeddings
 */
class EmbeddingCache {
  private cache: Map<string, { embedding: number[]; timestamp: number }> = new Map();
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds
  
  constructor(maxSize = 10000, ttlMinutes = 60) {
    this.maxSize = maxSize;
    this.ttl = ttlMinutes * 60 * 1000;
  }
  
  get(key: string): number[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.embedding;
  }
  
  set(key: string, embedding: number[]): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      embedding,
      timestamp: Date.now(),
    });
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  size(): number {
    return this.cache.size;
  }
}

/**
 * Embedding Engine
 */
export class EmbeddingEngine {
  private models: Map<EmbeddingModel, EmbeddingConfig> = new Map();
  private cache: EmbeddingCache;
  private defaultModel: EmbeddingModel = "bge-base-en";
  
  constructor() {
    this.cache = new EmbeddingCache();
    this.initializeModels();
  }
  
  /**
   * Initialize available models
   */
  private initializeModels(): void {
    // BGE models (BAAI General Embedding)
    this.models.set("bge-large-en", {
      model: "bge-large-en",
      dimensions: 1024,
      maxBatchSize: 32,
      device: "cpu",
    });
    
    this.models.set("bge-base-en", {
      model: "bge-base-en",
      dimensions: 768,
      maxBatchSize: 64,
      device: "cpu",
    });
    
    // MiniLM models (Microsoft)
    this.models.set("minilm-l6", {
      model: "minilm-l6",
      dimensions: 384,
      maxBatchSize: 128,
      device: "cpu",
    });
    
    // E5 models (Microsoft)
    this.models.set("e5-large", {
      model: "e5-large",
      dimensions: 1024,
      maxBatchSize: 32,
      device: "cpu",
    });
    
    this.models.set("e5-base", {
      model: "e5-base",
      dimensions: 768,
      maxBatchSize: 64,
      device: "cpu",
    });
    
    console.log(`[EmbeddingEngine] Initialized with ${this.models.size} models`);
  }
  
  /**
   * Generate embeddings for texts
   */
  async generate(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model || this.defaultModel;
    const config = this.models.get(model);
    
    if (!config) {
      throw new Error(`Model not found: ${model}`);
    }
    
    const embeddings: number[][] = [];
    let totalTokens = 0;
    
    // Process in batches
    for (let i = 0; i < request.texts.length; i += config.maxBatchSize) {
      const batch = request.texts.slice(i, i + config.maxBatchSize);
      const batchEmbeddings = await this.generateBatch(batch, config);
      embeddings.push(...batchEmbeddings);
      
      // Estimate tokens (rough approximation)
      totalTokens += batch.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);
    }
    
    return {
      embeddings,
      model,
      dimensions: config.dimensions,
      usage: {
        totalTokens,
      },
    };
  }
  
  /**
   * Generate embeddings for a batch of texts
   */
  private async generateBatch(texts: string[], config: EmbeddingConfig): Promise<number[][]> {
    const embeddings: number[][] = [];
    
    for (const text of texts) {
      // Check cache first
      const cacheKey = `${config.model}:${text}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached) {
        embeddings.push(cached);
        continue;
      }
      
      // Generate embedding
      const embedding = await this.generateSingle(text, config);
      
      // Cache result
      this.cache.set(cacheKey, embedding);
      
      embeddings.push(embedding);
    }
    
    return embeddings;
  }
  
  /**
   * Generate embedding for a single text
   * 
   * Note: This is a simplified implementation.
   * In production, this would use actual embedding models via:
   * - @xenova/transformers (ONNX runtime)
   * - Python subprocess with sentence-transformers
   * - API calls to embedding services
   */
  private async generateSingle(text: string, config: EmbeddingConfig): Promise<number[]> {
    // Simulate embedding generation
    // In production, load and run actual model
    
    // Generate deterministic "embedding" based on text
    // (This is NOT a real embedding, just for demonstration)
    const embedding = new Array(config.dimensions).fill(0).map((_, i) => {
      const hash = this.simpleHash(text + i);
      return (hash % 2000 - 1000) / 1000; // Normalize to [-1, 1]
    });
    
    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map((val) => val / magnitude);
  }
  
  /**
   * Simple hash function for demonstration
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
  
  /**
   * Get available models
   */
  getAvailableModels(): EmbeddingConfig[] {
    return Array.from(this.models.values());
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size(),
      maxSize: 10000,
    };
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log("[EmbeddingEngine] Cache cleared");
  }
}

// Global embedding engine instance
export const embeddingEngine = new EmbeddingEngine();
