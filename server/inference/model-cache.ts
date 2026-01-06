import { resourceManager } from "./resource-manager";

/**
 * Model Cache System
 * Implements LRU caching with intelligent prefetching
 */

export interface CacheEntry {
  modelId: string;
  modelName: string;
  provider: string;
  sizeGB: number;
  loadedAt: Date;
  lastAccessed: Date;
  accessCount: number;
  hitRate: number; // Percentage of requests that hit cache
  avgLoadTimeMs: number;
}

export interface CacheStatistics {
  totalEntries: number;
  totalSizeGB: number;
  hitRate: number;
  missRate: number;
  evictions: number;
  prefetches: number;
}

export interface PrefetchPattern {
  modelId: string;
  followedBy: Map<string, number>; // modelId -> count
  timeOfDay: Map<number, number>; // hour -> count
  dayOfWeek: Map<number, number>; // day -> count
}

class ModelCache {
  private cache: Map<string, CacheEntry> = new Map();
  private accessLog: Array<{ modelId: string; timestamp: Date }> = [];
  private prefetchPatterns: Map<string, PrefetchPattern> = new Map();
  
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    prefetches: 0,
  };

  constructor() {
    this.startPrefetchAnalysis();
  }

  /**
   * Get a model from cache
   */
  public get(modelId: string): CacheEntry | null {
    const entry = this.cache.get(modelId);

    if (entry) {
      // Cache hit
      entry.lastAccessed = new Date();
      entry.accessCount++;
      this.stats.hits++;
      
      // Update hit rate
      entry.hitRate = (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100;

      // Log access for pattern analysis
      this.logAccess(modelId);

      // Mark model as used in resource manager
      resourceManager.markModelUsed(modelId);

      return entry;
    }

    // Cache miss
    this.stats.misses++;
    this.logAccess(modelId);

    return null;
  }

  /**
   * Put a model in cache
   */
  public put(modelId: string, modelName: string, provider: string, sizeGB: number, loadTimeMs: number): boolean {
    // Check if we need to evict
    const allocation = resourceManager.getAllocation();
    if (allocation.availableMemoryGB < sizeGB) {
      this.evictLRU(sizeGB);
    }

    // Load model in resource manager
    const loaded = resourceManager.loadModel(modelId, modelName, sizeGB);
    if (!loaded) {
      return false;
    }

    // Add to cache
    const entry: CacheEntry = {
      modelId,
      modelName,
      provider,
      sizeGB,
      loadedAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 1,
      hitRate: 0,
      avgLoadTimeMs: loadTimeMs,
    };

    this.cache.set(modelId, entry);
    return true;
  }

  /**
   * Remove a model from cache
   */
  public remove(modelId: string): boolean {
    const entry = this.cache.get(modelId);
    if (!entry) return false;

    this.cache.delete(modelId);
    resourceManager.unloadModel(modelId);
    return true;
  }

  /**
   * Evict least recently used models to free memory
   */
  private evictLRU(requiredGB: number) {
    const entries = Array.from(this.cache.values()).sort(
      (a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime()
    );

    let freedMemory = 0;
    for (const entry of entries) {
      if (freedMemory >= requiredGB) break;

      // Don't evict recently accessed models (within last 5 minutes)
      if (Date.now() - entry.lastAccessed.getTime() < 5 * 60 * 1000) continue;

      // Don't evict frequently used models
      if (entry.accessCount > 100 && entry.hitRate > 80) continue;

      this.remove(entry.modelId);
      freedMemory += entry.sizeGB;
      this.stats.evictions++;

      console.log(`[ModelCache] Evicted ${entry.modelId} (freed ${entry.sizeGB}GB)`);
    }
  }

  /**
   * Log model access for pattern analysis
   */
  private logAccess(modelId: string) {
    this.accessLog.push({ modelId, timestamp: new Date() });

    // Keep only last 1000 accesses
    if (this.accessLog.length > 1000) {
      this.accessLog.shift();
    }
  }

  /**
   * Analyze access patterns for prefetching
   */
  private analyzePatterns() {
    // Clear old patterns
    this.prefetchPatterns.clear();

    // Analyze sequential access patterns
    for (let i = 0; i < this.accessLog.length - 1; i++) {
      const current = this.accessLog[i];
      const next = this.accessLog[i + 1];

      // Only consider if next access is within 10 minutes
      if (next.timestamp.getTime() - current.timestamp.getTime() > 10 * 60 * 1000) continue;

      let pattern = this.prefetchPatterns.get(current.modelId);
      if (!pattern) {
        pattern = {
          modelId: current.modelId,
          followedBy: new Map(),
          timeOfDay: new Map(),
          dayOfWeek: new Map(),
        };
        this.prefetchPatterns.set(current.modelId, pattern);
      }

      // Track what model follows
      const count = pattern.followedBy.get(next.modelId) || 0;
      pattern.followedBy.set(next.modelId, count + 1);

      // Track time of day
      const hour = current.timestamp.getHours();
      const hourCount = pattern.timeOfDay.get(hour) || 0;
      pattern.timeOfDay.set(hour, hourCount + 1);

      // Track day of week
      const day = current.timestamp.getDay();
      const dayCount = pattern.dayOfWeek.get(day) || 0;
      pattern.dayOfWeek.set(day, dayCount + 1);
    }
  }

  /**
   * Prefetch models based on patterns
   */
  public prefetch(currentModelId: string) {
    const pattern = this.prefetchPatterns.get(currentModelId);
    if (!pattern) return;

    // Find most likely next model
    let maxCount = 0;
    let nextModelId: string | null = null;

    for (const [modelId, count] of Array.from(pattern.followedBy.entries())) {
      if (count > maxCount && !this.cache.has(modelId)) {
        maxCount = count;
        nextModelId = modelId;
      }
    }

    // Prefetch if confidence is high (>50% of the time)
    const totalFollows = Array.from(pattern.followedBy.values()).reduce((sum: number, count: number) => sum + count, 0);
    if (nextModelId && maxCount / totalFollows > 0.5) {
      console.log(`[ModelCache] Prefetching ${nextModelId} (confidence: ${Math.round((maxCount / totalFollows) * 100)}%)`);
      
      // TODO: Actually load the model in background
      // This would require model metadata (size, provider, etc.)
      this.stats.prefetches++;
    }
  }

  /**
   * Start periodic pattern analysis
   */
  private startPrefetchAnalysis() {
    setInterval(() => {
      if (this.accessLog.length > 10) {
        this.analyzePatterns();
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Get cache statistics
   */
  public getStatistics(): CacheStatistics {
    const totalEntries = this.cache.size;
    const totalSizeGB = Array.from(this.cache.values()).reduce((sum: number, entry) => sum + entry.sizeGB, 0);
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
    const missRate = total > 0 ? (this.stats.misses / total) * 100 : 0;

    return {
      totalEntries,
      totalSizeGB,
      hitRate,
      missRate,
      evictions: this.stats.evictions,
      prefetches: this.stats.prefetches,
    };
  }

  /**
   * Get all cache entries
   */
  public getEntries(): CacheEntry[] {
    return Array.from(this.cache.values());
  }

  /**
   * Clear entire cache
   */
  public clear() {
    for (const entry of Array.from(this.cache.values())) {
      resourceManager.unloadModel(entry.modelId);
    }
    this.cache.clear();
    console.log("[ModelCache] Cleared all cache entries");
  }

  /**
   * Warm up cache with frequently used models
   */
  public async warmup(modelIds: string[]) {
    console.log(`[ModelCache] Warming up cache with ${modelIds.length} models`);
    
    for (const modelId of modelIds) {
      // TODO: Load model metadata and actually load it
      // For now, just log
      console.log(`[ModelCache] Would warm up: ${modelId}`);
    }
  }

  /**
   * Get prefetch recommendations
   */
  public getPrefetchRecommendations(): Array<{ modelId: string; confidence: number; reason: string }> {
    const recommendations: Array<{ modelId: string; confidence: number; reason: string }> = [];
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    for (const [modelId, pattern] of Array.from(this.prefetchPatterns.entries())) {
      // Skip if already in cache
      if (this.cache.has(modelId)) continue;

      // Check time-of-day pattern
      const hourCount = pattern.timeOfDay.get(currentHour) || 0;
      const totalHourAccesses = Array.from(pattern.timeOfDay.values()).reduce((sum: number, count: number) => sum + count, 0);
      const hourConfidence = totalHourAccesses > 0 ? hourCount / totalHourAccesses : 0;

      // Check day-of-week pattern
      const dayCount = pattern.dayOfWeek.get(currentDay) || 0;
      const totalDayAccesses = Array.from(pattern.dayOfWeek.values()).reduce((sum: number, count: number) => sum + count, 0);
      const dayConfidence = totalDayAccesses > 0 ? dayCount / totalDayAccesses : 0;

      // Combined confidence
      const confidence = (hourConfidence + dayConfidence) / 2;

      if (confidence > 0.3) {
        recommendations.push({
          modelId,
          confidence: Math.round(confidence * 100),
          reason: `Frequently used at this time (${Math.round(confidence * 100)}% confidence)`,
        });
      }
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }
}

// Singleton instance
export const modelCache = new ModelCache();
