/**
 * MyNewAppV1 Database Schema — Barrel Re-export
 *
 * All table definitions live in drizzle/tables/*.ts.
 * This file re-exports everything for backwards compatibility.
 */

export * from './tables/users';
export * from './tables/models';
export * from './tables/documents';
export * from './tables/agents';
export * from './tables/automation';
export * from './tables/providers';
export * from './tables/system';
export * from './tables/llm';
export * from './tables/catalog';
export * from './tables/governance';
export * from './tables/enforcement';
export * from './tables/workspace-rbac';
export * from './tables/workspace-modules';
export * from './tables/platform-audit';
export * from './tables/operator-runtime';
export * from './tables/bots';
export * from './tables/hr-core';
export * from './tables/hr-organization';
export * from './tables/hr-staffing';
export * from './tables/hr-recruiting';
export * from './tables/hr-lifecycle';
export * from './tables/hr-time';
export * from './tables/hr-learning';
export * from './tables/hr-performance';
export * from './tables/hr-compensation';
export * from './tables/hr-relations';
export * from './tables/hr-engagement';
export * from './tables/hr-compliance';
export * from './tables/hr-analytics';
export * from './tables/hr-talent';
export * from './tables/hr-role-definitions';
export * from './tables/workforce-assignment';
export * from './tables/organization-management';
export * from './tables/culture-values';
export * from './tables/ps';
export * from './tables/ps-translator';
export * from './tables/graphrag';
export * from './tables/data-acquisition';
export * from './tables/ai-types';
export * from './tables/data-warehouse';
export * from './tables/agent-studio';
// Native Graph Workspace tables (Phase 0.5 / 1.6 / 1.7 / 7 / 11 / 12 / 13).
export * from './tables/agent-studio-vault';
export * from './tables/agent-studio-graph';
export * from './tables/agent-studio-graph-projection';
export * from './tables/agent-studio-graph-promotion';
export * from './tables/agent-studio-graph-skill';
export * from './tables/agent-studio-graph-agent';
export * from './tables/agent-studio-graph-rag';
export * from './tables/agent-studio-graph-quality';
export * from './tables/agent-studio-runtime-alerts';
export * from './tables/agent-studio-publish-targets';
export * from '../server/modules/kgia/schema';
export * from '../server/openrouter/schema';
