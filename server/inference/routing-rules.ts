/**
 * Routing Rules Engine
 *
 * Implements the constraint stack for provider routing:
 * 1. Hard constraints (dataSensitivity HIGH → only no_egress providers)
 * 2. Capability constraints (needs tools → only providers with tools)
 * 3. Quality/latency preferences
 * 4. Cost/quota filtering
 * 5. Fallback chain construction
 */

import type { ProviderCapability, ProviderPolicyTag, ProviderKind, ProviderLimits, RoutingProfile } from "../../drizzle/schema";

// Provider routing metadata from database
export interface ProviderRoutingInfo {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  priority: number;
  kind: ProviderKind;
  capabilities: ProviderCapability[];
  policyTags: ProviderPolicyTag[];
  limits: ProviderLimits | null;
  costPer1kTokens: string | null;
}

// Task hints from the request
export interface TaskHints {
  mustStayLocal?: boolean;
  maxLatencyMs?: number;
  budgetCeiling?: number;
  qualityTier?: 'FAST' | 'BALANCED' | 'BEST';
  requiredCapabilities?: ProviderCapability[];
}

// Rule evaluation result
export interface RuleResult {
  eligible: boolean;
  score: number;
  reason: string;
}

// Complete routing evaluation
export interface RoutingEvaluation {
  providerId: number;
  providerName: string;
  eligible: boolean;
  totalScore: number;
  reasons: string[];
  ruleResults: Record<string, RuleResult>;
}

/**
 * Routing Rules Engine
 * Evaluates providers against a constraint stack
 */
export class RoutingRulesEngine {
  /**
   * Evaluate all providers and return sorted, eligible providers with scores
   */
  evaluateProviders(
    providers: ProviderRoutingInfo[],
    workspaceProfile: RoutingProfile | null,
    taskHints: TaskHints = {}
  ): RoutingEvaluation[] {
    const evaluations = providers.map(provider =>
      this.evaluateProvider(provider, workspaceProfile, taskHints)
    );

    // Sort by eligibility (eligible first), then by score (higher first)
    return evaluations.sort((a, b) => {
      if (a.eligible !== b.eligible) {
        return a.eligible ? -1 : 1;
      }
      return b.totalScore - a.totalScore;
    });
  }

  /**
   * Evaluate a single provider against all rules
   */
  evaluateProvider(
    provider: ProviderRoutingInfo,
    workspaceProfile: RoutingProfile | null,
    taskHints: TaskHints
  ): RoutingEvaluation {
    const ruleResults: Record<string, RuleResult> = {};
    const reasons: string[] = [];

    // Rule 1: Provider must be enabled
    ruleResults.enabled = this.checkEnabled(provider);
    if (!ruleResults.enabled.eligible) {
      reasons.push(ruleResults.enabled.reason);
    }

    // Rule 2: Hard data sensitivity constraint
    ruleResults.dataSensitivity = this.checkDataSensitivity(provider, workspaceProfile);
    if (!ruleResults.dataSensitivity.eligible) {
      reasons.push(ruleResults.dataSensitivity.reason);
    }

    // Rule 3: Route preference (LOCAL_ONLY, CLOUD_ALLOWED, AUTO)
    ruleResults.routePreference = this.checkRoutePreference(provider, workspaceProfile, taskHints);
    if (!ruleResults.routePreference.eligible) {
      reasons.push(ruleResults.routePreference.reason);
    }

    // Rule 4: Required capabilities
    ruleResults.capabilities = this.checkCapabilities(provider, taskHints);
    if (!ruleResults.capabilities.eligible) {
      reasons.push(ruleResults.capabilities.reason);
    }

    // Rule 5: Budget constraint
    ruleResults.budget = this.checkBudget(provider, taskHints);
    if (!ruleResults.budget.eligible) {
      reasons.push(ruleResults.budget.reason);
    }

    // Rule 6: Quality tier scoring (non-blocking)
    ruleResults.qualityTier = this.scoreQualityTier(provider, workspaceProfile, taskHints);
    if (ruleResults.qualityTier.score > 0) {
      reasons.push(ruleResults.qualityTier.reason);
    }

    // Rule 7: Pinned provider bonus
    ruleResults.pinnedProvider = this.checkPinnedProvider(provider, workspaceProfile);
    if (ruleResults.pinnedProvider.score > 0) {
      reasons.push(ruleResults.pinnedProvider.reason);
    }

    // Rule 8: Priority scoring
    ruleResults.priority = this.scorePriority(provider);
    reasons.push(ruleResults.priority.reason);

    // Calculate overall eligibility (all blocking rules must pass)
    const blockingRules = ['enabled', 'dataSensitivity', 'routePreference', 'capabilities', 'budget'];
    const eligible = blockingRules.every(rule => ruleResults[rule]?.eligible ?? true);

    // Calculate total score
    const totalScore = Object.values(ruleResults).reduce((sum, result) => sum + result.score, 0);

    return {
      providerId: provider.id,
      providerName: provider.name,
      eligible,
      totalScore: eligible ? totalScore : 0,
      reasons: eligible ? reasons : reasons.filter(r => r.includes('blocked') || r.includes('ineligible')),
      ruleResults,
    };
  }

