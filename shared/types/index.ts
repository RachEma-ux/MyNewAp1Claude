/**
 * SHARED TYPES - GLOBAL EXPORTS
 * Import from here instead of drizzle/schema
 */

// Export all types from agent.ts
export type { 
  Agent, 
  InsertAgent, 
  UpdateAgent, 
  AgentWithRelations,
  AgentHistory, 
  PromotionRequest, 
  AgentProof,
} from './agent';
export type { AgentStatus } from '../agent-lifecycle';
export {
  AGENT_STATUSES,
  AGENT_STATUS_LABELS,
  AGENT_STATUS_BADGE_CLASSES,
  AGENT_STATUS_TRANSITIONS,
  canTransitionAgentStatus,
  getDefaultPromotionTarget,
  isCatalogImportEligible,
  isAgentStatus,
} from '../agent-lifecycle';

// Export enum constants and types (TypeScript handles both)
export {
  AgentLifecycleState,
  AgentOrigin,
  AgentMode,
  GovernanceStatus,
  AgentRoleClass,
} from './agent';

// Re-export the types explicitly for clarity
export type {
  AgentLifecycleState as AgentLifecycleStateType,
  AgentOrigin as AgentOriginType,
  AgentMode as AgentModeType,
  GovernanceStatus as GovernanceStatusType,
  AgentRoleClass as AgentRoleClassType,
} from './agent';
