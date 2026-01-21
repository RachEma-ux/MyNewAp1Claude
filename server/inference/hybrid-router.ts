import { BaseProvider } from "../providers/base";
import { GenerationRequest, GenerationResponse, Token } from "../providers/types";
import { resourceManager } from "./resource-manager";
import type { RoutingProfile, ProviderCapability, ProviderPolicyTag } from "../../drizzle/schema";

/**
 * Hybrid Provider Router
 * Intelligently routes requests between local and cloud providers based on:
 * - Model availability
 * - Resource constraints
 * - Cost optimization
 * - Latency requirements
 */

export interface RoutingStrategy {
  type: "cost" | "latency" | "quality" | "availability" | "policy" | "custom";
  preferLocal?: boolean; // Prefer local models when available
  maxLocalLoad?: number; // Max concurrent local requests (0-1)
  maxCostPerRequest?: number; // Max cost in USD
  maxLatencyMs?: number; // Max acceptable latency
  customScore?: (provider: BaseProvider, request: GenerationRequest) => Promise<number>;

  // Policy-aware routing options
  policyConfig?: {
    workspaceProfile?: RoutingProfile;
    requiredCapabilities?: ProviderCapability[];
    requiredPolicyTags?: ProviderPolicyTag[];
    providerMetadata?: Map<number, {
      kind: 'local' | 'cloud' | 'hybrid';
      capabilities: ProviderCapability[];
      policyTags: ProviderPolicyTag[];
    }>;
  };
}

export interface RoutingDecision {
  provider: BaseProvider;
  reason: string;
  score: number;
  estimatedCost?: number;
  estimatedLatencyMs?: number;
}

export interface HybridConfig {
  localProviders: BaseProvider[];
  cloudProviders: BaseProvider[];
  strategy: RoutingStrategy;
  fallbackEnabled?: boolean;
}

class HybridProviderRouter {
  private config: HybridConfig | null = null;

  /**
   * Configure the hybrid router
   */
  public configure(config: HybridConfig) {
    this.config = config;
    console.log("[HybridRouter] Configured with:", {
      localProviders: config.localProviders.length,
      cloudProviders: config.cloudProviders.length,
      strategy: config.strategy.type,
    });
  }

  /**
   * Route a request to the best provider
   */
  public async route(request: GenerationRequest): Promise<RoutingDecision> {
    if (!this.config) {
      throw new Error("Hybrid router not configured");
    }

    const allProviders = [...this.config.localProviders, ...this.config.cloudProviders];
    if (allProviders.length === 0) {
      throw new Error("No providers available");
    }

    // Score each provider
    const scores = await Promise.all(
      allProviders.map(async (provider) => {
        const score = await this.scoreProvider(provider, request);
        return { provider, score };
      })
    );

    // Sort by score (higher is better)
    scores.sort((a, b) => b.score - a.score);

    const best = scores[0];
    if (!best || best.score <= 0) {
      throw new Error("No suitable provider found for request");
    }

    const isLocal = this.config.localProviders.includes(best.provider);
    const estimatedCost = isLocal ? 0 : this.estimateCost(best.provider, request);
    const estimatedLatencyMs = isLocal ? 500 : 2000; // Rough estimates

    return {
      provider: best.provider,
      reason: this.explainScore(best.score, isLocal),
      score: best.score,
      estimatedCost,
      estimatedLatencyMs,
    };
  }

