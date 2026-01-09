/**
 * Device Detection & System Requirements Checker
 * Detects device characteristics and validates against model requirements
 */

import * as os from 'os';
import { execSync } from 'child_process';
import * as fs from 'fs';

export interface DeviceSpecs {
  ram: {
    total: number; // bytes
    available: number; // bytes
    totalGB: number;
    availableGB: number;
  };
  cpu: {
    cores: number;
    model: string;
    architecture: string;
  };
  disk: {
    total: number; // bytes
    available: number; // bytes
    totalGB: number;
    availableGB: number;
  };
  gpu?: {
    detected: boolean;
    name?: string;
    vram?: number; // GB
    vendor?: string;
  };
  os: {
    platform: string; // 'win32', 'darwin', 'linux'
    type: string; // 'Windows_NT', 'Darwin', 'Linux'
    release: string;
    arch: string; // 'x64', 'arm64', etc.
  };
}

export interface SystemRequirements {
  minRAM: number; // GB
  recommendedRAM: number; // GB
  minDiskSpace: number; // GB
  gpuRequired: boolean;
  minVRAM?: number; // GB (if GPU required)
  supportedOS?: string[]; // ['windows', 'macos', 'linux', 'android']
  supportedArchitectures?: string[]; // ['x64', 'arm64']
}

export interface CompatibilityCheck {
  compatible: boolean;
  warnings: string[];
  errors: string[];
  recommendations: string[];
  deviceSpecs: DeviceSpecs;
  requirements: SystemRequirements;
}

/**
 * Detect if running on Android
 */
function isAndroid(): boolean {
  try {
    // Check if running on Android (Termux or similar)
    if (os.platform() === 'linux') {
      // Check for Android-specific paths or properties
      if (process.env.ANDROID_ROOT || process.env.ANDROID_DATA) {
        return true;
      }
      // Check if /system/build.prop exists (Android indicator)
      if (fs.existsSync('/system/build.prop')) {
        return true;
      }
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Detect current device specifications
 */
export async function detectDeviceSpecs(): Promise<DeviceSpecs> {
  let platform = os.platform();
  const totalRAM = os.totalmem();
  const freeRAM = os.freemem();

  // Detect Android
  if (isAndroid()) {
    platform = 'android' as any;
  }

  // Get disk space
  const disk = getDiskSpace();

  // Get GPU info (best effort)
  const gpu = await detectGPU();

  return {
    ram: {
      total: totalRAM,
      available: freeRAM,
      totalGB: parseFloat((totalRAM / (1024 ** 3)).toFixed(2)),
      availableGB: parseFloat((freeRAM / (1024 ** 3)).toFixed(2)),
    },
    cpu: {
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || 'Unknown',
      architecture: os.arch(),
    },
    disk: {
      total: disk.total,
      available: disk.available,
      totalGB: parseFloat((disk.total / (1024 ** 3)).toFixed(2)),
      availableGB: parseFloat((disk.available / (1024 ** 3)).toFixed(2)),
    },
    gpu,
    os: {
      platform,
      type: os.type(),
      release: os.release(),
      arch: os.arch(),
    },
  };
}

/**
 * Get disk space information
 */
function getDiskSpace(): { total: number; available: number } {
  try {
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows: use wmic
      const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' });
      const lines = output.trim().split('\n').slice(1); // Skip header
      let totalSpace = 0;
      let freeSpace = 0;

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3 && parts[1] && parts[2]) {
          freeSpace += parseInt(parts[1], 10) || 0;
          totalSpace += parseInt(parts[2], 10) || 0;
        }
      }

      return { total: totalSpace, available: freeSpace };
    } else if (platform === 'darwin' || platform === 'linux') {
      // macOS/Linux: use df
      const output = execSync('df -k /', { encoding: 'utf8' });
      const lines = output.trim().split('\n');

      if (lines.length >= 2) {
        const parts = lines[1].trim().split(/\s+/);
        if (parts.length >= 4) {
          const total = parseInt(parts[1], 10) * 1024; // Convert KB to bytes
          const available = parseInt(parts[3], 10) * 1024;
          return { total, available };
        }
      }
    }
  } catch (error) {
    console.warn('[Device Detection] Failed to get disk space:', error);
  }

  // Fallback: return 0
  return { total: 0, available: 0 };
}

