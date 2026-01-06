/**
 * Multi-GPU Detection and Management Service
 * Handles detection and load balancing across multiple GPUs
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface GPUInfo {
  id: number;
  name: string;
  vram: number; // GB
  vramUsed: number; // GB
  vramFree: number; // GB
  utilization: number; // 0-100%
  temperature: number; // Celsius
  powerUsage: number; // Watts
  powerLimit: number; // Watts
}

export interface MultiGPUConfig {
  enabledGPUs: number[]; // GPU IDs to use
  strategy: "round-robin" | "least-loaded" | "dedicated";
  maxGPUsPerModel: number;
}

/**
 * Multi-GPU Service
 */
class MultiGPUService {
  private config: MultiGPUConfig = {
    enabledGPUs: [],
    strategy: "least-loaded",
    maxGPUsPerModel: 1,
  };

  /**
   * Detect all available GPUs
   */
  async detectGPUs(): Promise<GPUInfo[]> {
    try {
      // Try NVIDIA first
      const nvidiaGPUs = await this.detectNVIDIAGPUs();
      if (nvidiaGPUs.length > 0) {
        return nvidiaGPUs;
      }

      // Try AMD ROCm
      const amdGPUs = await this.detectAMDGPUs();
      if (amdGPUs.length > 0) {
        return amdGPUs;
      }

      return [];
    } catch (error) {
      console.error("[MultiGPU] Detection failed:", error);
      return [];
    }
  }

  /**
   * Detect NVIDIA GPUs
   */
  private async detectNVIDIAGPUs(): Promise<GPUInfo[]> {
    try {
      const { stdout } = await execAsync(
        "nvidia-smi --query-gpu=index,name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits"
      );

      const lines = stdout.trim().split("\n");
      const gpus: GPUInfo[] = [];

      for (const line of lines) {
        const [
          id,
          name,
          vramTotal,
          vramUsed,
          vramFree,
          utilization,
          temperature,
          powerUsage,
          powerLimit,
        ] = line.split(",").map((s) => s.trim());

        gpus.push({
          id: parseInt(id),
          name,
          vram: parseFloat(vramTotal) / 1024, // Convert MB to GB
          vramUsed: parseFloat(vramUsed) / 1024,
          vramFree: parseFloat(vramFree) / 1024,
          utilization: parseFloat(utilization),
          temperature: parseFloat(temperature),
          powerUsage: parseFloat(powerUsage),
          powerLimit: parseFloat(powerLimit),
        });
      }

      return gpus;
    } catch (error) {
      return [];
    }
  }

  /**
   * Detect AMD GPUs
   */
  private async detectAMDGPUs(): Promise<GPUInfo[]> {
    try {
      const { stdout } = await execAsync("rocm-smi --showid --showproductname");

      // Parse ROCm output (simplified)
      const lines = stdout.trim().split("\n");
      const gpus: GPUInfo[] = [];

      let currentId = 0;
      for (const line of lines) {
        if (line.includes("GPU")) {
          const name = line.split(":")[1]?.trim() || "AMD GPU";
          gpus.push({
            id: currentId++,
            name,
            vram: 0, // Would need additional commands to get VRAM
            vramUsed: 0,
            vramFree: 0,
            utilization: 0,
            temperature: 0,
            powerUsage: 0,
            powerLimit: 0,
          });
        }
      }

      return gpus;
    } catch (error) {
      return [];
    }
  }

