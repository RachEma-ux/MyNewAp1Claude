import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

const execAsync = promisify(exec);

/**
 * Hardware Detection Service
 * Detects GPU (NVIDIA CUDA, AMD ROCm, Apple Metal), CPU, and memory capabilities
 */

export interface HardwareProfile {
  // GPU Information
  hasGPU: boolean;
  gpuType: "nvidia" | "amd" | "apple" | "none";
  gpuName?: string;
  gpuVRAM?: number; // in GB
  cudaVersion?: string;
  rocmVersion?: string;
  
  // CPU Information
  cpuModel: string;
  cpuCores: number;
  cpuThreads: number;
  cpuArchitecture: string;
  
  // Memory Information
  totalRAM: number; // in GB
  availableRAM: number; // in GB
  
  // Platform
  platform: string;
  platformVersion: string;
  
  // Recommendations
  recommendedModels: string[];
  maxModelSize: number; // in GB
}

/**
 * Detect NVIDIA GPU and CUDA
 */
async function detectNVIDIA(): Promise<{ hasGPU: boolean; gpuName?: string; vram?: number; cudaVersion?: string }> {
  try {
    // Try nvidia-smi command
    const { stdout } = await execAsync("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits");
    const lines = stdout.trim().split("\n");
    
    if (lines.length > 0 && lines[0]) {
      const [gpuName, vramMB] = lines[0].split(",").map(s => s.trim());
      const vramGB = parseInt(vramMB) / 1024;
      
      // Try to get CUDA version
      let cudaVersion: string | undefined;
      try {
        const { stdout: cudaOut } = await execAsync("nvcc --version");
        const match = cudaOut.match(/release (\d+\.\d+)/);
        if (match) {
          cudaVersion = match[1];
        }
      } catch {
        // CUDA toolkit not installed, but GPU exists
        cudaVersion = "Not installed";
      }
      
      return {
        hasGPU: true,
        gpuName,
        vram: vramGB,
        cudaVersion,
      };
    }
  } catch (error) {
    // nvidia-smi not found or failed
  }
  
  return { hasGPU: false };
}

/**
 * Detect AMD GPU and ROCm
 */
async function detectAMD(): Promise<{ hasGPU: boolean; gpuName?: string; vram?: number; rocmVersion?: string }> {
  try {
    // Try rocm-smi command
    const { stdout } = await execAsync("rocm-smi --showproductname");
    
    if (stdout.includes("GPU")) {
      // Parse GPU name
      const lines = stdout.split("\n");
      const gpuLine = lines.find(l => l.includes("GPU"));
      const gpuName = gpuLine ? gpuLine.split(":")[1]?.trim() : "AMD GPU";
      
      // Try to get VRAM
      let vram: number | undefined;
      try {
        const { stdout: memOut } = await execAsync("rocm-smi --showmeminfo vram");
        const match = memOut.match(/(\d+)\s*MB/);
        if (match) {
          vram = parseInt(match[1]) / 1024;
        }
      } catch {
        // Memory info not available
      }
      
      // Try to get ROCm version
      let rocmVersion: string | undefined;
      try {
        const { stdout: versionOut } = await execAsync("rocm-smi --version");
        const match = versionOut.match(/(\d+\.\d+\.\d+)/);
        if (match) {
          rocmVersion = match[1];
        }
      } catch {
        rocmVersion = "Unknown";
      }
      
      return {
        hasGPU: true,
        gpuName,
        vram,
        rocmVersion,
      };
    }
  } catch (error) {
    // rocm-smi not found or failed
  }
  
  return { hasGPU: false };
}

/**
 * Detect Apple Metal (macOS only)
 */
async function detectAppleMetal(): Promise<{ hasGPU: boolean; gpuName?: string; vram?: number }> {
  if (process.platform !== "darwin") {
    return { hasGPU: false };
  }
  
  try {
    // Use system_profiler to get GPU info
    const { stdout } = await execAsync("system_profiler SPDisplaysDataType");
    
    // Parse GPU name
    const nameMatch = stdout.match(/Chipset Model:\s*(.+)/);
    const gpuName = nameMatch ? nameMatch[1].trim() : "Apple GPU";
    
    // Parse VRAM (if available)
    let vram: number | undefined;
    const vramMatch = stdout.match(/VRAM.*:\s*(\d+)\s*MB/);
    if (vramMatch) {
      vram = parseInt(vramMatch[1]) / 1024;
    }
    
    // If we found a GPU name, Metal is available
    if (gpuName) {
      return {
        hasGPU: true,
        gpuName,
        vram,
      };
    }
  } catch (error) {
    // system_profiler failed
  }
  
  return { hasGPU: false };
}

/**
 * Get CPU information
 */
function getCPUInfo() {
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model || "Unknown CPU";
  const cpuCores = os.cpus().length;
  const cpuArchitecture = os.arch();
  
  // Estimate threads (usually 2x cores for hyperthreading, but not always accurate)
  const cpuThreads = cpuCores;
  
  return {
    cpuModel,
    cpuCores,
    cpuThreads,
    cpuArchitecture,
  };
}

/**
 * Get memory information
 */
function getMemoryInfo() {
  const totalRAM = os.totalmem() / (1024 ** 3); // Convert to GB
  const freeRAM = os.freemem() / (1024 ** 3);
  const availableRAM = freeRAM;
  
  return {
    totalRAM: Math.round(totalRAM * 10) / 10,
    availableRAM: Math.round(availableRAM * 10) / 10,
  };
}

/**
 * Get platform information
 */
function getPlatformInfo() {
  return {
    platform: os.platform(),
    platformVersion: os.release(),
  };
}

/**
 * Generate model recommendations based on hardware
 */
