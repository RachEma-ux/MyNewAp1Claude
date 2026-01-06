// Provider Hub - Base Provider Interface

import type {
  GenerationRequest,
  GenerationResponse,
  Token,
  EmbedOptions,
  Embedding,
  ProviderCapabilities,
  CostProfile,
  LatencyProfile,
  HealthStatus,
  ProviderConfig,
  ProviderType,
} from './types';

/**
 * Base interface that all LLM providers must implement
 */
export interface ILLMProvider {
  // Identification
  readonly id: number;
  readonly name: string;
  readonly type: ProviderType;
  
  // Core generation methods
  generate(request: GenerationRequest): Promise<GenerationResponse>;
  generateStream(request: GenerationRequest): AsyncGenerator<Token, void, unknown>;
  
  // Embedding generation
  embed(texts: string[], options?: EmbedOptions): Promise<Embedding[]>;
  
  // Provider metadata
  getCapabilities(): ProviderCapabilities;
  getCostPerToken(): CostProfile;
  getLatencyProfile(): LatencyProfile;
  
  // Lifecycle management
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  
  // Configuration
  updateConfig(config: Record<string, unknown>): Promise<void>;
}

/**
 * Abstract base class with common provider functionality
 */
export abstract class BaseProvider implements ILLMProvider {
  protected config: ProviderConfig;
  protected initialized: boolean = false;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  get id(): number {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  get type(): ProviderType {
    return this.config.type;
  }

  abstract generate(request: GenerationRequest): Promise<GenerationResponse>;
  abstract generateStream(request: GenerationRequest): AsyncGenerator<Token, void, unknown>;
  abstract embed(texts: string[], options?: EmbedOptions): Promise<Embedding[]>;
  abstract getCapabilities(): ProviderCapabilities;
  abstract getCostPerToken(): CostProfile;
  
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.doInitialize();
    this.initialized = true;
  }

  protected abstract doInitialize(): Promise<void>;

  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    await this.doCleanup();
    this.initialized = false;
  }

  protected abstract doCleanup(): Promise<void>;

  async healthCheck(): Promise<HealthStatus> {
    try {
      if (!this.initialized) {
        return {
          healthy: false,
          message: 'Provider not initialized',
          lastChecked: new Date(),
        };
      }

      const isHealthy = await this.doHealthCheck();
      return {
        healthy: isHealthy,
        message: isHealthy ? 'Provider is healthy' : 'Provider health check failed',
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date(),
      };
    }
  }

  protected abstract doHealthCheck(): Promise<boolean>;

  async updateConfig(config: Record<string, unknown>): Promise<void> {
    this.config.config = { ...this.config.config, ...config };
  }

  getLatencyProfile(): LatencyProfile {
    // Default implementation - can be overridden
    return {
      averageLatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      tokensPerSecond: 0,
    };
  }

  protected getConfigValue<T>(key: string, defaultValue: T): T {
    return (this.config.config[key] as T) ?? defaultValue;
  }

  protected requireConfigValue<T>(key: string): T {
    const value = this.config.config[key];
    if (value === undefined || value === null) {
      throw new Error(`Required configuration key "${key}" is missing for provider ${this.name}`);
    }
    return value as T;
  }
}