  /**
   * Configure multi-GPU setup
   */
  configure(config: Partial<MultiGPUConfig>): void {
    this.config = { ...this.config, ...config };
    console.log("[MultiGPU] Configuration updated:", this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): MultiGPUConfig {
    return { ...this.config };
  }

  /**
   * Select best GPU for a task
   */
  async selectGPU(requiredVRAM: number): Promise<number | null> {
    const gpus = await this.detectGPUs();
    const enabledGPUs = gpus.filter((gpu) =>
      this.config.enabledGPUs.length === 0 || this.config.enabledGPUs.includes(gpu.id)
    );

    if (enabledGPUs.length === 0) {
      return null;
    }

    // Filter GPUs with sufficient VRAM
    const suitableGPUs = enabledGPUs.filter((gpu) => gpu.vramFree >= requiredVRAM);

    if (suitableGPUs.length === 0) {
      return null;
    }

    // Select based on strategy
    switch (this.config.strategy) {
      case "round-robin":
        return this.selectRoundRobin(suitableGPUs);
      case "least-loaded":
        return this.selectLeastLoaded(suitableGPUs);
      case "dedicated":
        return suitableGPUs[0].id;
      default:
        return suitableGPUs[0].id;
    }
  }

  /**
   * Round-robin GPU selection
   */
  private selectRoundRobin(gpus: GPUInfo[]): number {
    // Simple round-robin based on GPU ID
    const sortedGPUs = gpus.sort((a, b) => a.id - b.id);
    return sortedGPUs[0].id;
  }

  /**
   * Select least loaded GPU
   */
  private selectLeastLoaded(gpus: GPUInfo[]): number {
    // Find GPU with lowest utilization and most free VRAM
    const scored = gpus.map((gpu) => ({
      id: gpu.id,
      score: gpu.vramFree * 0.7 + (100 - gpu.utilization) * 0.3,
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0].id;
  }

  /**
   * Get GPU utilization statistics
   */
  async getStatistics(): Promise<{
    totalGPUs: number;
    enabledGPUs: number;
    totalVRAM: number;
    usedVRAM: number;
    freeVRAM: number;
    averageUtilization: number;
    averageTemperature: number;
  }> {
    const gpus = await this.detectGPUs();

    if (gpus.length === 0) {
      return {
        totalGPUs: 0,
        enabledGPUs: 0,
        totalVRAM: 0,
        usedVRAM: 0,
        freeVRAM: 0,
        averageUtilization: 0,
        averageTemperature: 0,
      };
    }

    const enabledGPUs = gpus.filter(
      (gpu) =>
        this.config.enabledGPUs.length === 0 || this.config.enabledGPUs.includes(gpu.id)
    );

    return {
      totalGPUs: gpus.length,
      enabledGPUs: enabledGPUs.length,
      totalVRAM: gpus.reduce((sum, gpu) => sum + gpu.vram, 0),
      usedVRAM: gpus.reduce((sum, gpu) => sum + gpu.vramUsed, 0),
      freeVRAM: gpus.reduce((sum, gpu) => sum + gpu.vramFree, 0),
      averageUtilization: gpus.reduce((sum, gpu) => sum + gpu.utilization, 0) / gpus.length,
      averageTemperature: gpus.reduce((sum, gpu) => sum + gpu.temperature, 0) / gpus.length,
    };
  }

  /**
   * Check if multi-GPU is available
   */
  async isMultiGPUAvailable(): Promise<boolean> {
    const gpus = await this.detectGPUs();
    return gpus.length > 1;
  }

  /**
   * Get GPU by ID
   */
  async getGPU(id: number): Promise<GPUInfo | null> {
    const gpus = await this.detectGPUs();
    return gpus.find((gpu) => gpu.id === id) || null;
  }

  /**
   * Enable specific GPUs
   */
  enableGPUs(gpuIds: number[]): void {
    this.config.enabledGPUs = gpuIds;
    console.log(`[MultiGPU] Enabled GPUs: ${gpuIds.join(", ")}`);
  }

  /**
   * Disable specific GPUs
   */
  disableGPUs(gpuIds: number[]): void {
    this.config.enabledGPUs = this.config.enabledGPUs.filter((id) => !gpuIds.includes(id));
    console.log(`[MultiGPU] Disabled GPUs: ${gpuIds.join(", ")}`);
  }

  /**
   * Set CUDA_VISIBLE_DEVICES environment variable
   */
  setCUDAVisibleDevices(gpuIds: number[]): void {
    process.env.CUDA_VISIBLE_DEVICES = gpuIds.join(",");
    console.log(`[MultiGPU] CUDA_VISIBLE_DEVICES set to: ${gpuIds.join(",")}`);
  }

  /**
   * Distribute model across multiple GPUs
   */
  async distributeModel(
    modelSizeGB: number,
    maxGPUs?: number
  ): Promise<{ gpuIds: number[]; layersPerGPU: number[] }> {
    const gpus = await this.detectGPUs();
    const enabledGPUs = gpus.filter(
      (gpu) =>
        this.config.enabledGPUs.length === 0 || this.config.enabledGPUs.includes(gpu.id)
    );

    const gpuCount = Math.min(
      maxGPUs || this.config.maxGPUsPerModel,
      enabledGPUs.length
    );

    if (gpuCount === 0) {
      return { gpuIds: [], layersPerGPU: [] };
    }

    // Sort GPUs by free VRAM
    const sortedGPUs = enabledGPUs.sort((a, b) => b.vramFree - a.vramFree);
    const selectedGPUs = sortedGPUs.slice(0, gpuCount);

    // Distribute layers proportionally to VRAM
    const totalVRAM = selectedGPUs.reduce((sum, gpu) => sum + gpu.vramFree, 0);
    const layersPerGPU = selectedGPUs.map((gpu) =>
      Math.floor((gpu.vramFree / totalVRAM) * 100)
    );

    return {
      gpuIds: selectedGPUs.map((gpu) => gpu.id),
      layersPerGPU,
    };
  }
}

// Singleton instance
export const multiGPUService = new MultiGPUService();