function generateRecommendations(profile: Partial<HardwareProfile>): { recommendedModels: string[]; maxModelSize: number } {
  const recommendations: string[] = [];
  let maxModelSize = 0;
  
  // GPU-based recommendations
  if (profile.hasGPU && profile.gpuVRAM) {
    const vram = profile.gpuVRAM;

    if (vram >= 24) {
      // High-end GPU (RTX 4090, A100, etc.)
      maxModelSize = 70;
      recommendations.push("Llama 4 Scout", "DeepSeek R1 8B", "Qwen 3 8B", "Mistral 7B", "Phi-3 Mini");
    } else if (vram >= 16) {
      // Mid-high GPU (RTX 4080, A6000, etc.)
      maxModelSize = 34;
      recommendations.push("DeepSeek R1 8B", "Qwen 3 8B", "Mistral 7B", "Phi-3 Mini");
    } else if (vram >= 12) {
      // Mid GPU (RTX 4070 Ti, RTX 3090, etc.)
      maxModelSize = 13;
      recommendations.push("Mistral 7B", "DeepSeek R1 8B", "Phi-3 Mini", "Phi-2");
    } else if (vram >= 8) {
      // Entry GPU (RTX 4060 Ti, RTX 3070, etc.)
      maxModelSize = 7;
      recommendations.push("Mistral 7B", "Phi-3 Mini", "Phi-2", "Gemma 2B");
    } else if (vram >= 4) {
      // Low-end GPU
      maxModelSize = 3;
      recommendations.push("Phi-3 Mini", "Phi-2", "Gemma 2B", "DeepSeek R1 1.5B", "SmolLM2 1.7B");
    } else if (vram >= 2) {
      // Very low VRAM
      maxModelSize = 1.5;
      recommendations.push("DeepSeek R1 1.5B", "PhoneLM 1.5B", "SmolLM2 1.7B", "TinyLlama 1.1B", "Llama 3.2 1B");
    } else {
      // Minimal VRAM
      maxModelSize = 0.5;
      recommendations.push("SmolLM2 360M Instruct", "PhoneLM 0.5B", "TinyLlama 1.1B");
    }
  } else {
    // CPU-only recommendations based on RAM
    const ram = profile.totalRAM || 0;

    if (ram >= 64) {
      maxModelSize = 34;
      recommendations.push("DeepSeek R1 8B", "Qwen 3 8B", "Mistral 7B");
    } else if (ram >= 32) {
      maxModelSize = 13;
      recommendations.push("Mistral 7B", "DeepSeek R1 8B", "Phi-3 Mini");
    } else if (ram >= 16) {
      maxModelSize = 7;
      recommendations.push("Mistral 7B", "Phi-3 Mini", "Phi-2", "Gemma 2B");
    } else if (ram >= 8) {
      maxModelSize = 3;
      recommendations.push("Phi-3 Mini", "Phi-2", "Gemma 2B", "DeepSeek R1 1.5B", "SmolLM2 1.7B");
    } else if (ram >= 4) {
      maxModelSize = 1.5;
      recommendations.push("DeepSeek R1 1.5B", "PhoneLM 1.5B", "SmolLM2 1.7B", "TinyLlama 1.1B", "Llama 3.2 1B");
    } else {
      maxModelSize = 0.5;
      recommendations.push("SmolLM2 360M Instruct", "PhoneLM 0.5B", "TinyLlama 1.1B");
    }
  }
  
  return { recommendedModels: recommendations, maxModelSize };
}

/**
 * Main hardware detection function
 */
export async function detectHardware(): Promise<HardwareProfile> {
  // Detect GPU
  let gpuInfo = await detectNVIDIA();
  let gpuType: "nvidia" | "amd" | "apple" | "none" = "none";
  
  if (gpuInfo.hasGPU) {
    gpuType = "nvidia";
  } else {
    gpuInfo = await detectAMD();
    if (gpuInfo.hasGPU) {
      gpuType = "amd";
    } else {
      gpuInfo = await detectAppleMetal();
      if (gpuInfo.hasGPU) {
        gpuType = "apple";
      }
    }
  }
  
  // Get CPU and memory info
  const cpuInfo = getCPUInfo();
  const memoryInfo = getMemoryInfo();
  const platformInfo = getPlatformInfo();
  
  // Build profile
  const profile: Partial<HardwareProfile> = {
    hasGPU: gpuInfo.hasGPU,
    gpuType,
    gpuName: gpuInfo.gpuName,
    gpuVRAM: gpuInfo.vram,
    cudaVersion: (gpuInfo as any).cudaVersion,
    rocmVersion: (gpuInfo as any).rocmVersion,
    ...cpuInfo,
    ...memoryInfo,
    ...platformInfo,
  };
  
  // Generate recommendations
  const { recommendedModels, maxModelSize } = generateRecommendations(profile);
  
  return {
    ...profile,
    recommendedModels,
    maxModelSize,
  } as HardwareProfile;
}

/**
 * Check if a model is compatible with current hardware
 */
export function isModelCompatible(modelSizeGB: number, profile: HardwareProfile): {
  compatible: boolean;
  reason?: string;
} {
  if (profile.hasGPU && profile.gpuVRAM) {
    // GPU available - check VRAM
    if (modelSizeGB > profile.gpuVRAM * 0.9) {
      return {
        compatible: false,
        reason: `Model requires ~${modelSizeGB}GB VRAM, but only ${profile.gpuVRAM}GB available`,
      };
    }
  } else {
    // CPU-only - check RAM
    if (modelSizeGB > profile.availableRAM * 0.8) {
      return {
        compatible: false,
        reason: `Model requires ~${modelSizeGB}GB RAM, but only ${profile.availableRAM}GB available`,
      };
    }
  }
  
  return { compatible: true };
}
