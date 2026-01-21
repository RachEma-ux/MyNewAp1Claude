/**
 * Provider Router
 *
 * Unified routing system that integrates with the existing Providers infrastructure.
 * Enables:
 * - Local-first execution when possible
 * - Cloud fallback when allowed
 * - Policy-based constraint enforcement
 * - Workspace-level routing profiles
 * - Full audit trail for every routing decision
 */

import { v4 as uuidv4 } from "uuid";
import { hybridRouter, type RoutingDecision } from "./hybrid-router";
import { fallbackManager, type FallbackChain, type FallbackResult } from "./fallback-manager";
import { routingRulesEngine, type TaskHints, type ProviderRoutingInfo, type RoutingEvaluation } from "./routing-rules";
import { getProviderRegistry } from "../providers/registry";
import type { Message, GenerationResponse, Token } from "../providers/types";
import type { RoutingProfile, ProviderCapability } from "../../drizzle/schema";
import * as providerDb from "../providers/db";
import { getDb } from "../db";
import { routingAuditLogs, workspaces } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// Request interface for routing
export interface RoutingRequest {
  messages: Message[];
  model?: string;
  workspaceId: number;
  temperature?: number;
  maxTokens?: number;
  taskHints?: TaskHints;
}

// Routing plan with fallback chain
export interface RoutingPlan {
  requestId: string;
  primaryProviderId: number;
  primaryProviderName: string;
  fallbackChain: number[];
  constraints: {
    timeoutMs: number;
    streaming: boolean;
    maxTokens?: number;
  };
  auditReasons: string[];
  evaluations: RoutingEvaluation[];
}

// Result of routing execution
export interface RoutingResult {
  response: GenerationResponse;
  plan: RoutingPlan;
  actualProviderId: number;
  routeTaken: string;
  latencyMs: number;
}

// Streaming result
export interface StreamingRoutingResult {
  stream: AsyncGenerator<Token, void, unknown>;
  plan: RoutingPlan;
  actualProviderId: number;
}

/**
 * Provider Router - Policy-aware request routing
 */
class ProviderRouter {
  /**
   * Resolve a routing plan for a request without executing it
   */
  async resolvePlan(request: RoutingRequest): Promise<RoutingPlan> {
    const requestId = uuidv4();

    // 1. Get workspace routing profile
    const workspaceProfile = await this.getWorkspaceProfile(request.workspaceId);

    // 2. Get all providers with routing metadata
    const providers = await this.getProvidersWithMetadata();

    // 3. Determine required capabilities from request
    const requiredCapabilities = this.inferRequiredCapabilities(request);
    const taskHints: TaskHints = {
      ...request.taskHints,
      requiredCapabilities,
    };

    // 4. Evaluate all providers against rules
    const evaluations = routingRulesEngine.evaluateProviders(
      providers,
      workspaceProfile,
      taskHints
    );

    // 5. Build fallback chain
    const maxHops = workspaceProfile?.fallback?.maxHops ?? 3;
    const fallbackEnabled = workspaceProfile?.fallback?.enabled ?? true;
    const fallbackChain = fallbackEnabled
      ? routingRulesEngine.buildFallbackChain(evaluations, maxHops)
      : [];

    // 6. Select primary provider
    const eligibleProviders = evaluations.filter(e => e.eligible);
    if (eligibleProviders.length === 0) {
      throw new Error("No eligible providers found for request");
    }

    const primary = eligibleProviders[0];

    // 7. Collect audit reasons
    const auditReasons = primary.reasons;

    return {
      requestId,
      primaryProviderId: primary.providerId,
      primaryProviderName: primary.providerName,
      fallbackChain: fallbackChain.slice(1), // Exclude primary
      constraints: {
        timeoutMs: request.taskHints?.maxLatencyMs || 30000,
        streaming: true,
        maxTokens: request.maxTokens,
      },
      auditReasons,
      evaluations,
    };
  }

