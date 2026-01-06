// Provider Hub - Provider Registry

import type { ILLMProvider } from './base';
import type { ProviderConfig, ProviderType } from './types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GoogleProvider } from './google';

/**
 * Central registry for managing all LLM providers
 */
export class ProviderRegistry {
  private providers: Map<number, ILLMProvider> = new Map();
  private providersByType: Map<ProviderType, Set<number>> = new Map();

  /**
   * Register a new provider
   */
  async registerProvider(config: ProviderConfig): Promise<ILLMProvider> {
    // Check if provider already exists
    if (this.providers.has(config.id)) {
      throw new Error(`Provider with ID ${config.id} is already registered`);
    }

    // Create provider instance based on type
    const provider = await this.createProvider(config);

    // Initialize the provider
    await provider.initialize();

    // Store in registry
    this.providers.set(config.id, provider);

    // Index by type
    if (!this.providersByType.has(config.type)) {
      this.providersByType.set(config.type, new Set());
    }
    this.providersByType.get(config.type)!.add(config.id);

    console.log(`[ProviderRegistry] Registered provider: ${config.name} (${config.type})`);
    return provider;
  }

  /**
   * Unregister a provider
   */
  async unregisterProvider(providerId: number): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return;
    }

    // Cleanup provider resources
    await provider.cleanup();

    // Remove from indexes
    this.providers.delete(providerId);
    const typeSet = this.providersByType.get(provider.type);
    if (typeSet) {
      typeSet.delete(providerId);
      if (typeSet.size === 0) {
        this.providersByType.delete(provider.type);
      }
    }

    console.log(`[ProviderRegistry] Unregistered provider: ${provider.name}`);
  }

  /**
   * Get a provider by ID
   */
  getProvider(providerId: number): ILLMProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get all providers
   */
  getAllProviders(): ILLMProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get providers by type
   */
  getProvidersByType(type: ProviderType): ILLMProvider[] {
    const ids = this.providersByType.get(type);
    if (!ids) {
      return [];
    }
    return Array.from(ids)
      .map(id => this.providers.get(id))
      .filter((p): p is ILLMProvider => p !== undefined);
  }

  /**
   * Update provider configuration
   */
  async updateProviderConfig(providerId: number, config: Record<string, unknown>): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider with ID ${providerId} not found`);
    }

    await provider.updateConfig(config);
    console.log(`[ProviderRegistry] Updated config for provider: ${provider.name}`);
  }

  /**
   * Check health of all providers
   */
  async healthCheckAll(): Promise<Map<number, boolean>> {
    const results = new Map<number, boolean>();
    const entries = Array.from(this.providers.entries());
    
    for (const [id, provider] of entries) {
      try {
        const health = await provider.healthCheck();
        results.set(id, health.healthy);
      } catch (error) {
        console.error(`[ProviderRegistry] Health check failed for provider ${id}:`, error);
        results.set(id, false);
      }
    }

    return results;
  }

  /**
   * Cleanup all providers
   */
  async cleanupAll(): Promise<void> {
    const providers = Array.from(this.providers.values());
    const promises = providers.map(p => p.cleanup());
    await Promise.all(promises);
    this.providers.clear();
    this.providersByType.clear();
    console.log('[ProviderRegistry] Cleaned up all providers');
  }

  /**
   * Get registry statistics
   */
  getStats() {
    return {
      totalProviders: this.providers.size,
      providersByType: Object.fromEntries(
        Array.from(this.providersByType.entries()).map(([type, ids]) => [type, ids.size])
      ),
    };
  }

  /**
   * Create a provider instance based on configuration
   */
  private async createProvider(config: ProviderConfig): Promise<ILLMProvider> {
    switch (config.type) {
      case 'openai':
        return new OpenAIProvider(config);
      case 'anthropic':
        return new AnthropicProvider(config);
      case 'google':
        return new GoogleProvider(config);
      case 'local-ollama': {
        const { OllamaProvider } = await import('./ollama');
        return new OllamaProvider(config);
      }
      case 'local-llamacpp':
        throw new Error(`Local providers not yet implemented: ${config.type}`);
      case 'custom':
        throw new Error('Custom providers not yet implemented');
      default:
        throw new Error(`Unknown provider type: ${config.type}`);
    }
  }
}

// Global singleton instance
let globalRegistry: ProviderRegistry | null = null;

/**
 * Get the global provider registry instance
 */
export function getProviderRegistry(): ProviderRegistry {
  if (!globalRegistry) {
    globalRegistry = new ProviderRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global registry (useful for testing)
 */
export async function resetProviderRegistry(): Promise<void> {
  if (globalRegistry) {
    await globalRegistry.cleanupAll();
    globalRegistry = null;
  }
}
