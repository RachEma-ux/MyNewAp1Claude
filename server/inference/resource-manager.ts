import { HardwareProfile, detectHardware } from "../hardware/detection-service";
import os from "os";

/**
 * Resource Manager
 * Manages memory allocation, model loading/unloading, and resource quotas
 */

export interface ModelResource {
  modelId: string;
  modelName: string;
  sizeGB: number;
  loadedAt: Date;
  lastUsed: Date;
  useCount: number;
  memoryType: "vram" | "ram";
  priority: number; // Higher = more important
}

export interface ResourceQuota {
  workspaceId: number;
  maxConcurrentRequests: number;
  maxMemoryGB: number;
  maxModelsLoaded: number;
  priority: number;
}

export interface ResourceAllocation {
  totalMemoryGB: number;
  usedMemoryGB: number;
  availableMemoryGB: number;
  loadedModels: ModelResource[];
  activeRequests: number;
  maxConcurrentRequests: number;
}

class ResourceManager {
  private hardwareProfile: HardwareProfile | null = null;
  private loadedModels: Map<string, ModelResource> = new Map();
  private workspaceQuotas: Map<number, ResourceQuota> = new Map();
  private activeRequests: Map<string, { workspaceId: number; startTime: Date }> = new Map();
  private requestQueue: Array<{ requestId: string; workspaceId: number; priority: number; callback: () => void }> = [];

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      this.hardwareProfile = await detectHardware();
      console.log("[ResourceManager] Initialized with hardware profile:", {
        hasGPU: this.hardwareProfile.hasGPU,
        gpuType: this.hardwareProfile.gpuType,
        gpuVRAM: this.hardwareProfile.gpuVRAM,
        totalRAM: this.hardwareProfile.totalRAM,
      });
    } catch (error) {
      console.error("[ResourceManager] Failed to detect hardware:", error);
    }
  }

  /**
   * Get current resource allocation status
   */
  public getAllocation(): ResourceAllocation {
    const totalMemoryGB = this.getTotalMemory();
    const usedMemoryGB = Array.from(this.loadedModels.values()).reduce((sum, model) => sum + model.sizeGB, 0);

    return {
      totalMemoryGB,
      usedMemoryGB,
      availableMemoryGB: totalMemoryGB - usedMemoryGB,
      loadedModels: Array.from(this.loadedModels.values()),
      activeRequests: this.activeRequests.size,
      maxConcurrentRequests: this.getMaxConcurrentRequests(),
    };
  }

  /**
   * Get total available memory (VRAM if GPU, else RAM)
   */
  private getTotalMemory(): number {
    if (!this.hardwareProfile) {
      return os.totalmem() / (1024 ** 3); // Default to system RAM
    }

    if (this.hardwareProfile.hasGPU && this.hardwareProfile.gpuVRAM) {
      return this.hardwareProfile.gpuVRAM;
    }

    return this.hardwareProfile.totalRAM;
  }

  /**
   * Get maximum concurrent requests based on hardware
   */
  private getMaxConcurrentRequests(): number {
    if (!this.hardwareProfile) return 4;

    if (this.hardwareProfile.hasGPU) {
      // GPU can handle more concurrent requests
      const vram = this.hardwareProfile.gpuVRAM || 0;
      if (vram >= 24) return 16;
      if (vram >= 12) return 8;
      if (vram >= 8) return 4;
      return 2;
    }

    // CPU-only: fewer concurrent requests
    const cores = this.hardwareProfile.cpuCores || 4;
    return Math.max(2, Math.floor(cores / 2));
  }

  /**
   * Set workspace resource quota
   */
  public setWorkspaceQuota(workspaceId: number, quota: Partial<ResourceQuota>) {
    const existing = this.workspaceQuotas.get(workspaceId) || {
      workspaceId,
      maxConcurrentRequests: 4,
      maxMemoryGB: 10,
      maxModelsLoaded: 2,
      priority: 1,
    };

    this.workspaceQuotas.set(workspaceId, { ...existing, ...quota });
  }

  /**
   * Get workspace resource quota
   */
  public getWorkspaceQuota(workspaceId: number): ResourceQuota {
    return (
      this.workspaceQuotas.get(workspaceId) || {
        workspaceId,
        maxConcurrentRequests: 4,
        maxMemoryGB: 10,
        maxModelsLoaded: 2,
        priority: 1,
      }
    );
  }

  /**
   * Check if a model can be loaded
   */
  public canLoadModel(modelId: string, sizeGB: number, workspaceId: number): { canLoad: boolean; reason?: string } {
    const allocation = this.getAllocation();
    const quota = this.getWorkspaceQuota(workspaceId);

    // Check if model is already loaded
    if (this.loadedModels.has(modelId)) {
      return { canLoad: true };
    }

    // Check workspace quota
    const workspaceModels = Array.from(this.loadedModels.values()).filter((m) => m.modelId.startsWith(`${workspaceId}-`));
    if (workspaceModels.length >= quota.maxModelsLoaded) {
      return {
        canLoad: false,
        reason: `Workspace quota exceeded: maximum ${quota.maxModelsLoaded} models allowed`,
      };
    }

    const workspaceMemory = workspaceModels.reduce((sum, m) => sum + m.sizeGB, 0);
    if (workspaceMemory + sizeGB > quota.maxMemoryGB) {
      return {
        canLoad: false,
        reason: `Workspace memory quota exceeded: ${workspaceMemory + sizeGB}GB > ${quota.maxMemoryGB}GB`,
      };
    }

    // Check global memory
    if (allocation.usedMemoryGB + sizeGB > allocation.totalMemoryGB * 0.9) {
      // Try to free up memory by unloading least recently used models
      const freedMemory = this.tryFreeMemory(sizeGB);
      if (freedMemory < sizeGB) {
        return {
          canLoad: false,
          reason: `Insufficient memory: need ${sizeGB}GB, only ${allocation.availableMemoryGB}GB available`,
        };
      }
    }

    return { canLoad: true };
  }

  /**
   * Try to free memory by unloading LRU models
   */
  private tryFreeMemory(requiredGB: number): number {
    const models = Array.from(this.loadedModels.values()).sort((a, b) => a.lastUsed.getTime() - b.lastUsed.getTime());

    let freedMemory = 0;
    for (const model of models) {
      if (freedMemory >= requiredGB) break;

      // Don't unload recently used models (within last 5 minutes)
      if (Date.now() - model.lastUsed.getTime() < 5 * 60 * 1000) continue;

      // Don't unload high-priority models
      if (model.priority >= 10) continue;

      this.unloadModel(model.modelId);
      freedMemory += model.sizeGB;
    }

    return freedMemory;
  }

  /**
   * Load a model into memory
   */
  public loadModel(modelId: string, modelName: string, sizeGB: number, priority: number = 1, workspaceId: number = 1): boolean {
    const check = this.canLoadModel(modelId, sizeGB, workspaceId);
    if (!check.canLoad) {
      console.warn(`[ResourceManager] Cannot load model ${modelId}: ${check.reason}`);
      return false;
    }

    const memoryType = this.hardwareProfile?.hasGPU ? "vram" : "ram";

    this.loadedModels.set(modelId, {
      modelId,
      modelName,
      sizeGB,
      loadedAt: new Date(),
      lastUsed: new Date(),
      useCount: 0,
      memoryType,
      priority,
    });

    console.log(`[ResourceManager] Loaded model ${modelId} (${sizeGB}GB) into ${memoryType}`);
    return true;
  }

  /**
   * Unload a model from memory
   */
  public unloadModel(modelId: string): boolean {
    const model = this.loadedModels.get(modelId);
    if (!model) return false;

    this.loadedModels.delete(modelId);
    console.log(`[ResourceManager] Unloaded model ${modelId} (freed ${model.sizeGB}GB)`);
    return true;
  }

  /**
   * Mark a model as used (updates LRU tracking)
   */
  public markModelUsed(modelId: string) {
    const model = this.loadedModels.get(modelId);
    if (model) {
      model.lastUsed = new Date();
      model.useCount++;
    }
  }

  /**
   * Acquire a request slot (for rate limiting)
   */
  public async acquireRequestSlot(requestId: string, workspaceId: number, priority: number = 1): Promise<void> {
    const quota = this.getWorkspaceQuota(workspaceId);
    const workspaceRequests = Array.from(this.activeRequests.values()).filter((r) => r.workspaceId === workspaceId);

    // Check workspace quota
    if (workspaceRequests.length >= quota.maxConcurrentRequests) {
      // Add to queue
      return new Promise((resolve) => {
        this.requestQueue.push({
          requestId,
          workspaceId,
          priority,
          callback: () => resolve(),
        });
        this.requestQueue.sort((a, b) => b.priority - a.priority); // Higher priority first
      });
    }

    // Check global limit
    if (this.activeRequests.size >= this.getMaxConcurrentRequests()) {
      return new Promise((resolve) => {
        this.requestQueue.push({
          requestId,
          workspaceId,
          priority,
          callback: () => resolve(),
        });
        this.requestQueue.sort((a, b) => b.priority - a.priority);
      });
    }

    // Slot available
    this.activeRequests.set(requestId, { workspaceId, startTime: new Date() });
  }

  /**
   * Release a request slot
   */
  public releaseRequestSlot(requestId: string) {
    this.activeRequests.delete(requestId);

    // Process queue
    if (this.requestQueue.length > 0) {
      const next = this.requestQueue.shift();
      if (next) {
        this.activeRequests.set(next.requestId, { workspaceId: next.workspaceId, startTime: new Date() });
        next.callback();
      }
    }
  }

  /**
   * Get resource usage statistics
   */
  public getStatistics() {
    const allocation = this.getAllocation();
    const avgRequestDuration = this.calculateAverageRequestDuration();

    return {
      ...allocation,
      queueLength: this.requestQueue.length,
      avgRequestDurationMs: avgRequestDuration,
      modelStats: Array.from(this.loadedModels.values()).map((m) => ({
        modelId: m.modelId,
        modelName: m.modelName,
        useCount: m.useCount,
        lastUsed: m.lastUsed,
        memoryType: m.memoryType,
      })),
    };
  }

  private calculateAverageRequestDuration(): number {
    // TODO: Track request durations
    return 0;
  }

  /**
   * Clean up stale models (not used in last hour)
   */
  public cleanupStaleModels() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const staleModels = Array.from(this.loadedModels.values()).filter(
      (m) => m.lastUsed.getTime() < oneHourAgo && m.priority < 10
    );

    for (const model of staleModels) {
      this.unloadModel(model.modelId);
    }

    if (staleModels.length > 0) {
      console.log(`[ResourceManager] Cleaned up ${staleModels.length} stale models`);
    }
  }
}

// Singleton instance
export const resourceManager = new ResourceManager();

// Periodic cleanup
setInterval(() => {
  resourceManager.cleanupStaleModels();
}, 15 * 60 * 1000); // Every 15 minutes