  /**
   * Execute a request with routing and fallback
   */
  async execute(request: RoutingRequest): Promise<RoutingResult> {
    const startTime = Date.now();
    const plan = await this.resolvePlan(request);

    // Build provider chain for fallback manager
    const registry = getProviderRegistry();
    const providerIds = [plan.primaryProviderId, ...plan.fallbackChain];
    const providers = providerIds
      .map(id => registry.getProvider(id))
      .filter((p): p is NonNullable<typeof p> => p !== null && p !== undefined);

    if (providers.length === 0) {
      throw new Error("No registered providers available for execution");
    }

    // Create fallback chain
    const chain: FallbackChain = {
      primary: providers[0],
      fallbacks: providers.slice(1),
      config: {
        maxRetries: plan.fallbackChain.length,
        healthCheckBeforeRetry: true,
      },
    };

    // Execute with fallback
    const result: FallbackResult<GenerationResponse> = await fallbackManager.executeWithFallback(
      chain,
      (provider) => provider.generate({
        messages: request.messages,
        model: request.model,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        workspaceId: request.workspaceId,
      })
    );

    const latencyMs = Date.now() - startTime;

    // Determine which provider was actually used
    const actualProviderId = result.finalProvider.id;
    const routeTaken = this.determineRouteTaken(plan, actualProviderId);

    // Log audit record
    await this.logAudit({
      requestId: plan.requestId,
      workspaceId: request.workspaceId,
      primaryProviderId: plan.primaryProviderId,
      actualProviderId,
      routeTaken,
      auditReasons: plan.auditReasons,
      latencyMs,
      tokensUsed: result.result.usage?.totalTokens,
      estimatedCost: result.result.cost?.toString(),
    });

    return {
      response: result.result,
      plan,
      actualProviderId,
      routeTaken,
      latencyMs,
    };
  }

  /**
   * Execute streaming request with routing
   */
  async *executeStream(request: RoutingRequest): AsyncGenerator<Token, RoutingResult, unknown> {
    const startTime = Date.now();
    const plan = await this.resolvePlan(request);

    // Get the primary provider
    const registry = getProviderRegistry();
    const provider = registry.getProvider(plan.primaryProviderId);

    if (!provider) {
      throw new Error(`Primary provider ${plan.primaryProviderId} not found in registry`);
    }

    let tokenCount = 0;
    let fullContent = '';

    try {
      // Stream from primary provider
      for await (const token of provider.generateStream({
        messages: request.messages,
        model: request.model,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        workspaceId: request.workspaceId,
      })) {
        if (!token.isComplete) {
          tokenCount++;
          fullContent += token.content;
        }
        yield token;
      }

      const latencyMs = Date.now() - startTime;

      // Log audit record
      await this.logAudit({
        requestId: plan.requestId,
        workspaceId: request.workspaceId,
        primaryProviderId: plan.primaryProviderId,
        actualProviderId: plan.primaryProviderId,
        routeTaken: 'PRIMARY',
        auditReasons: plan.auditReasons,
        latencyMs,
        tokensUsed: tokenCount,
      });

      // Return result info
      return {
        response: {
          id: plan.requestId,
          content: fullContent,
          model: request.model || 'unknown',
          usage: {
            promptTokens: 0,
            completionTokens: tokenCount,
            totalTokens: tokenCount,
          },
          finishReason: 'stop',
          latencyMs,
        },
        plan,
        actualProviderId: plan.primaryProviderId,
        routeTaken: 'PRIMARY',
        latencyMs,
      };
    } catch (error) {
      // Try fallback providers
      for (let i = 0; i < plan.fallbackChain.length; i++) {
        const fallbackId = plan.fallbackChain[i];
        const fallbackProvider = registry.getProvider(fallbackId);

        if (!fallbackProvider) continue;

        try {
          const health = await fallbackProvider.healthCheck();
          if (!health.healthy) continue;

          console.log(`[ProviderRouter] Falling back to provider ${fallbackId}`);

          tokenCount = 0;
          fullContent = '';

          for await (const token of fallbackProvider.generateStream({
            messages: request.messages,
            model: request.model,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            workspaceId: request.workspaceId,
          })) {
            if (!token.isComplete) {
              tokenCount++;
              fullContent += token.content;
            }
            yield token;
          }

          const latencyMs = Date.now() - startTime;
          const routeTaken = `FALLBACK_${i + 1}`;

          await this.logAudit({
            requestId: plan.requestId,
            workspaceId: request.workspaceId,
            primaryProviderId: plan.primaryProviderId,
            actualProviderId: fallbackId,
            routeTaken,
            auditReasons: [...plan.auditReasons, `Primary failed, used fallback ${i + 1}`],
            latencyMs,
            tokensUsed: tokenCount,
          });

          return {
            response: {
              id: plan.requestId,
              content: fullContent,
              model: request.model || 'unknown',
              usage: {
                promptTokens: 0,
                completionTokens: tokenCount,
                totalTokens: tokenCount,
              },
              finishReason: 'stop',
              latencyMs,
            },
            plan,
            actualProviderId: fallbackId,
            routeTaken,
            latencyMs,
          };
        } catch (fallbackError) {
          console.warn(`[ProviderRouter] Fallback ${i + 1} failed:`, fallbackError);
          continue;
        }
      }

      // All providers failed
      throw error;
    }
  }

