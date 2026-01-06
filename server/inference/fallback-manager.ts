import { BaseProvider } from "../providers/base";
import { GenerationRequest, GenerationResponse, Token } from "../providers/types";

/**
 * Fallback Provider Manager
 * Automatically retries failed requests with fallback providers
 */

export interface FallbackConfig {
  maxRetries?: number;
  retryDelay?: number; // ms
  exponentialBackoff?: boolean;
  healthCheckBeforeRetry?: boolean;
}

export interface FallbackChain {
  primary: BaseProvider;
  fallbacks: BaseProvider[];
  config?: FallbackConfig;
}

export interface FallbackAttempt {
  provider: BaseProvider;
  attempt: number;
  success: boolean;
  error?: Error;
  latencyMs?: number;
}

export interface FallbackResult<T> {
  result: T;
  attempts: FallbackAttempt[];
  finalProvider: BaseProvider;
  totalLatencyMs: number;
}

class FallbackProviderManager {
  private defaultConfig: Required<FallbackConfig> = {
    maxRetries: 3,
    retryDelay: 1000,
    exponentialBackoff: true,
    healthCheckBeforeRetry: true,
  };

  /**
   * Execute a request with fallback chain
   */
  public async executeWithFallback<T>(
    chain: FallbackChain,
    executor: (provider: BaseProvider) => Promise<T>
  ): Promise<FallbackResult<T>> {
    const config = { ...this.defaultConfig, ...chain.config };
    const allProviders = [chain.primary, ...chain.fallbacks];
    const attempts: FallbackAttempt[] = [];
    const startTime = Date.now();

    for (let i = 0; i < allProviders.length; i++) {
      const provider = allProviders[i];
      const attemptStart = Date.now();

      try {
        // Health check before retry (skip for first attempt)
        if (i > 0 && config.healthCheckBeforeRetry) {
          const health = await provider.healthCheck();
          if (!health.healthy) {
            console.warn(
              `[FallbackManager] Skipping unhealthy provider: ${provider.constructor.name}`
            );
            attempts.push({
              provider,
              attempt: i + 1,
              success: false,
              error: new Error("Provider unhealthy"),
            });
            continue;
          }
        }

        // Execute request
        const result = await executor(provider);
        const latencyMs = Date.now() - attemptStart;

        attempts.push({
          provider,
          attempt: i + 1,
          success: true,
          latencyMs,
        });

        console.log(
          `[FallbackManager] Success with ${provider.constructor.name} (attempt ${i + 1}/${allProviders.length})`
        );

        return {
          result,
          attempts,
          finalProvider: provider,
          totalLatencyMs: Date.now() - startTime,
        };
      } catch (error) {
        const latencyMs = Date.now() - attemptStart;
        attempts.push({
          provider,
          attempt: i + 1,
          success: false,
          error: error as Error,
          latencyMs,
        });

        console.warn(
          `[FallbackManager] ${provider.constructor.name} failed (attempt ${i + 1}/${allProviders.length}):`,
          (error as Error).message
        );

        // If not the last provider, wait before retry
        if (i < allProviders.length - 1) {
          const delay = config.exponentialBackoff
            ? config.retryDelay * Math.pow(2, i)
            : config.retryDelay;
          
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All providers failed
    throw new Error(
      `All providers failed after ${attempts.length} attempts: ${attempts
        .map((a) => a.error?.message)
        .join(", ")}`
    );
  }

  /**
   * Generate with fallback
   */
  public async generate(
    chain: FallbackChain,
    request: GenerationRequest
  ): Promise<FallbackResult<GenerationResponse>> {
    return this.executeWithFallback(chain, (provider) =>
      provider.generate(request)
    );
  }

  /**
   * Generate stream with fallback (complex, tries each provider until one works)
   */
  public async *generateStream(
    chain: FallbackChain,
    request: GenerationRequest
  ): AsyncGenerator<Token, void, unknown> {
    const config = { ...this.defaultConfig, ...chain.config };
    const allProviders = [chain.primary, ...chain.fallbacks];

    for (let i = 0; i < allProviders.length; i++) {
      const provider = allProviders[i];

      try {
        // Health check before retry
        if (i > 0 && config.healthCheckBeforeRetry) {
          const health = await provider.healthCheck();
          if (!health.healthy) {
            console.warn(
              `[FallbackManager] Skipping unhealthy provider: ${provider.constructor.name}`
            );
            continue;
          }
        }

        console.log(
          `[FallbackManager] Streaming with ${provider.constructor.name} (attempt ${i + 1}/${allProviders.length})`
        );

        // Try to stream
        yield* provider.generateStream(request);
        return; // Success
      } catch (error) {
        console.warn(
          `[FallbackManager] ${provider.constructor.name} streaming failed (attempt ${i + 1}/${allProviders.length}):`,
          (error as Error).message
        );

        // If not the last provider, wait before retry
        if (i < allProviders.length - 1) {
          const delay = config.exponentialBackoff
            ? config.retryDelay * Math.pow(2, i)
            : config.retryDelay;
          
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error("All providers failed for streaming");
  }

  /**
   * Create a fallback chain from provider registry
   */
  public createChainFromProviders(
    providers: BaseProvider[],
    config?: FallbackConfig
  ): FallbackChain | null {
    if (providers.length === 0) {
      return null;
    }

    return {
      primary: providers[0],
      fallbacks: providers.slice(1),
      config,
    };
  }

  /**
   * Create a fallback chain with specific priority order
   */
  public createChainWithPriority(
    providers: BaseProvider[],
    priorityOrder: string[], // Provider class names in priority order
    config?: FallbackConfig
  ): FallbackChain | null {
    const sorted = providers.sort((a, b) => {
      const aIndex = priorityOrder.indexOf(a.constructor.name);
      const bIndex = priorityOrder.indexOf(b.constructor.name);
      
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    return this.createChainFromProviders(sorted, config);
  }

  /**
   * Test fallback chain
   */
  public async testChain(chain: FallbackChain): Promise<{
    primary: { healthy: boolean; latencyMs?: number };
    fallbacks: Array<{ provider: string; healthy: boolean; latencyMs?: number }>;
  }> {
    const results = {
      primary: { healthy: false, latencyMs: undefined as number | undefined },
      fallbacks: [] as Array<{ provider: string; healthy: boolean; latencyMs?: number }>,
    };

    // Test primary
    const primaryStart = Date.now();
    const primaryHealth = await chain.primary.healthCheck();
    results.primary = {
      healthy: primaryHealth.healthy,
      latencyMs: Date.now() - primaryStart,
    };

    // Test fallbacks
    for (const fallback of chain.fallbacks) {
      const fallbackStart = Date.now();
      const fallbackHealth = await fallback.healthCheck();
      results.fallbacks.push({
        provider: fallback.constructor.name,
        healthy: fallbackHealth.healthy,
        latencyMs: Date.now() - fallbackStart,
      });
    }

    return results;
  }
}

// Singleton instance
export const fallbackManager = new FallbackProviderManager();