  /**
   * Rule 1: Check if provider is enabled
   */
  private checkEnabled(provider: ProviderRoutingInfo): RuleResult {
    return {
      eligible: provider.enabled,
      score: provider.enabled ? 0 : -1000,
      reason: provider.enabled ? "Provider enabled" : "Provider disabled - ineligible",
    };
  }

  /**
   * Rule 2: Data sensitivity constraint
   * HIGH sensitivity → only providers with 'no_egress' policy tag
   */
  private checkDataSensitivity(
    provider: ProviderRoutingInfo,
    profile: RoutingProfile | null
  ): RuleResult {
    if (!profile || profile.dataSensitivity !== 'HIGH') {
      return { eligible: true, score: 0, reason: "No data sensitivity restriction" };
    }

    const hasNoEgress = provider.policyTags?.includes('no_egress') ?? false;

    if (hasNoEgress) {
      return { eligible: true, score: 20, reason: "Provider has no_egress tag for HIGH sensitivity data" };
    }

    // For HIGH sensitivity, cloud providers without no_egress are blocked
    if (provider.kind === 'cloud') {
      return {
        eligible: false,
        score: -1000,
        reason: "Cloud provider blocked - HIGH data sensitivity requires no_egress policy"
      };
    }

    return { eligible: true, score: 10, reason: "Local provider allowed for HIGH sensitivity" };
  }

  /**
   * Rule 3: Route preference (LOCAL_ONLY, CLOUD_ALLOWED, AUTO)
   */
  private checkRoutePreference(
    provider: ProviderRoutingInfo,
    profile: RoutingProfile | null,
    taskHints: TaskHints
  ): RuleResult {
    // Task hint takes precedence
    if (taskHints.mustStayLocal && provider.kind === 'cloud') {
      return { eligible: false, score: -1000, reason: "Cloud provider blocked - task requires local execution" };
    }

    if (!profile) {
      return { eligible: true, score: 0, reason: "No routing profile - all providers allowed" };
    }

    switch (profile.defaultRoute) {
      case 'LOCAL_ONLY':
        if (provider.kind === 'cloud') {
          return { eligible: false, score: -1000, reason: "Cloud provider blocked - workspace uses LOCAL_ONLY routing" };
        }
        return { eligible: true, score: 30, reason: "Local provider matches LOCAL_ONLY preference" };

      case 'CLOUD_ALLOWED':
        // All providers allowed, but prefer local
        const localBonus = provider.kind === 'local' ? 15 : 0;
        return { eligible: true, score: localBonus, reason: provider.kind === 'local' ? "Local provider preferred" : "Cloud provider allowed" };

      case 'AUTO':
      default:
        // No preference
        return { eligible: true, score: 0, reason: "AUTO routing - all providers eligible" };
    }
  }

