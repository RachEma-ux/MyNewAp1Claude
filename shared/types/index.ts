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
