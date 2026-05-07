/**
 * Provider Router — selection-only.
 *
 * Resolves a routing plan for a request: picks a primary provider plus an
 * ordered fallback chain via the routing-rules engine, evaluated against
 * the workspace's routing profile and the request's task hints.
 *
 * Execution is intentionally NOT this layer's concern. Callers feed
 * `resolvePlan`'s output into the appropriate execution surface — for
 * Phase 29+ that means `gatewayCall(modelAccess.stream|execute)` via the
 * platform module gateway. PMB Phase 29.3 excised the previous
 * `execute()` and `executeStream()` methods (zero live callers per the
 * call-graph walk in `PROVIDER_ROUTER_MIGRATION_DECISION.md` D-PR-1)
 * and removed the now-orphan `getProviderRegistry()` import.
 *
 * Surface:
 *   - `resolvePlan(request)` — build a `RoutingPlan` with primary +
 *     fallback chain + audit reasons; no upstream HTTP.
 */

import { v4 as uuidv4 } from "uuid";
import { routingRulesEngine, type TaskHints, type ProviderRoutingInfo, type RoutingEvaluation } from "./routing-rules";
import type { Message } from "../providers/types";
import type { RoutingProfile, ProviderCapability } from "../../drizzle/schema";
import * as providerDb from "../providers/db";
import { getDb } from "../db";
import { workspaces } from "../../drizzle/schema";
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

/**
 * Provider Router — policy-aware selection. Execution is delegated to
 * Model Access (Phase 29.3 excision; see file-level JSDoc).
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
   * Get workspace routing profile from database
   */
  private async getWorkspaceProfile(workspaceId: number): Promise<RoutingProfile | null> {
    try {
      const db = getDb();
      if (!db) return null;

      const result = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      return (result[0] as Record<string, unknown>)?.routingProfile as RoutingProfile || null;
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
      kind: p.kind || 'cloud',
      capabilities: p.capabilities || [],
      policyTags: p.policyTags || [],
      limits: p.limits || null,
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

}

// Singleton instance
export const providerRouter = new ProviderRouter();