  /**
   * Rule 4: Required capabilities
   */
  private checkCapabilities(
    provider: ProviderRoutingInfo,
    taskHints: TaskHints
  ): RuleResult {
    const required = taskHints.requiredCapabilities || [];
    if (required.length === 0) {
      return { eligible: true, score: 0, reason: "No specific capabilities required" };
    }

    const providerCaps = provider.capabilities || [];
    const missing = required.filter(cap => !providerCaps.includes(cap));

    if (missing.length > 0) {
      return {
        eligible: false,
        score: -1000,
        reason: `Missing required capabilities: ${missing.join(', ')}`
      };
    }

    // Bonus for having extra capabilities
    const extraCaps = providerCaps.filter(cap => !required.includes(cap)).length;
    return {
      eligible: true,
      score: 10 + extraCaps * 2,
      reason: `Has all required capabilities (${required.join(', ')})`
    };
  }

  /**
   * Rule 5: Budget constraint
   */
  private checkBudget(
    provider: ProviderRoutingInfo,
    taskHints: TaskHints
  ): RuleResult {
    if (!taskHints.budgetCeiling) {
      return { eligible: true, score: 0, reason: "No budget ceiling set" };
    }

    const costTier = provider.limits?.costTier;
    const costMap: Record<string, number> = { free: 0, low: 0.01, medium: 0.05, high: 0.20 };
    const estimatedCost = costMap[costTier || 'medium'] || 0.05;

    if (estimatedCost > taskHints.budgetCeiling) {
      return {
        eligible: false,
        score: -1000,
        reason: `Provider cost tier (${costTier}) exceeds budget ceiling`
      };
    }

    // Bonus for being under budget
    const savings = taskHints.budgetCeiling - estimatedCost;
    return {
      eligible: true,
      score: Math.min(savings * 100, 20),
      reason: `Within budget (tier: ${costTier || 'unknown'})`
    };
  }

  /**
   * Rule 6: Quality tier scoring
   */
  private scoreQualityTier(
    provider: ProviderRoutingInfo,
    profile: RoutingProfile | null,
    taskHints: TaskHints
  ): RuleResult {
    const qualityTier = taskHints.qualityTier || profile?.qualityTier || 'BALANCED';
    const costTier = provider.limits?.costTier || 'medium';

    switch (qualityTier) {
      case 'FAST':
        // Prefer cheaper, faster providers
        if (costTier === 'free' || costTier === 'low') {
          return { eligible: true, score: 25, reason: "Low-cost provider matches FAST quality tier" };
        }
        return { eligible: true, score: 5, reason: "Higher-cost provider deprioritized for FAST tier" };

      case 'BEST':
        // Prefer higher-tier providers
        if (costTier === 'high' || costTier === 'medium') {
          return { eligible: true, score: 25, reason: "Premium provider matches BEST quality tier" };
        }
        return { eligible: true, score: 5, reason: "Lower-tier provider deprioritized for BEST tier" };

      case 'BALANCED':
      default:
        // Medium preference
        if (costTier === 'medium' || costTier === 'low') {
          return { eligible: true, score: 15, reason: "Balanced cost-quality provider" };
        }
        return { eligible: true, score: 10, reason: "Provider acceptable for BALANCED tier" };
    }
  }

  /**
   * Rule 7: Pinned provider bonus
   */
  private checkPinnedProvider(
    provider: ProviderRoutingInfo,
    profile: RoutingProfile | null
  ): RuleResult {
    if (profile?.pinnedProviderId === provider.id) {
      return { eligible: true, score: 100, reason: "Pinned provider - highest priority" };
    }
    return { eligible: true, score: 0, reason: "Not pinned" };
  }

  /**
   * Rule 8: Priority scoring
   */
  private scorePriority(provider: ProviderRoutingInfo): RuleResult {
    // Priority is 0-100, convert to score component
    const score = provider.priority * 0.5;
    return { eligible: true, score, reason: `Priority score: ${provider.priority}` };
  }

  /**
   * Build a fallback chain from evaluated providers
   */
  buildFallbackChain(
    evaluations: RoutingEvaluation[],
    maxHops: number = 3
  ): number[] {
    const eligible = evaluations.filter(e => e.eligible);
    return eligible.slice(0, maxHops + 1).map(e => e.providerId);
  }
}

// Singleton instance
export const routingRulesEngine = new RoutingRulesEngine();