  /**
   * Score a provider for a given request
   */
  private async scoreProvider(
    provider: BaseProvider,
    request: GenerationRequest
  ): Promise<number> {
    if (!this.config) return 0;

    const strategy = this.config.strategy;
    const isLocal = this.config.localProviders.includes(provider);

    // Check if provider is healthy
    const health = await provider.healthCheck();
    if (!health.healthy) {
      return 0; // Unhealthy providers get zero score
    }

    // Check if provider supports the requested model
    const capabilities = provider.getCapabilities();
    if (request.model && !capabilities.supportedModels.includes(request.model)) {
      return 0; // Provider doesn't support this model
    }

    // Base score
    let score = 50;

    // Apply strategy-specific scoring
    switch (strategy.type) {
      case "cost":
        score += this.scoreByCost(provider, request, isLocal);
        break;
      case "latency":
        score += this.scoreByLatency(provider, isLocal);
        break;
      case "quality":
        score += this.scoreByQuality(provider, request);
        break;
      case "availability":
        score += this.scoreByAvailability(provider, isLocal);
        break;
      case "policy":
        score += this.scoreByPolicy(provider, strategy.policyConfig, isLocal);
        break;
      case "custom":
        if (strategy.customScore) {
          score = await strategy.customScore(provider, request);
        }
        break;
    }

    // Apply local preference
    if (strategy.preferLocal && isLocal) {
      score += 20;
    }

    // Check resource constraints for local providers
    if (isLocal) {
      const allocation = resourceManager.getAllocation();
      const loadPercent = allocation.activeRequests / allocation.maxConcurrentRequests;
      
      if (strategy.maxLocalLoad && loadPercent > strategy.maxLocalLoad) {
        score -= 50; // Penalize if local is overloaded
      }
    }

    // Check cost constraint
    if (strategy.maxCostPerRequest) {
      const estimatedCost = this.estimateCost(provider, request);
      if (estimatedCost > strategy.maxCostPerRequest) {
        return 0; // Exceeds cost budget
      }
    }

    return Math.max(0, score);
  }

  /**
   * Score by cost (lower cost = higher score)
   */
  private scoreByCost(
    provider: BaseProvider,
    request: GenerationRequest,
    isLocal: boolean
  ): number {
    if (isLocal) {
      return 50; // Local is free
    }

    const cost = this.estimateCost(provider, request);
    
    // Score inversely proportional to cost
    // $0.001 = +40, $0.01 = +20, $0.1 = +0
    return Math.max(0, 40 - cost * 400);
  }

  /**
   * Score by latency (lower latency = higher score)
   */
  private scoreByLatency(_provider: BaseProvider, isLocal: boolean): number {
    // Local providers are typically faster
    return isLocal ? 40 : 20;
  }

  /**
   * Score by quality (better models = higher score)
   */
  private scoreByQuality(provider: BaseProvider, request: GenerationRequest): number {
    const model = request.model || "";
    
    // Tier 1: Best models
    if (model.includes("gpt-4") || model.includes("claude-3-opus") || model.includes("gemini-pro")) {
      return 50;
    }
    
    // Tier 2: Good models
    if (model.includes("gpt-3.5") || model.includes("claude-3-sonnet") || model.includes("gemini-flash")) {
      return 30;
    }
    
    // Tier 3: Basic models
    return 10;
  }

  /**
   * Score by availability (less loaded = higher score)
   */
  private scoreByAvailability(_provider: BaseProvider, isLocal: boolean): number {
    if (isLocal) {
      const allocation = resourceManager.getAllocation();
      const loadPercent = allocation.activeRequests / allocation.maxConcurrentRequests;
      return Math.max(0, 40 * (1 - loadPercent));
    }

    // Cloud providers assumed to have high availability
    return 35;
  }

  /**
   * Score by policy constraints
   * Evaluates provider against workspace routing profile and required capabilities/tags
   */
  private scoreByPolicy(
    provider: BaseProvider,
    policyConfig: RoutingStrategy['policyConfig'],
    isLocal: boolean
  ): number {
    if (!policyConfig) {
      return 30; // Default score when no policy
    }

    let score = 30;
    const metadata = policyConfig.providerMetadata?.get(provider.id);

    // 1. Check data sensitivity constraints
    const profile = policyConfig.workspaceProfile;
    if (profile?.dataSensitivity === 'HIGH') {
      if (isLocal || metadata?.policyTags?.includes('no_egress')) {
        score += 30; // Bonus for being safe for high sensitivity
      } else {
        return 0; // Disqualify cloud providers without no_egress
      }
    }

    // 2. Check route preference
    if (profile?.defaultRoute === 'LOCAL_ONLY' && !isLocal) {
      return 0; // Disqualify cloud providers
    }
    if (profile?.defaultRoute === 'LOCAL_ONLY' && isLocal) {
      score += 20;
    }

    // 3. Check required capabilities
    if (policyConfig.requiredCapabilities && metadata) {
      const hasAllCaps = policyConfig.requiredCapabilities.every(
        cap => metadata.capabilities?.includes(cap)
      );
      if (!hasAllCaps) {
        return 0; // Disqualify if missing required capabilities
      }
      score += 15; // Bonus for having all capabilities
    }

    // 4. Check required policy tags
    if (policyConfig.requiredPolicyTags && metadata) {
      const hasAllTags = policyConfig.requiredPolicyTags.every(
        tag => metadata.policyTags?.includes(tag)
      );
      if (!hasAllTags) {
        return 0; // Disqualify if missing required tags
      }
      score += 15;
    }

    // 5. Quality tier scoring
    if (profile?.qualityTier === 'FAST' && isLocal) {
      score += 10; // Local often faster
    } else if (profile?.qualityTier === 'BEST' && !isLocal) {
      score += 10; // Cloud often higher quality
    }

    // 6. Pinned provider bonus
    if (profile?.pinnedProviderId === provider.id) {
      score += 50; // Strong preference for pinned
    }

    return score;
  }