/**
 * Detect GPU (best effort)
 */
async function detectGPU(): Promise<DeviceSpecs['gpu']> {
  try {
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows: Try to detect NVIDIA GPU using nvidia-smi
      try {
        const output = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits', {
          encoding: 'utf8',
          timeout: 5000,
        });

        const lines = output.trim().split('\n');
        if (lines.length > 0) {
          const [name, vramMB] = lines[0].split(',');
          return {
            detected: true,
            name: name.trim(),
            vram: parseFloat((parseInt(vramMB.trim(), 10) / 1024).toFixed(2)),
            vendor: 'NVIDIA',
          };
        }
      } catch (nvidiaError) {
        // Not an NVIDIA GPU or nvidia-smi not available
      }

      // Try to detect AMD GPU using wmic
      try {
        const output = execSync('wmic path win32_VideoController get name', {
          encoding: 'utf8',
          timeout: 5000,
        });

        const lines = output.trim().split('\n').slice(1); // Skip header
        const gpuName = lines[0]?.trim();

        if (gpuName && (gpuName.toLowerCase().includes('amd') || gpuName.toLowerCase().includes('radeon'))) {
          return {
            detected: true,
            name: gpuName,
            vendor: 'AMD',
          };
        }
      } catch (amdError) {
        // AMD detection failed
      }
    } else if (platform === 'darwin') {
      // macOS: Check for Apple Silicon GPU
      try {
        const output = execSync('system_profiler SPDisplaysDataType', {
          encoding: 'utf8',
          timeout: 5000,
        });

        if (output.includes('Apple') || output.includes('Metal')) {
          return {
            detected: true,
            name: 'Apple GPU',
            vendor: 'Apple',
          };
        }
      } catch (macError) {
        // macOS GPU detection failed
      }
    } else if (platform === 'linux') {
      // Linux: Try lspci or nvidia-smi
      try {
        const output = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits', {
          encoding: 'utf8',
          timeout: 5000,
        });

        const lines = output.trim().split('\n');
        if (lines.length > 0) {
          const [name, vramMB] = lines[0].split(',');
          return {
            detected: true,
            name: name.trim(),
            vram: parseFloat((parseInt(vramMB.trim(), 10) / 1024).toFixed(2)),
            vendor: 'NVIDIA',
          };
        }
      } catch (nvidiaError) {
        // Try lspci for AMD/Intel
        try {
          const output = execSync('lspci | grep -i vga', {
            encoding: 'utf8',
            timeout: 5000,
          });

          if (output.toLowerCase().includes('amd') || output.toLowerCase().includes('radeon')) {
            return {
              detected: true,
              name: 'AMD GPU',
              vendor: 'AMD',
            };
          } else if (output.toLowerCase().includes('intel')) {
            return {
              detected: true,
              name: 'Intel GPU',
              vendor: 'Intel',
            };
          }
        } catch (lspciError) {
          // lspci failed
        }
      }
    }
  } catch (error) {
    console.warn('[Device Detection] Failed to detect GPU:', error);
  }

  return {
    detected: false,
  };
}

/**
 * Check if device meets system requirements for a model
 */