  /**
   * Get workspace routing profile from database
   */
  private async getWorkspaceProfile(workspaceId: number): Promise<RoutingProfile | null> {
    try {
      const db = getDb();
      if (!db) return null;

      const result = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      return (result[0] as any)?.routingProfile || null;
    } catch {
      return null;
    }
  }

  /**
   * Get all providers with routing metadata
   */
  private async getProvidersWithMetadata(): Promise<ProviderRoutingInfo[]> {
    const providers = await providerDb.getAllProviders();

    return providers.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      enabled: p.enabled ?? true,
      priority: p.priority ?? 50,
      kind: (p as any).kind || 'cloud',
      capabilities: (p as any).capabilities || [],
      policyTags: (p as any).policyTags || [],
      limits: (p as any).limits || null,
      costPer1kTokens: p.costPer1kTokens,
    }));
  }

  /**
   * Infer required capabilities from request
   */
  private inferRequiredCapabilities(request: RoutingRequest): ProviderCapability[] {
    const capabilities: ProviderCapability[] = ['chat'];

    // Check for streaming (always required for now)
    capabilities.push('streaming');

    // Check for vision content in messages
    const hasVision = request.messages.some(m =>
      typeof m.content === 'object' || m.content.includes('[image]')
    );
    if (hasVision) {
      capabilities.push('vision');
    }

    return capabilities;
  }

  /**
   * Determine the route taken based on actual vs planned provider
   */
  private determineRouteTaken(plan: RoutingPlan, actualProviderId: number): string {
    if (actualProviderId === plan.primaryProviderId) {
      return 'PRIMARY';
    }

    const fallbackIndex = plan.fallbackChain.indexOf(actualProviderId);
    if (fallbackIndex >= 0) {
      return `FALLBACK_${fallbackIndex + 1}`;
    }

    return 'UNKNOWN';
  }

  /**
   * Log routing decision to audit table
   */
  private async logAudit(audit: {
    requestId: string;
    workspaceId: number;
    primaryProviderId: number;
    actualProviderId: number;
    routeTaken: string;
    auditReasons: string[];
    latencyMs: number;
    tokensUsed?: number;
    estimatedCost?: string;
  }): Promise<void> {
    try {
      const db = getDb();
      if (!db) return;

      await db.insert(routingAuditLogs).values({
        workspaceId: audit.workspaceId,
        requestId: audit.requestId,
        primaryProviderId: audit.primaryProviderId,
        actualProviderId: audit.actualProviderId,
        routeTaken: audit.routeTaken,
        auditReasons: audit.auditReasons,
        latencyMs: audit.latencyMs,
        tokensUsed: audit.tokensUsed,
        estimatedCost: audit.estimatedCost,
      });
    } catch (error) {
      // Don't fail the request if audit logging fails
      console.error('[ProviderRouter] Failed to log audit:', error);
    }
  }
}

// Singleton instance
export const providerRouter = new ProviderRouter();