  /**
   * Estimate cost of a request
   */
  private estimateCost(provider: BaseProvider, request: GenerationRequest): number {
    const costProfile = provider.getCostPerToken();
    
    // Estimate token counts
    const promptTokens = this.estimateTokens(request.messages.map(m => m.content).join(" "));
    const completionTokens = request.maxTokens || 500;
    
    const inputCost = (promptTokens / 1000) * costProfile.inputCostPer1kTokens;
    const outputCost = (completionTokens / 1000) * costProfile.outputCostPer1kTokens;
    
    return inputCost + outputCost;
  }

  /**
   * Rough token estimation (4 chars ≈ 1 token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Explain the routing decision
   */
  private explainScore(score: number, isLocal: boolean): string {
    if (score >= 80) {
      return isLocal ? "Optimal local provider available" : "Best cloud provider for quality";
    } else if (score >= 60) {
      return isLocal ? "Good local provider" : "Cost-effective cloud provider";
    } else if (score >= 40) {
      return isLocal ? "Local provider under load" : "Acceptable cloud provider";
    } else {
      return "Fallback provider";
    }
  }

  /**
   * Generate with automatic routing
   */
  public async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const decision = await this.route(request);
    
    console.log("[HybridRouter] Routing to:", {
      provider: decision.provider.constructor.name,
      reason: decision.reason,
      score: decision.score,
    });

    try {
      return await decision.provider.generate(request);
    } catch (error) {
      // Fallback logic
      if (this.config?.fallbackEnabled) {
        console.warn("[HybridRouter] Primary provider failed, trying fallback...");
        return await this.generateWithFallback(request, decision.provider);
      }
      throw error;
    }
  }

  /**
   * Generate with streaming and automatic routing
   */
  public async *generateStream(request: GenerationRequest): AsyncGenerator<Token, void, unknown> {
    const decision = await this.route(request);
    
    console.log("[HybridRouter] Streaming via:", {
      provider: decision.provider.constructor.name,
      reason: decision.reason,
    });

    try {
      yield* decision.provider.generateStream(request);
    } catch (error) {
      // Fallback for streaming is complex, just throw for now
      throw error;
    }
  }

  /**
   * Try fallback providers
   */
  private async generateWithFallback(
    request: GenerationRequest,
    failedProvider: BaseProvider
  ): Promise<GenerationResponse> {
    if (!this.config) {
      throw new Error("Hybrid router not configured");
    }

    const allProviders = [...this.config.localProviders, ...this.config.cloudProviders];
    const fallbackProviders = allProviders.filter(p => p !== failedProvider);

    for (const provider of fallbackProviders) {
      try {
        const health = await provider.healthCheck();
        if (health.healthy) {
          console.log("[HybridRouter] Falling back to:", provider.constructor.name);
          return await provider.generate(request);
        }
      } catch (error) {
        console.warn("[HybridRouter] Fallback provider failed:", provider.constructor.name);
        continue;
      }
    }

    throw new Error("All providers failed");
  }

  /**
   * Get routing statistics
   */
  public getStatistics() {
    if (!this.config) {
      return null;
    }

    return {
      localProviders: this.config.localProviders.length,
      cloudProviders: this.config.cloudProviders.length,
      strategy: this.config.strategy.type,
      fallbackEnabled: this.config.fallbackEnabled,
    };
  }
}

// Singleton instance
export const hybridRouter = new HybridProviderRouter();
