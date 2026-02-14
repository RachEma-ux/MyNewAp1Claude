/**
 * Hardware-Based Model Recommendation Service
 * Recommends optimal models based on available hardware
 */

import { HardwareProfile } from "./detection-service";

export interface ModelRecommendation {
  modelId: string;
  modelName: string;
  size: string; // e.g., "7B", "13B"
  quantization?: string; // e.g., "Q4_K_M", "Q5_K_M"
  estimatedVRAM: number; // GB
  estimatedRAM: number; // GB
  reason: string;
  performance: "excellent" | "good" | "acceptable" | "slow";
  category: "chat" | "code" | "instruct" | "embedding";
}

export interface RecommendationOptions {
  useCase?: "chat" | "code" | "instruct" | "embedding" | "all";
  maxModels?: number;
  includeQuantized?: boolean;
  preferSpeed?: boolean; // Prefer faster models over larger ones
}

/**
 * Model Recommendation Service
 */
class ModelRecommendationService {
  /**
   * Get recommended models for hardware profile
   */
  getRecommendations(
    hardware: HardwareProfile,
    options: RecommendationOptions = {}
  ): ModelRecommendation[] {
    const {
      useCase = "all",
      maxModels = 10,
      includeQuantized = true,
      preferSpeed = false,
    } = options;

    const recommendations: ModelRecommendation[] = [];

    // Determine available resources
    const hasGPU = hardware.hasGPU;
    const vram = hardware.gpuVRAM || 0;
    const ram = hardware.availableRAM;

    // GPU-based recommendations
    if (hasGPU && vram > 0) {
      recommendations.push(...this.getGPURecommendations(vram, ram, useCase, includeQuantized));
    }

    // CPU-only recommendations
    if (!hasGPU || vram < 4) {
      recommendations.push(...this.getCPURecommendations(ram, useCase, includeQuantized));
    }

    // Sort by performance and size
    recommendations.sort((a, b) => {
      if (preferSpeed) {
        // Prefer smaller, faster models
        const perfScore = { excellent: 4, good: 3, acceptable: 2, slow: 1 };
        return perfScore[b.performance] - perfScore[a.performance];
      } else {
        // Prefer larger, more capable models
        return b.estimatedVRAM - a.estimatedVRAM;
      }
    });

    // Filter by use case
    const filtered = useCase === "all"
      ? recommendations
      : recommendations.filter((r) => r.category === useCase);

    return filtered.slice(0, maxModels);
  }

  /**
   * Get GPU-optimized recommendations
   */
  private getGPURecommendations(
    vram: number,
    ram: number,
    useCase: string,
    includeQuantized: boolean
  ): ModelRecommendation[] {
    const recommendations: ModelRecommendation[] = [];

    // High-end GPU (24GB+)
    if (vram >= 24) {
      if (useCase === "all" || useCase === "chat") {
        recommendations.push({
          modelId: "meta-llama/Llama-2-70b-chat-hf",
          modelName: "Llama 2 70B Chat",
          size: "70B",
          estimatedVRAM: 140,
          estimatedRAM: 20,
          reason: "Flagship model with excellent reasoning capabilities",
          performance: "excellent",
          category: "chat",
        });
      }
    }

    // Mid-range GPU (12-24GB)
    if (vram >= 12) {
      if (useCase === "all" || useCase === "chat") {
        recommendations.push({
          modelId: "mistralai/Mixtral-8x7B-Instruct-v0.1",
          modelName: "Mixtral 8x7B Instruct",
          size: "47B",
          estimatedVRAM: 24,
          estimatedRAM: 16,
          reason: "Mixture of experts model with strong performance",
          performance: "excellent",
          category: "chat",
        });

        recommendations.push({
          modelId: "meta-llama/Llama-2-13b-chat-hf",
          modelName: "Llama 2 13B Chat",
          size: "13B",
          estimatedVRAM: 13,
          estimatedRAM: 8,
          reason: "Balanced model with good quality and speed",
          performance: "excellent",
          category: "chat",
        });
      }

      if (useCase === "all" || useCase === "code") {
        recommendations.push({
          modelId: "Qwen/Qwen2.5-Coder-32B-Instruct",
          modelName: "Qwen 2.5 Coder 32B",
          size: "32B",
          estimatedVRAM: 13,
          estimatedRAM: 8,
          reason: "State-of-the-art open coding model",
          performance: "excellent",
          category: "code",
        });
      }
    }

    // Entry-level GPU (6-12GB)
    if (vram >= 6) {
      if (useCase === "all" || useCase === "chat") {
        recommendations.push({
          modelId: "mistralai/Mistral-7B-Instruct-v0.3",
          modelName: "Mistral 7B Instruct",
          size: "7B",
          estimatedVRAM: 7,
          estimatedRAM: 4,
          reason: "Efficient 7B model with strong performance",
          performance: "excellent",
          category: "chat",
        });

        if (includeQuantized) {
          recommendations.push({
            modelId: "bartowski/Llama-3.2-3B-Instruct-GGUF",
            modelName: "Llama 3.2 3B Instruct (Q4)",
            size: "3B",
            quantization: "Q4_K_M",
            estimatedVRAM: 8,
            estimatedRAM: 4,
            reason: "Quantized 13B model fits in 8GB VRAM",
            performance: "good",
            category: "chat",
          });
        }
      }

      if (useCase === "all" || useCase === "code") {
        recommendations.push({
          modelId: "Qwen/Qwen2.5-Coder-7B-Instruct",
          modelName: "Qwen 2.5 Coder 7B",
          size: "7B",
          estimatedVRAM: 7,
          estimatedRAM: 4,
          reason: "Strong open-source coding model",
          performance: "excellent",
          category: "code",
        });
      }
    }

    // Low VRAM (4-6GB)
    if (vram >= 4 && includeQuantized) {
      if (useCase === "all" || useCase === "chat") {
        recommendations.push({
          modelId: "TheBloke/Mistral-7B-Instruct-v0.2-GGUF",
          modelName: "Mistral 7B Instruct (Q4)",
          size: "7B",
          quantization: "Q4_K_M",
          estimatedVRAM: 4.5,
          estimatedRAM: 2,
          reason: "Quantized model optimized for 4GB VRAM",
          performance: "good",
          category: "chat",
        });
      }
    }

    return recommendations;
  }