export function checkCompatibility(
  deviceSpecs: DeviceSpecs,
  requirements: SystemRequirements
): CompatibilityCheck {
  const warnings: string[] = [];
  const errors: string[] = [];
  const recommendations: string[] = [];

  // Check RAM
  if (deviceSpecs.ram.totalGB < requirements.minRAM) {
    errors.push(
      `Insufficient RAM: ${deviceSpecs.ram.totalGB}GB available, ${requirements.minRAM}GB required`
    );
  } else if (deviceSpecs.ram.totalGB < requirements.recommendedRAM) {
    warnings.push(
      `RAM below recommended: ${deviceSpecs.ram.totalGB}GB available, ${requirements.recommendedRAM}GB recommended for optimal performance`
    );
    recommendations.push(
      `Consider closing other applications to free up RAM before running this model`
    );
  }

  // Check available RAM (at least half should be free)
  if (deviceSpecs.ram.availableGB < requirements.minRAM * 0.5) {
    warnings.push(
      `Low available RAM: ${deviceSpecs.ram.availableGB}GB free. Close other applications to improve performance.`
    );
  }

  // Check disk space
  if (deviceSpecs.disk.availableGB < requirements.minDiskSpace) {
    errors.push(
      `Insufficient disk space: ${deviceSpecs.disk.availableGB}GB available, ${requirements.minDiskSpace}GB required`
    );
  } else if (deviceSpecs.disk.availableGB < requirements.minDiskSpace * 1.5) {
    warnings.push(
      `Low disk space: ${deviceSpecs.disk.availableGB}GB available. Consider freeing up space.`
    );
  }

  // Check GPU
  if (requirements.gpuRequired && !deviceSpecs.gpu?.detected) {
    errors.push('GPU required but not detected. This model may not run or will be very slow.');
    recommendations.push('Consider using a smaller CPU-only model instead.');
  } else if (requirements.gpuRequired && deviceSpecs.gpu?.detected) {
    if (requirements.minVRAM && deviceSpecs.gpu.vram) {
      if (deviceSpecs.gpu.vram < requirements.minVRAM) {
        errors.push(
          `Insufficient GPU memory: ${deviceSpecs.gpu.vram}GB VRAM, ${requirements.minVRAM}GB required`
        );
      }
    } else if (requirements.minVRAM && !deviceSpecs.gpu.vram) {
      warnings.push(
        `GPU detected but VRAM info unavailable. Model requires ${requirements.minVRAM}GB VRAM.`
      );
    }
  }

  // Check OS compatibility
  if (requirements.supportedOS && requirements.supportedOS.length > 0) {
    const platformMap: Record<string, string> = {
      win32: 'windows',
      darwin: 'macos',
      linux: 'linux',
      android: 'android',
    };
    const currentOS = platformMap[deviceSpecs.os.platform];

    if (currentOS && !requirements.supportedOS.includes(currentOS)) {
      errors.push(
        `OS not supported: This model requires ${requirements.supportedOS.join(' or ')}`
      );
    }
  }

  // Check architecture
  if (requirements.supportedArchitectures && requirements.supportedArchitectures.length > 0) {
    if (!requirements.supportedArchitectures.includes(deviceSpecs.os.arch)) {
      warnings.push(
        `Architecture ${deviceSpecs.os.arch} may not be optimized. Recommended: ${requirements.supportedArchitectures.join(', ')}`
      );
    }
  }

  // General recommendations
  if (deviceSpecs.cpu.cores < 4) {
    recommendations.push('Consider upgrading to a CPU with more cores for better performance');
  }

  if (!deviceSpecs.gpu?.detected && requirements.minRAM > 8) {
    recommendations.push('Large models run significantly faster with GPU acceleration');
  }

  const compatible = errors.length === 0;

  return {
    compatible,
    warnings,
    errors,
    recommendations,
    deviceSpecs,
    requirements,
  };
}

/**
 * Get a summary string for device specs
 */
export function getDeviceSummary(specs: DeviceSpecs): string {
  const parts: string[] = [];

  parts.push(`${specs.ram.totalGB}GB RAM`);
  parts.push(`${specs.cpu.cores} CPU cores`);

  if (specs.gpu?.detected) {
    if (specs.gpu.vram) {
      parts.push(`${specs.gpu.name} (${specs.gpu.vram}GB VRAM)`);
    } else {
      parts.push(specs.gpu.name || 'GPU detected');
    }
  } else {
    parts.push('No GPU');
  }

  parts.push(`${specs.disk.availableGB}GB available storage`);

  return parts.join(' • ');
}
