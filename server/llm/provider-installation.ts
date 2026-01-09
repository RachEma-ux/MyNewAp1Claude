/**
 * Provider Installation Detection & Management
 * Handles checking if local providers are installed and managing their models
 */

import * as providers from './providers';

export type InstallationStatus = 'installed' | 'not_installed' | 'checking' | 'error';

export interface InstallationCheckResult {
  status: InstallationStatus;
  version?: string;
  error?: string;
  installedModels?: InstalledModel[];
}

export interface InstalledModel {
  id: string;
  name: string;
  size: string;
  modified: string;
}

export interface ModelDownloadProgress {
  modelId: string;
  status: 'downloading' | 'completed' | 'failed';
  progress?: number;
  error?: string;
}

/**
 * Check if a provider is installed
 */
export async function checkProviderInstallation(
  providerId: string
): Promise<InstallationCheckResult> {
  const provider = providers.getProvider(providerId);

  if (!provider) {
    return {
      status: 'error',
      error: `Unknown provider: ${providerId}`,
    };
  }

  // If provider doesn't require installation, it's always "installed"
  if (!provider.installation || !provider.installation.required) {
    return {
      status: 'installed',
    };
  }

  // Check based on provider type
  switch (providerId) {
    case 'ollama':
      return await checkOllamaInstallation(provider.installation.detectionEndpoint);

    default:
      return {
        status: 'error',
        error: `Installation check not implemented for ${provider.name}`,
      };
  }
}

/**
 * Check if Ollama is installed
 */
async function checkOllamaInstallation(
  detectionEndpoint: string
): Promise<InstallationCheckResult> {
  try {
    const response = await fetch(detectionEndpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      return {
        status: 'not_installed',
        error: `Ollama server responded with status ${response.status}`,
      };
    }

    const data = await response.json();
    const models = data.models || [];

    const installedModels: InstalledModel[] = models.map((model: any) => ({
      id: model.name,
      name: model.name,
      size: formatBytes(model.size || 0),
      modified: model.modified_at || new Date().toISOString(),
    }));

    return {
      status: 'installed',
      installedModels,
    };
  } catch (error: any) {
    // Connection refused or timeout means Ollama is not running/installed
    if (error.name === 'AbortError' || error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
      return {
        status: 'not_installed',
        error: 'Ollama is not running or not installed',
      };
    }

    return {
      status: 'error',
      error: error.message,
    };
  }
}

/**
 * Get list of available models from provider library
 */
export async function getAvailableModels(
  providerId: string
): Promise<providers.ProviderModel[]> {
  const provider = providers.getProvider(providerId);

  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  // Return models from provider definition
  return provider.models || [];
}

/**
 * Get list of installed models for a local provider
 */
export async function getInstalledModels(
  providerId: string
): Promise<InstalledModel[]> {
  const installationCheck = await checkProviderInstallation(providerId);

  if (installationCheck.status !== 'installed') {
    return [];
  }

  return installationCheck.installedModels || [];
}

/**
 * Download a model for a local provider
 * Note: This returns the command to run, not actually executes it
 * For security reasons, we don't execute arbitrary commands server-side
 */
export async function downloadModel(
  providerId: string,
  modelId: string
): Promise<{ command: string; instructions: string }> {
  const provider = providers.getProvider(providerId);

  if (!provider || !provider.modelManagement?.enabled) {
    throw new Error(`Model management not available for ${providerId}`);
  }

  const downloadCommand = provider.modelManagement.downloadCommand?.(modelId);

  if (!downloadCommand) {
    throw new Error(`Download command not defined for ${provider.name}`);
  }

  switch (providerId) {
    case 'ollama':
      return {
        command: downloadCommand,
        instructions: `Run this command in your terminal:\n\n${downloadCommand}\n\nThe model will be downloaded and ready to use.`,
      };

    default:
      return {
        command: downloadCommand,
        instructions: `Run the following command to download the model:\n\n${downloadCommand}`,
      };
  }
}

/**
 * Remove a model from a local provider
 */
export async function removeModel(
  providerId: string,
  modelId: string
): Promise<{ command: string; instructions: string }> {
  const provider = providers.getProvider(providerId);

  if (!provider || !provider.modelManagement?.enabled) {
    throw new Error(`Model management not available for ${providerId}`);
  }

  const removeCommand = provider.modelManagement.removeCommand?.(modelId);

  if (!removeCommand) {
    throw new Error(`Remove command not defined for ${provider.name}`);
  }

  return {
    command: removeCommand,
    instructions: `Run this command in your terminal:\n\n${removeCommand}\n\nThe model will be removed from your system.`,
  };
}

/**
 * Get installation instructions for a provider
 */
export function getInstallationInstructions(
  providerId: string
): { instructions: string[]; downloadUrls: Record<string, string>; defaultPort?: number } {
  const provider = providers.getProvider(providerId);

  if (!provider || !provider.installation) {
    throw new Error(`Installation instructions not available for ${providerId}`);
  }

  return {
    instructions: provider.installation.instructions,
    downloadUrls: provider.installation.downloadUrls,
    defaultPort: provider.installation.defaultPort,
  };
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Detect user's operating system from user agent
 */
export function detectOS(userAgent?: string): 'windows' | 'macos' | 'linux' | 'unknown' {
  if (!userAgent) return 'unknown';

  const ua = userAgent.toLowerCase();

  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';

  return 'unknown';
}