  /**
   * Get CPU-only recommendations
   */
  private getCPURecommendations(
    ram: number,
    useCase: string,
    includeQuantized: boolean
  ): ModelRecommendation[] {
    const recommendations: ModelRecommendation[] = [];

    if (!includeQuantized) {
      return recommendations; // CPU needs quantized models
    }

    // High RAM (32GB+)
    if (ram >= 32) {
      if (useCase === "all" || useCase === "chat") {
        recommendations.push({
          modelId: "TheBloke/Llama-2-13B-chat-GGUF",
          modelName: "Llama 2 13B Chat (Q5)",
          size: "13B",
          quantization: "Q5_K_M",
          estimatedVRAM: 0,
          estimatedRAM: 10,
          reason: "High-quality quantized model for CPU",
          performance: "acceptable",
          category: "chat",
        });
      }
    }

    // Medium RAM (16-32GB)
    if (ram >= 16) {
      if (useCase === "all" || useCase === "chat") {
        recommendations.push({
          modelId: "TheBloke/Mistral-7B-Instruct-v0.2-GGUF",
          modelName: "Mistral 7B Instruct (Q5)",
          size: "7B",
          quantization: "Q5_K_M",
          estimatedVRAM: 0,
          estimatedRAM: 6,
          reason: "Efficient 7B model for CPU inference",
          performance: "acceptable",
          category: "chat",
        });
      }

      if (useCase === "all" || useCase === "code") {
        recommendations.push({
          modelId: "TheBloke/CodeLlama-7B-GGUF",
          modelName: "Code Llama 7B (Q5)",
          size: "7B",
          quantization: "Q5_K_M",
          estimatedVRAM: 0,
          estimatedRAM: 6,
          reason: "Code generation on CPU",
          performance: "acceptable",
          category: "code",
        });
      }
    }

    // Low RAM (8-16GB)
    if (ram >= 8) {
      if (useCase === "all" || useCase === "chat") {
        recommendations.push({
          modelId: "TheBloke/Mistral-7B-Instruct-v0.2-GGUF",
          modelName: "Mistral 7B Instruct (Q4)",
          size: "7B",
          quantization: "Q4_K_M",
          estimatedVRAM: 0,
          estimatedRAM: 4.5,
          reason: "Lightweight model for limited RAM",
          performance: "slow",
          category: "chat",
        });
      }
    }

    return recommendations;
  }

  /**
   * Check if hardware can run a specific model
   */
  canRunModel(
    hardware: HardwareProfile,
    modelSize: number, // in GB
    requiresGPU = false
  ): { canRun: boolean; reason: string } {
    if (requiresGPU && !hardware.hasGPU) {
      return {
        canRun: false,
        reason: "Model requires GPU but no GPU detected",
      };
    }

    const vram = hardware.gpuVRAM || 0;
    const ram = hardware.availableRAM;

    if (hardware.hasGPU && vram >= modelSize) {
      return {
        canRun: true,
        reason: `Sufficient VRAM (${vram}GB available, ${modelSize}GB required)`,
      };
    }

    if (ram >= modelSize) {
      return {
        canRun: true,
        reason: `Can run on CPU with ${ram}GB RAM (${modelSize}GB required)`,
      };
    }

    return {
      canRun: false,
      reason: `Insufficient memory (need ${modelSize}GB, have ${Math.max(vram, ram)}GB)`,
    };
  }

  /**
   * Get optimal quantization level for hardware
   */
  getOptimalQuantization(hardware: HardwareProfile, modelSizeGB: number): string {
    const vram = hardware.gpuVRAM || 0;
    const ram = hardware.availableRAM;
    const availableMemory = Math.max(vram, ram);

    const ratio = availableMemory / modelSizeGB;

    if (ratio >= 2) {
      return "F16"; // Full precision if plenty of memory
    } else if (ratio >= 1.5) {
      return "Q8_0"; // High quality quantization
    } else if (ratio >= 1.2) {
      return "Q5_K_M"; // Balanced quantization
    } else if (ratio >= 1) {
      return "Q4_K_M"; // Aggressive quantization
    } else {
      return "Q2_K"; // Maximum compression
    }
  }

  /**
   * Estimate inference speed
   */
  estimateSpeed(
    hardware: HardwareProfile,
    modelSize: string
  ): { tokensPerSecond: number; quality: "excellent" | "good" | "acceptable" | "slow" } {
    const sizeNum = parseInt(modelSize.replace("B", ""));

    if (hardware.hasGPU && hardware.gpuVRAM && hardware.gpuVRAM >= sizeNum) {
      // GPU inference
      const tps = hardware.gpuType === "nvidia" ? 50 : 30;
      return { tokensPerSecond: tps, quality: "excellent" };
    } else if (hardware.cpuThreads >= 8) {
      // Fast CPU
      return { tokensPerSecond: 10, quality: "acceptable" };
    } else {
      // Slow CPU
      return { tokensPerSecond: 3, quality: "slow" };
    }
  }
}

// Singleton instance
export const recommendationService = new ModelRecommendationService();
