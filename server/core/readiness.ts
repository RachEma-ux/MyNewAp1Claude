/**
 * Readiness — Shared deployability assessment for all AI Types.
 *
 * Every domain entity must pass a deployability gate before being eligible
 * for Catalog import. This module provides the shared computation:
 *
 *   1. Generic structural checks (name, status)
 *   2. Domain-specific blocking-reason hooks
 *   3. A unified computeDeployable() function
 *
 * Domain routers call computeDeployable(entity, domainChecks) and get back
 * a DeployabilityResult. They do NOT implement their own ad-hoc checks.
 */

import type { AITypeKind, DomainEntity, DeployabilityResult } from "./domain-entity";
import { LIFECYCLE_STATES } from "./domain-entity";

// ============================================================================
// Domain-Specific Check Hook
// ============================================================================

/**
 * Each domain registers additional blocking-reason checks.
 * Return an array of human-readable strings; empty = no blockers.
 */
export type DomainBlockingCheck = (entity: Record<string, any>) => string[];

// ============================================================================
// Shared Structural Checks
// ============================================================================

function structuralChecks(entity: DomainEntity): string[] {
  const reasons: string[] = [];

  if (!entity.name || entity.name.trim().length === 0) {
    reasons.push(`${entity.kind} name is required`);
  }

  const lifecycle = LIFECYCLE_STATES[entity.kind];
  if (!lifecycle) {
    reasons.push(`Unknown AI type kind: ${entity.kind}`);
    return reasons;
  }

  // Terminal states are never deployable
  if (lifecycle.terminal.includes(entity.status)) {
    reasons.push(`${entity.kind} is in terminal state: ${entity.status}`);
    return reasons;
  }

  // Must be in a deployable state
  if (!lifecycle.deployable.includes(entity.status)) {
    reasons.push(
      `${entity.kind} status "${entity.status}" is not deployable. ` +
      `Required: ${lifecycle.deployable.join(" or ")}`
    );
  }

  return reasons;
}

// ============================================================================
// computeDeployable
// ============================================================================

/**
 * Unified deployability assessment.
 *
 * @param entity - A domain entity mapped to the DomainEntity interface
 * @param domainChecks - Optional domain-specific blocking checks
 * @returns DeployabilityResult with blocking reasons (if any)
 */
export function computeDeployable(
  entity: DomainEntity,
  domainChecks?: DomainBlockingCheck
): DeployabilityResult {
  const reasons: string[] = [];

  // 1. Structural checks
  reasons.push(...structuralChecks(entity));

  // 2. Domain-specific checks
  if (domainChecks) {
    reasons.push(...domainChecks(entity as Record<string, any>));
  }

  return {
    isDeployable: reasons.length === 0,
    blockingReasons: reasons,
    kind: entity.kind,
    entityId: entity.id,
  };
}

// ============================================================================
// Pre-built Domain Check Factories
// ============================================================================

/** Provider-specific blocking reasons */
export function providerBlockingChecks(provider: Record<string, any>): string[] {
  const reasons: string[] = [];
  if (!provider.type) reasons.push("Provider type is required");
  if (!provider.enabled) reasons.push("Provider is disabled");
  return reasons;
}

/** Bot-specific blocking reasons */
export function botBlockingChecks(bot: Record<string, any>): string[] {
  const reasons: string[] = [];
  if (!bot.agentId && !bot.llmId) {
    reasons.push("Bot must be bound to an agent or LLM");
  }
  if (!bot.channels || (Array.isArray(bot.channels) && bot.channels.length === 0)) {
    reasons.push("Bot must have at least one channel configured");
  }
  return reasons;
}

/** Model-specific blocking reasons */
export function modelBlockingChecks(model: Record<string, any>): string[] {
  const reasons: string[] = [];
  if (!model.modelType) reasons.push("Model type is required");
  return reasons;
}

/** Agent-specific blocking reasons */
export function agentBlockingChecks(agent: Record<string, any>): string[] {
  const reasons: string[] = [];
  if (!agent.systemPrompt) reasons.push("Agent system prompt is required");
  if (!agent.modelId) reasons.push("Agent must have a model assigned");
  if (!agent.roleClass) reasons.push("Agent role class is required");
  return reasons;
}

/** LLM-specific blocking reasons */
export function llmBlockingChecks(llm: Record<string, any>): string[] {
  const reasons: string[] = [];
  if (!llm.role) reasons.push("LLM role is required");
  if (llm.archived) reasons.push("LLM is archived");
  return reasons;
}
